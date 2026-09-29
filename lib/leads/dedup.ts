/**
 * Deduplicador do Minerador de Leads (Req. 9) — módulo puro e isomórfico
 * (sem imports de Node, Prisma ou módulos de servidor).
 *
 * - `matchCompany`: encontra a Empresa existente equivalente à encontrada (Req. 9.1–9.3).
 * - `mergeCompanyFields`: calcula o patch de campos cadastrais (Req. 9.4).
 * - `ingestInMemory`: espelha a ingestão do repositório (dedup + mescla + vínculo único por
 *   par (runId, companyId)) sobre uma base em memória, usada nos testes de idempotência (Req. 9.6, 9.10).
 */
import { haversineMeters, isValidCoord } from './geo';
import { normalizeCompanyName } from './text';
import type { FoundCompany } from './types';

/** Distância máxima (metros, inclusiva) para o critério de nome + proximidade (Req. 9.2). */
export const DEDUP_MAX_DISTANCE_M = 100;

/** Chaves usadas na deduplicação. */
export interface CompanyKey {
  id?: string;
  googlePlaceId: string | null;
  osmId: string | null;
  cnpj: string | null;
  nomeNormalizado: string;
  latitude: number | null;
  longitude: number | null;
  /**
   * `osmId`s adicionais fundidos na Empresa (tabela `CompanyAlias`, source OSM).
   * Casam com o `osmId` encontrado com a mesma prioridade do `osmId` da Empresa.
   */
  aliases?: string[];
}

/** Ordem de precedência dos identificadores (Req. 9.1). */
export const IDENTIFIER_FIELDS = ['googlePlaceId', 'osmId', 'cnpj'] as const;
export type IdentifierField = (typeof IDENTIFIER_FIELDS)[number];

/** Campos cadastrais atualizáveis quando a empresa já existe (Req. 9.4). */
export const CADASTRAL_FIELDS = [
  'nome',
  'endereco',
  'bairro',
  'cidade',
  'uf',
  'telefone',
  'website',
  'latitude',
  'longitude',
  'marcaRede',
] as const;
export type CadastralField = (typeof CADASTRAL_FIELDS)[number];

/**
 * Valor "vazio": null/undefined, string só com espaços ou número não finito.
 * Vazios são ignorados nos identificadores e nunca apagam um valor na mescla.
 */
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return !Number.isFinite(v);
  return false;
}

const trimmedOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

function identifierOf(k: CompanyKey, field: IdentifierField): string | null {
  return trimmedOrNull(k[field]);
}

/** A Empresa `e` possui o identificador `value` em `field` (para `osmId`, também nos aliases). */
function hasIdentifier(e: CompanyKey, field: IdentifierField, value: string): boolean {
  if (identifierOf(e, field) === value) return true;
  return field === 'osmId' && (e.aliases ?? []).some((a) => trimmedOrNull(a) === value);
}

/**
 * Retorna a Empresa existente considerada a mesma que `found`, ou `null`.
 *
 * 1) Identificadores preenchidos na ordem googlePlaceId > osmId > cnpj; vazios são ignorados
 *    e a busca para no primeiro identificador que coincidir (Req. 9.1). O `osmId` encontrado
 *    casa também com os `aliases` das existentes, com a mesma prioridade do `osmId`.
 * 2) Senão, mesmo Nome_Normalizado não vazio, ambas com coordenadas válidas e distância
 *    ≤ 100 m; entre várias candidatas vence a de menor distância (empate: a primeira da lista)
 *    (Req. 9.2, 9.3).
 */
export function matchCompany(found: CompanyKey, existing: readonly CompanyKey[]): CompanyKey | null {
  for (const field of IDENTIFIER_FIELDS) {
    const value = identifierOf(found, field);
    if (value === null) continue;
    const hit = existing.find((e) => hasIdentifier(e, field, value));
    if (hit) return hit;
  }

  const nome = found.nomeNormalizado;
  if (!nome || !isValidCoord(found.latitude, found.longitude)) return null;
  const origin = { lat: found.latitude, lng: found.longitude as number };

  let best: CompanyKey | null = null;
  let bestDist = Infinity;
  for (const e of existing) {
    if (e.nomeNormalizado !== nome) continue;
    if (!isValidCoord(e.latitude, e.longitude)) continue;
    const d = haversineMeters(origin, { lat: e.latitude, lng: e.longitude as number });
    if (d <= DEDUP_MAX_DISTANCE_M && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Patch de campos cadastrais: inclui um campo somente quando o valor recebido não é vazio
 * e difere do atual. Valor vazio nunca apaga o atual. Campos fora de `CADASTRAL_FIELDS`
 * (assignedTo, createdAt, identificadores…) nunca entram no patch (Req. 9.4).
 * Restrição `T extends object` (mais ampla que `Record<string, unknown>`) para aceitar
 * interfaces, que não têm assinatura de índice implícita.
 */
export function mergeCompanyFields<T extends object>(
  current: T,
  incoming: Partial<T>,
): Partial<T> {
  const patch: Partial<T> = {};
  for (const field of CADASTRAL_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;
    const next = incoming[field as keyof T];
    if (isEmptyValue(next)) continue;
    if (Object.is(current[field as keyof T], next)) continue;
    patch[field as keyof T] = next;
  }
  return patch;
}

/** Converte a empresa encontrada na Fonte_OSM em chave de deduplicação. */
export function toCompanyKey(found: FoundCompany): CompanyKey {
  return {
    googlePlaceId: null,
    osmId: isEmptyValue(found.osmId) ? null : found.osmId.trim(),
    cnpj: null,
    nomeNormalizado: normalizeCompanyName(found.nome),
    latitude: found.latitude,
    longitude: found.longitude,
  };
}

// ---------------------------------------------------------------------------
// Ingestão em memória (espelho do repositório para testes de idempotência)
// ---------------------------------------------------------------------------

/** Empresa na base em memória (subconjunto de `Company`). */
export interface InMemoryCompany extends CompanyKey {
  id: string;
  nome: string;
  nicho: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  marcaRede: string | null;
  assignedTo: string | null;
}

/** Vínculo empresa ↔ mineração (subconjunto de `MiningRunCompany`). */
export interface InMemoryLink {
  runId: string;
  companyId: string;
  isNew: boolean;
  /** Nicho da 1ª ocorrência nesta mineração. */
  nicho: string;
}

export interface InMemoryBase {
  companies: InMemoryCompany[];
  links: InMemoryLink[];
}

const nullIfEmpty = <V>(v: V | null | undefined): V | null => (isEmptyValue(v) ? null : (v as V));

function nextId(used: Set<string>): string {
  let n = used.size + 1;
  while (used.has(`mem-${n}`)) n++;
  const id = `mem-${n}`;
  used.add(id);
  return id;
}

/**
 * Aplica o resultado de busca `found` à base, sem mutar a entrada:
 * - empresa equivalente (matchCompany) → aplica `mergeCompanyFields`, recalcula
 *   `nomeNormalizado` se o nome mudou e preenche identificadores ainda vazios; se a empresa
 *   já tem outro `osmId`, o `osmId` encontrado vira alias (`aliases`); vínculo `isNew = false`;
 * - senão → cria a empresa (strings vazias viram `null`); vínculo `isNew = true`;
 * - vínculo único por (runId, companyId): ocorrências repetidas mantêm o vínculo (e o `isNew`)
 *   da 1ª ocorrência (Req. 9.6), como o `ON CONFLICT DO NOTHING` do repositório.
 * IDs novos são determinísticos (`mem-N`), permitindo comparar execuções.
 */
export function ingestInMemory(
  base: InMemoryBase,
  found: readonly FoundCompany[],
  runId: string,
): InMemoryBase {
  const companies = base.companies.map((c) => ({ ...c }));
  const links = base.links.map((l) => ({ ...l }));
  const usedIds = new Set(companies.map((c) => c.id));
  const linked = new Set(links.filter((l) => l.runId === runId).map((l) => l.companyId));

  for (const f of found) {
    const key = toCompanyKey(f);
    const match = matchCompany(key, companies) as InMemoryCompany | null;

    let company: InMemoryCompany;
    let isNew: boolean;
    if (match) {
      const incoming: Partial<InMemoryCompany> = {
        nome: f.nome,
        endereco: f.endereco,
        bairro: f.bairro,
        cidade: f.cidade,
        uf: f.uf,
        telefone: f.telefone,
        website: f.website,
        latitude: f.latitude,
        longitude: f.longitude,
        marcaRede: f.marcaRede,
      };
      Object.assign(match, mergeCompanyFields(match, incoming));
      match.nomeNormalizado = normalizeCompanyName(match.nome);
      // Identificador já preenchido nunca muda; vazio pode ser preenchido (sem conflito:
      // se outra empresa tivesse o mesmo valor, matchCompany a teria escolhido antes).
      for (const field of IDENTIFIER_FIELDS) {
        if (match[field] === null && key[field] !== null) match[field] = key[field];
      }
      // Casou por critério que não o próprio osmId e a empresa já tem outro osmId:
      // registra o osmId encontrado como alias, para que a próxima ingestão case por ele
      // mesmo depois que a mescla mover nome/coordenadas (Req. 9, idempotência).
      if (key.osmId !== null && !hasIdentifier(match, 'osmId', key.osmId)) {
        match.aliases = [...(match.aliases ?? []), key.osmId];
      }
      company = match;
      isNew = false;
    } else {
      company = {
        id: nextId(usedIds),
        googlePlaceId: key.googlePlaceId,
        osmId: key.osmId,
        cnpj: key.cnpj,
        nome: f.nome,
        nomeNormalizado: key.nomeNormalizado,
        nicho: f.nicho,
        endereco: nullIfEmpty(f.endereco),
        bairro: nullIfEmpty(f.bairro),
        cidade: nullIfEmpty(f.cidade),
        uf: nullIfEmpty(f.uf),
        telefone: nullIfEmpty(f.telefone),
        website: nullIfEmpty(f.website),
        latitude: nullIfEmpty(f.latitude),
        longitude: nullIfEmpty(f.longitude),
        marcaRede: nullIfEmpty(f.marcaRede),
        assignedTo: null,
      };
      companies.push(company);
      isNew = true;
    }

    if (!linked.has(company.id)) {
      linked.add(company.id);
      links.push({ runId, companyId: company.id, isNew, nicho: f.nicho });
    }
  }

  return { companies, links };
}
