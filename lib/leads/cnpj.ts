/**
 * Validador_CNPJ (numérico e alfanumérico) e regras de aplicação do CNPJ descoberto no site.
 * Módulo puro e isomórfico: sem rede, relógio, estado global ou aleatoriedade (Req. 11, 12.3, 12.4, 12.7).
 */
import { htmlSearchText } from './html';
import type { CandidateReason, CnpjCandidate, CnpjData, CnpjOrigin } from './types';

// ---------------------------------------------------------------------------
// Validação e formatação (Req. 11.1, 11.2)
// ---------------------------------------------------------------------------

/** Remove `.`, `/`, `-` e espaços e converte para maiúsculas. Não valida. */
export function normalizeCnpj(raw: string): string {
  return raw.replace(/[./\-\s]/g, '').toUpperCase();
}

const BASE_RE = /^[0-9A-Z]{12}$/;
const CNPJ_RE = /^[0-9A-Z]{12}[0-9]{2}$/;

function checkDigit(chars: string): number {
  // Pesos 2..9 da direita para a esquerda, reiniciando em 2 após o 9.
  let sum = 0;
  let weight = 2;
  for (let i = chars.length - 1; i >= 0; i--) {
    sum += (chars.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/**
 * Dígitos verificadores (2 caracteres) de uma base de 12 posições `[0-9A-Z]`.
 * Valor de cada caractere = código ASCII − 48; módulo 11, resto < 2 → 0.
 * Lança se a base não tiver a forma esperada.
 */
export function cnpjCheckDigits(base12: string): string {
  const base = base12.toUpperCase();
  if (!BASE_RE.test(base)) throw new Error('Base de CNPJ inválida');
  const d1 = checkDigit(base);
  const d2 = checkDigit(base + String(d1));
  return `${d1}${d2}`;
}

/** Req. 11.1: 14 chars, `[0-9A-Z]{12}[0-9]{2}`, não todos iguais, DVs conferem. */
export function isValidCnpj(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const c = normalizeCnpj(raw);
  if (!CNPJ_RE.test(c)) return false;
  if (/^(.)\1{13}$/.test(c)) return false;
  return cnpjCheckDigits(c.slice(0, 12)) === c.slice(12);
}

/** `AA.AAA.AAA/AAAA-DD`. Aceita entrada não normalizada; lança se inválido. */
export function formatCnpj(valid: string): string {
  const c = normalizeCnpj(valid);
  if (!isValidCnpj(c)) throw new Error('CNPJ inválido');
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** Como `formatCnpj`, mas devolve o valor original (não lança) quando o CNPJ é inválido. */
export function safeFormatCnpj(cnpj: string): string {
  try {
    return formatCnpj(cnpj);
  } catch {
    return cnpj;
  }
}

// ---------------------------------------------------------------------------
// Extração do HTML (Req. 11.3)
// ---------------------------------------------------------------------------

const CNPJ_SEARCH_RE = /\b[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?[0-9]{2}\b/gi;

/** CNPJs válidos distintos (normalizados) no texto visível + atributos, na ordem da primeira ocorrência. */
export function extractCnpjs(html: string): string[] {
  if (!html) return [];
  const text = htmlSearchText(html);
  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(CNPJ_SEARCH_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const c = normalizeCnpj(m[0]);
    if (seen.has(c) || !isValidCnpj(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plano e resolução (Req. 11.4, 11.5, 11.9, 12.3, 12.4, 12.7)
// ---------------------------------------------------------------------------

/** Desfecho da consulta à BrasilAPI (o cliente fica em `brasilapi.ts`). */
export type CnpjLookupOutcome =
  | { ok: true; data: CnpjData }
  | { ok: false; reason: 'NAO_ENCONTRADO' | 'INDISPONIVEL' };

export type CnpjPlan =
  | { kind: 'NONE' }
  | { kind: 'APPLY_SITE'; cnpj: string }
  | { kind: 'CANDIDATES'; candidates: CnpjCandidate[] };

export const CNPJ_STATUS = {
  NAO_ENCONTRADO: 'CNPJ não encontrado na Receita',
  INDISPONIVEL: 'Consulta à Receita indisponível',
  UF_DIVERGENTE: 'CNPJ do site é de outra UF (possível matriz ou franqueadora)',
} as const;

function distinctValid(found: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of found) {
    const c = normalizeCnpj(raw);
    if (seen.has(c) || !isValidCnpj(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

const asCandidates = (list: string[], motivo: CandidateReason): CnpjCandidate[] =>
  list.map((cnpj) => ({ cnpj, motivo }));

/**
 * Decide o que fazer com os CNPJs encontrados no site. Precedência:
 * 1. Empresa com CNPJ `MANUAL` → mantido; os demais viram `MANUAL_PRESERVADO` (Req. 11.9).
 * 2. Consulta desabilitada → nada aplicado; todos viram `CONSULTA_DESABILITADA` (Req. 12.7).
 * 3. Dois ou mais distintos → todos `MULTIPLOS` (Req. 11.5).
 * 4. Exatamente um e Empresa sem CNPJ → `APPLY_SITE` (Req. 11.4).
 * 5. Empresa já com CNPJ `SITE` → mantido; um outro encontrado vira `MULTIPLOS`.
 * O CNPJ já aplicado à Empresa nunca entra nos candidatos.
 */
export function planCnpj(
  company: { cnpj: string | null; cnpjOrigem: CnpjOrigin | null; cnpjCandidatos: CnpjCandidate[] },
  found: readonly string[],
  opts: { enrich: boolean },
): CnpjPlan {
  const current = company.cnpj ? normalizeCnpj(company.cnpj) : null;
  const all = distinctValid(found);
  const others = all.filter((c) => c !== current);
  if (others.length === 0) return { kind: 'NONE' };

  if (current && company.cnpjOrigem === 'MANUAL') {
    return { kind: 'CANDIDATES', candidates: asCandidates(others, 'MANUAL_PRESERVADO') };
  }
  if (!opts.enrich) {
    return { kind: 'CANDIDATES', candidates: asCandidates(others, 'CONSULTA_DESABILITADA') };
  }
  if (all.length >= 2) {
    return { kind: 'CANDIDATES', candidates: asCandidates(others, 'MULTIPLOS') };
  }
  if (!current) return { kind: 'APPLY_SITE', cnpj: others[0] };
  return { kind: 'CANDIDATES', candidates: asCandidates(others, 'MULTIPLOS') };
}

function sameUf(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // sem UF de um dos lados não há divergência comprovada
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/**
 * Depois da BrasilAPI, para um CNPJ de origem `SITE`:
 * ok com UF igual → aplica com os dados; UF divergente → desfaz, candidato `UF_DIVERGENTE` (Req. 12.4);
 * 404 → desfaz, candidato `NAO_ENCONTRADO` (Req. 12.3); indisponível → aplica sem dados (Req. 12.5).
 */
export function resolveSiteCnpj(
  plan: { cnpj: string },
  companyUf: string | null,
  lookup: CnpjLookupOutcome,
): { apply: boolean; data: CnpjData | null; candidate: CnpjCandidate | null; status: string | null } {
  const cnpj = normalizeCnpj(plan.cnpj);
  if (lookup.ok) {
    if (!sameUf(companyUf, lookup.data.uf)) {
      return { apply: false, data: null, candidate: { cnpj, motivo: 'UF_DIVERGENTE' }, status: CNPJ_STATUS.UF_DIVERGENTE };
    }
    return { apply: true, data: lookup.data, candidate: null, status: null };
  }
  if (lookup.reason === 'NAO_ENCONTRADO') {
    return { apply: false, data: null, candidate: { cnpj, motivo: 'NAO_ENCONTRADO' }, status: CNPJ_STATUS.NAO_ENCONTRADO };
  }
  return { apply: true, data: null, candidate: null, status: CNPJ_STATUS.INDISPONIVEL };
}

/** Junta candidatos sem repetir CNPJ (o primeiro vence); nunca inclui o CNPJ aplicado. */
export function mergeCandidates(
  a: readonly CnpjCandidate[],
  b: readonly CnpjCandidate[],
  applied: string | null,
): CnpjCandidate[] {
  const skip = applied ? normalizeCnpj(applied) : null;
  const out: CnpjCandidate[] = [];
  const seen = new Set<string>();
  for (const cand of [...a, ...b]) {
    const c = normalizeCnpj(cand.cnpj);
    if (c === skip || seen.has(c)) continue;
    seen.add(c);
    out.push({ ...cand, cnpj: c });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistência (coluna Json `Company.cnpjCandidatos`)
// ---------------------------------------------------------------------------

const REASONS: ReadonlySet<string> = new Set<CandidateReason>([
  'MULTIPLOS',
  'CONFLITO',
  'UF_DIVERGENTE',
  'NAO_ENCONTRADO',
  'MANUAL_PRESERVADO',
  'CONSULTA_DESABILITADA',
]);

/** Valor JSON simples (sem `undefined`) para gravar na coluna. */
export function serializeCandidates(list: readonly CnpjCandidate[]): Array<Record<string, string>> {
  return list.map((c) => {
    const o: Record<string, string> = { cnpj: c.cnpj, motivo: c.motivo };
    if (c.conflitoCompanyId !== undefined) o.conflitoCompanyId = c.conflitoCompanyId;
    return o;
  });
}

/** Leitura defensiva: descarta itens fora da forma; nunca lança. */
export function parseCandidates(value: unknown): CnpjCandidate[] {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out: CnpjCandidate[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const { cnpj, motivo, conflitoCompanyId } = item as Record<string, unknown>;
    if (typeof cnpj !== 'string' || !isValidCnpj(cnpj)) continue;
    if (typeof motivo !== 'string' || !REASONS.has(motivo)) continue;
    if (conflitoCompanyId !== undefined && typeof conflitoCompanyId !== 'string') continue;
    const cand: CnpjCandidate = { cnpj: normalizeCnpj(cnpj), motivo: motivo as CandidateReason };
    if (typeof conflitoCompanyId === 'string') cand.conflitoCompanyId = conflitoCompanyId;
    out.push(cand);
  }
  return out;
}
