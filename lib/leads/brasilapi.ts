/**
 * Enriquecedor_CNPJ — BrasilAPI `GET /api/cnpj/v1/{cnpj}` (Req. 12, 2.3, 20.4).
 *
 * - `parseBrasilApi`: copia só os campos de `CnpjData` (descarta QSA, e-mail, telefone etc.). Puro.
 * - `needsLookup`: decide se os Dados_CNPJ precisam de nova consulta (90 dias). Puro.
 * - `lookupCnpj`: consulta com limitador (1 req/s), 1 retentativa em 429/5xx/timeout e
 *   respeito ao `deadline` da Empresa. Nunca lança.
 *
 * O host é fixo (`BRASILAPI_HOST`); o cliente real (`deps.ts`) monta o path com
 * `brasilApiPath`, que codifica o CNPJ como segmento.
 */
import { BRASILAPI_RETRY_DELAY_MS, BRASILAPI_TIMEOUT_MS, CNPJ_DATA_DAYS } from './config';
import type { CnpjLookupOutcome } from './cnpj';
import type { RateLimiter } from './sources/rate-limit';
import type { CnpjData } from './types';
import { isSafePathSegment } from './net/path-segment';

export type { CnpjLookupOutcome } from './cnpj';

export interface BrasilApiHttp {
  /** Resolve `{ status, json }`; rejeita em erro de rede ou timeout (aborta no próprio `timeoutMs`). */
  getCnpj(cnpj: string, timeoutMs: number): Promise<{ status: number; json: unknown }>;
}

export interface BrasilApiDeps {
  http: BrasilApiHttp;
  limiter: RateLimiter;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}

export const BRASILAPI_HOST = 'https://brasilapi.com.br';

/** Path relativo ao host fixo; o CNPJ vai como segmento codificado (Req. 20.4). */
export function brasilApiPath(cnpj: string): string {
  return `/api/cnpj/v1/${encodeURIComponent(cnpj)}`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/** Só os campos de CnpjData; descarta QSA, e-mail, telefone etc. (Req. 12.2). Puro. */
export function parseBrasilApi(json: unknown, cnpj: string, now: Date): CnpjData | null {
  const r = asRecord(json);
  if (!r) return null;
  return {
    cnpj,
    razaoSocial: str(r.razao_social),
    nomeFantasia: str(r.nome_fantasia),
    situacao: str(r.descricao_situacao_cadastral),
    situacaoData: str(r.data_situacao_cadastral),
    cnaeCodigo: str(r.cnae_fiscal),
    cnaeDescricao: str(r.cnae_fiscal_descricao),
    porte: str(r.porte),
    naturezaJuridica: str(r.natureza_juridica),
    mei: bool(r.opcao_pelo_mei),
    inicioAtividade: str(r.data_inicio_atividade),
    municipio: str(r.municipio),
    uf: str(r.uf),
    consultadoEm: now.toISOString(),
  };
}

const DAY_MS = 86_400_000;

/** Precisa consultar? ausente, de outro CNPJ ou consultado há mais de 90 dias (Req. 12.1). Puro. */
export function needsLookup(
  c: { cnpjDadosCnpj: string | null; cnpjConsultadoEm: Date | string | null },
  cnpj: string,
  now: Date,
): boolean {
  if (!c.cnpjDadosCnpj || c.cnpjDadosCnpj !== cnpj) return true;
  if (c.cnpjConsultadoEm == null) return true;
  const t = new Date(c.cnpjConsultadoEm).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > CNPJ_DATA_DAYS * DAY_MS;
}

type Attempt = CnpjLookupOutcome | 'RETRY' | 'DEADLINE';

const INDISPONIVEL: CnpjLookupOutcome = { ok: false, reason: 'INDISPONIVEL' };

/** Uma tentativa passando pelo limitador; não envia se o início agendado passar do `deadline`. */
async function attempt(cnpj: string, deps: BrasilApiDeps, deadline: number | undefined): Promise<Attempt> {
  try {
    return await deps.limiter.schedule<Attempt>(async () => {
      let timeoutMs = BRASILAPI_TIMEOUT_MS;
      if (deadline !== undefined) {
        const remaining = deadline - deps.now().getTime();
        if (remaining <= 0) return 'DEADLINE';
        timeoutMs = Math.min(timeoutMs, remaining);
      }
      let res: { status: number; json: unknown };
      try {
        res = await deps.http.getCnpj(cnpj, timeoutMs);
      } catch {
        return 'RETRY'; // rede/timeout
      }
      if (res.status === 404) return { ok: false, reason: 'NAO_ENCONTRADO' };
      if (res.status === 429 || res.status >= 500) return 'RETRY';
      if (res.status < 200 || res.status >= 300) return INDISPONIVEL;
      const data = parseBrasilApi(res.json, cnpj, deps.now());
      return data ? { ok: true, data } : INDISPONIVEL;
    });
  } catch {
    return INDISPONIVEL;
  }
}

/** 404 → NAO_ENCONTRADO; 429/5xx/timeout → 1 retentativa após 2 s → INDISPONIVEL; cada tentativa passa pelo limitador (Req. 2.3, 12.5). Nunca lança. */
export async function lookupCnpj(
  cnpj: string,
  deps: BrasilApiDeps,
  opts: { deadline?: number } = {},
): Promise<CnpjLookupOutcome> {
  // CNPJ vazio, '.' ou '..' viraria segmento de ponto: nada é enviado (Req. 20.4).
  if (!isSafePathSegment(cnpj)) return INDISPONIVEL;
  const first = await attempt(cnpj, deps, opts.deadline);
  if (first === 'DEADLINE') return INDISPONIVEL;
  if (first !== 'RETRY') return first;

  if (opts.deadline !== undefined && deps.now().getTime() + BRASILAPI_RETRY_DELAY_MS >= opts.deadline) {
    return INDISPONIVEL;
  }
  try {
    await deps.sleep(BRASILAPI_RETRY_DELAY_MS);
  } catch {
    return INDISPONIVEL;
  }
  const second = await attempt(cnpj, deps, opts.deadline);
  return second === 'RETRY' || second === 'DEADLINE' ? INDISPONIVEL : second;
}
