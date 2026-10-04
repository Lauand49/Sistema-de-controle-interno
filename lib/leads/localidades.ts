/**
 * Cidades por UF (T2), via API de Localidades do IBGE — consultada SEMPRE pelo servidor, com
 * cache em memória. URL oficial (documentação em servicodados.ibge.gov.br/api/docs/localidades):
 *   GET https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios?orderBy=nome
 * Resposta: array de municípios `{ id, nome, ... }`. Não exige chave.
 *
 * Também define os schemas das rotas de localidades. Sem Prisma e sem leitura direta de rede:
 * o `fetch` é injetável, o que permite testar offline.
 */
import { z } from 'zod';
import { UFS } from './config';
import { MSG } from './filters';
import { createCachedLoader, type LoadResult } from './ttl-cache';

export const IBGE_LOCALIDADES_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades';
export const IBGE_TIMEOUT_MS = 8_000;
/** Municípios mudam raramente: 24 h em memória. */
export const CITIES_TTL_MS = 24 * 60 * 60 * 1000;
/** Falha do IBGE: tenta de novo só depois de 1 min (a UI já permite digitar livremente). */
export const CITIES_NEGATIVE_TTL_MS = 60 * 1000;

export const LOCALIDADE_TEXT_MAX = 100;

const UF_SET: ReadonlySet<string> = new Set(UFS);

export interface City {
  id: number;
  nome: string;
}

// ---------------------------------------------------------------------------
// Schemas das rotas (UF validada no servidor)
// ---------------------------------------------------------------------------

const ufField = z
  .string({ required_error: MSG.uf, invalid_type_error: MSG.uf })
  .refine((uf) => UF_SET.has(uf), MSG.uf);

export const cidadesQuerySchema = z.object({ uf: ufField });

export const bairrosQuerySchema = z.object({
  uf: ufField,
  cidade: z
    .string({ required_error: MSG.cidade, invalid_type_error: MSG.cidade })
    .trim()
    .min(1, MSG.cidade)
    .max(LOCALIDADE_TEXT_MAX, MSG.cidade),
});

// ---------------------------------------------------------------------------
// IBGE
// ---------------------------------------------------------------------------

/** `.../estados/{UF}/municipios?orderBy=nome`; `uf` precisa ter sido validada (segmento de path). */
export function ibgeCitiesUrl(uf: string): string {
  return `${IBGE_LOCALIDADES_URL}/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`;
}

/** Lê a resposta do IBGE descartando itens fora da forma; ordena em pt-BR e remove repetidos. */
export function parseIbgeCities(json: unknown): City[] {
  if (!Array.isArray(json)) return [];
  const seen = new Set<number>();
  const out: City[] = [];
  for (const item of json) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, nome } = item as { id?: unknown; nome?: unknown };
    if (typeof id !== 'number' || !Number.isInteger(id) || typeof nome !== 'string') continue;
    const name = nome.trim();
    if (name === '' || name.length > LOCALIDADE_TEXT_MAX || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, nome: name });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type CitiesResult = { ok: true; items: City[] } | { ok: false };

export interface CitiesService {
  list(uf: string): Promise<CitiesResult>;
}

export interface CitiesServiceOptions {
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  ttlMs?: number;
  negativeTtlMs?: number;
}

export function createCitiesService(opts: CitiesServiceOptions = {}): CitiesService {
  const fetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i));

  const load = async (uf: string): Promise<LoadResult<City[]>> => {
    const res = await fetchFn(ibgeCitiesUrl(uf), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(IBGE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { ok: false };
    }
    const items = parseIbgeCities(await res.json());
    // Lista vazia de uma UF válida indica resposta estranha: trata como indisponível.
    return items.length > 0 ? { ok: true, value: items } : { ok: false };
  };

  const cached = createCachedLoader<City[]>(load, {
    ttlMs: opts.ttlMs ?? CITIES_TTL_MS,
    negativeTtlMs: opts.negativeTtlMs ?? CITIES_NEGATIVE_TTL_MS,
    maxEntries: 40,
    now: opts.now,
  });

  return {
    async list(uf) {
      if (!UF_SET.has(uf)) return { ok: false };
      const r = await cached(uf);
      return r.ok ? { ok: true, items: r.value } : { ok: false };
    },
  };
}
