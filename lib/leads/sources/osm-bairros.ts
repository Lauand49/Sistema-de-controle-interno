/**
 * Bairros de uma cidade a partir do OpenStreetMap (T2): `place=suburb|neighbourhood|quarter`
 * dentro da área da cidade.
 *
 * Reaproveita a infraestrutura da Fonte_OSM: a cidade é geocodificada pelo Nominatim com o mesmo
 * limitador (1 req/s) e timeout de `geocode`, e a consulta vai ao mesmo Overpass. Resultado em
 * cache de memória (TTL longo); falhas têm cache curto. A lista é só sugestão para o
 * autocomplete: lista vazia ou falha nunca bloqueiam a mineração (digitação livre).
 */
import { OSM_USER_AGENT } from '../config';
import { normalizeText } from '../text';
import { createCachedLoader, type LoadResult } from '../ttl-cache';
import { OVERPASS_URL, geocodeText, type OsmDeps, type SearchArea } from './osm';

export const NEIGHBORHOOD_PLACE_TYPES = ['suburb', 'neighbourhood', 'quarter'] as const;
export const NEIGHBORHOODS_MAX = 1500;
const NAME_MAX = 100;
/** Orçamento da consulta ao Overpass (o usuário está esperando o autocomplete). */
export const NEIGHBORHOODS_TIMEOUT_MS = 20_000;
const OVERPASS_QUERY_TIMEOUT_S = 15;

/** Bairros mudam pouco: 7 dias em memória. */
export const NEIGHBORHOODS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NEIGHBORHOODS_NEGATIVE_TTL_MS = 2 * 60 * 1000;

export function buildNeighborhoodsQuery(area: SearchArea): string {
  const filter = area.kind === 'area' ? '(area.a)' : `(${area.south},${area.west},${area.north},${area.east})`;
  const lines = [`[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_S}];`];
  if (area.kind === 'area') lines.push(`area(id:${area.areaId})->.a;`);
  lines.push(
    '(',
    `  nwr["place"~"^(${NEIGHBORHOOD_PLACE_TYPES.join('|')})$"]["name"]${filter};`,
    ');',
    'out tags;',
  );
  return lines.join('\n');
}

/** Nomes únicos (sem acento/caixa) e ordenados em pt-BR; descarta elementos sem nome utilizável. */
export function parseNeighborhoodNames(elements: unknown): string[] {
  if (!Array.isArray(elements)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const el of elements) {
    const tags = typeof el === 'object' && el !== null ? (el as { tags?: unknown }).tags : undefined;
    const name = typeof tags === 'object' && tags !== null ? (tags as Record<string, unknown>).name : undefined;
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    const key = normalizeText(trimmed);
    if (key === '' || trimmed.length > NAME_MAX || seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }
  return names.sort((a, b) => a.localeCompare(b, 'pt-BR')).slice(0, NEIGHBORHOODS_MAX);
}

export type NeighborhoodsResult = { ok: true; items: string[] } | { ok: false };

export interface NeighborhoodsService {
  list(uf: string, cidade: string): Promise<NeighborhoodsResult>;
}

export interface NeighborhoodsServiceOptions {
  now?: () => number;
  ttlMs?: number;
  negativeTtlMs?: number;
}

export function createNeighborhoodsService(
  deps: OsmDeps,
  opts: NeighborhoodsServiceOptions = {},
): NeighborhoodsService {
  // A chave do cache usa a cidade normalizada; o nome como digitado (com acento) fica
  // guardado à parte para a geocodificação do Nominatim.
  const originals = new Map<string, string>();
  const load = async (key: string): Promise<LoadResult<string[]>> => {
    const [uf, normalizada] = JSON.parse(key) as [string, string];
    const cidade = originals.get(key) ?? normalizada;
    const geo = await geocodeText(`${cidade}, ${uf}`, deps);
    if (!geo.ok) {
      // Cidade que o Nominatim não conhece: lista vazia (digitação livre), sem tratar como erro.
      return geo.reason === 'NAO_ENCONTRADO' ? { ok: true, value: [] } : { ok: false };
    }
    try {
      const body = new URLSearchParams({ data: buildNeighborhoodsQuery(geo.area) }).toString();
      const res = await deps.http.getJson(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'User-Agent': OSM_USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeoutMs: NEIGHBORHOODS_TIMEOUT_MS,
        body,
      });
      const elements = typeof res === 'object' && res !== null ? (res as { elements?: unknown }).elements : undefined;
      if (!Array.isArray(elements)) return { ok: false };
      return { ok: true, value: parseNeighborhoodNames(elements) };
    } catch {
      return { ok: false };
    }
  };

  const cached = createCachedLoader<string[]>(load, {
    ttlMs: opts.ttlMs ?? NEIGHBORHOODS_TTL_MS,
    negativeTtlMs: opts.negativeTtlMs ?? NEIGHBORHOODS_NEGATIVE_TTL_MS,
    maxEntries: 300,
    now: opts.now,
  });

  return {
    async list(uf, cidade) {
      const key = JSON.stringify([uf, normalizeText(cidade)]);
      if (originals.size > 300) originals.clear();
      originals.set(key, cidade.trim());
      const r = await cached(key);
      return r.ok ? { ok: true, items: r.value } : { ok: false };
    },
  };
}
