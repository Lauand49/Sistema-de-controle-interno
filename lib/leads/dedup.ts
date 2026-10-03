/**
 * Deduplicador do Minerador de Leads (Req. 9) — módulo puro e isomórfico
 * (sem imports de Node, Prisma ou módulos de servidor).
 *
 * - `matchCompany`: encontra a Empresa existente equivalente à encontrada (Req. 9.1–9.3).
 * - `mergeCompanyFields`: calcula o patch de campos cadastrais (Req. 9.4).
 * - `ingestInMemory`: espelha a ingestão do repositório (dedup + mescla + vínculo único por
 *   par (runId, companyId)) sobre uma base em memória, usada nos testes de idempotência (Req. 9.6, 9.10).
 * - Etapa 3 (Req. 5, 4.7): aliases `GOOGLE` (`googleAliases`), chave efetiva com o Cache_Google
 *   válido (`effectiveKey`), fonte derivada (`companySource`, `effectiveSource`) e
 *   `ingestSourcesInMemory`, modelo de referência da ingestão combinada Google + OSM.
 */
import { GOOGLE_CACHE_DAYS } from './config';
import { isCacheValid, type GoogleCacheRow } from './display';
import { haversineMeters, isValidCoord } from './geo';
import { normalizeCompanyName } from './text';
import type { FoundCompany, GooglePlace, SourceMode } from './types';

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
  /**
   * Place_IDs adicionais fundidos na Empresa (`CompanyAlias`, source GOOGLE). Casam com o
   * Place_ID encontrado com a mesma prioridade do `googlePlaceId` da Empresa (Req. 5.3).
   */
  googleAliases?: string[];
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

/**
 * A Empresa `e` possui o identificador `value` em `field`: para `osmId`, também nos `aliases`;
 * para `googlePlaceId`, também nos `googleAliases` (Req. 5.3).
 */
function hasIdentifier(e: CompanyKey, field: IdentifierField, value: string): boolean {
  if (identifierOf(e, field) === value) return true;
  const extra = field === 'osmId' ? e.aliases : field === 'googlePlaceId' ? e.googleAliases : undefined;
  return (extra ?? []).some((a) => trimmedOrNull(a) === value);
}

/**
 * Retorna a Empresa existente considerada a mesma que `found`, ou `null`.
 *
 * 1) Identificadores preenchidos na ordem googlePlaceId > osmId > cnpj; vazios são ignorados
 *    e a busca para no primeiro identificador que coincidir (Req. 9.1). O `osmId` encontrado
 *    casa também com os `aliases` das existentes, e o Place_ID com os `googleAliases`,
 *    com a mesma prioridade do identificador próprio (Req. 5.1, 5.3).
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

/**
 * Converte um lugar da Fonte_Google em chave de deduplicação: Place_ID e nome/coordenadas
 * do lugar obtidos na própria Mineracao (Req. 5.1).
 */
export function toGoogleKey(p: GooglePlace): CompanyKey {
  return {
    googlePlaceId: trimmedOrNull(p.placeId),
    osmId: null,
    cnpj: null,
    nomeNormalizado: normalizeCompanyName(p.nome ?? ''),
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

/** Parte do Cache_Google usada pela chave efetiva. */
export interface EffectiveKeyCache {
  nome: string;
  latitude: number | null;
  longitude: number | null;
  expiraEm: Date | string;
}

/**
 * Chave de uma Empresa existente para a deduplicação: valores próprios; na falta de
 * Nome_Normalizado ou de coordenadas válidas próprias, os do Cache_Google **válido**
 * (`isCacheValid`). Cache expirado é ignorado. Não muta a entrada; preserva `id` e aliases.
 */
export function effectiveKey(
  c: CompanyKey & { googleCache?: EffectiveKeyCache | null },
  now: Date,
): CompanyKey {
  const cache = c.googleCache && isCacheValid(c.googleCache, now) ? c.googleCache : null;
  let nomeNormalizado = c.nomeNormalizado;
  let latitude = c.latitude;
  let longitude = c.longitude;
  if (cache) {
    if (!nomeNormalizado) nomeNormalizado = normalizeCompanyName(cache.nome ?? '');
    if (!isValidCoord(latitude, longitude) && isValidCoord(cache.latitude, cache.longitude)) {
      latitude = cache.latitude;
      longitude = cache.longitude;
    }
  }
  const key: CompanyKey = {
    googlePlaceId: c.googlePlaceId,
    osmId: c.osmId,
    cnpj: c.cnpj,
    nomeNormalizado,
    latitude,
    longitude,
  };
  if (c.id !== undefined) key.id = c.id;
  if (c.aliases !== undefined) key.aliases = [...c.aliases];
  if (c.googleAliases !== undefined) key.googleAliases = [...c.googleAliases];
  return key;
}

/**
 * Fonte da Empresa (Req. 5.4): `MISTA` se tem Place_ID (próprio ou alias) e osmId (próprio
 * ou alias); `GOOGLE` só com Place_ID; `OSM` só com osmId (e, sem nenhum, o default `OSM`).
 */
export function companySource(
  c: Pick<CompanyKey, 'googlePlaceId' | 'osmId' | 'aliases' | 'googleAliases'>,
): SourceMode {
  const hasGoogle =
    trimmedOrNull(c.googlePlaceId) !== null || (c.googleAliases ?? []).some((a) => trimmedOrNull(a) !== null);
  const hasOsm = trimmedOrNull(c.osmId) !== null || (c.aliases ?? []).some((a) => trimmedOrNull(a) !== null);
  if (hasGoogle && hasOsm) return 'MISTA';
  return hasGoogle ? 'GOOGLE' : 'OSM';
}

/**
 * Fonte_Efetiva de uma Mineracao a partir das origens dos seus vínculos (Req. 4.7):
 * `GOOGLE` se todas são `GOOGLE`, `OSM` se todas são `OSM`, senão `MISTA`; vazio → `OSM`.
 */
export function effectiveSource(origens: Iterable<SourceMode>): SourceMode {
  let google = false;
  let osm = false;
  for (const o of Array.from(origens)) {
    if (o === 'MISTA') return 'MISTA';
    if (o === 'GOOGLE') google = true;
    else osm = true;
  }
  if (google && osm) return 'MISTA';
  return google ? 'GOOGLE' : 'OSM';
}

/** Origem acumulada de um vínculo: igual → mantém; diferente → `MISTA`. */
function combineOrigin(a: SourceMode, b: SourceMode): SourceMode {
  return a === b ? a : 'MISTA';
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
  /** Fonte da Empresa (Etapa 3; ausente nas bases da Etapa 1 = `OSM`). */
  fonte?: SourceMode;
  /** Cache_Google (Etapa 3). */
  googleCache?: GoogleCacheRow | null;
}

/** Vínculo empresa ↔ mineração (subconjunto de `MiningRunCompany`). */
export interface InMemoryLink {
  runId: string;
  companyId: string;
  isNew: boolean;
  /** Nicho da 1ª ocorrência nesta mineração. */
  nicho: string;
  /** Fonte(s) que trouxeram a Empresa nesta Mineracao (Etapa 3; ausente = `OSM`). */
  origem?: SourceMode;
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
 * Ingestão de um elemento OSM sobre `companies` (mutável): casa por `matchCompany`
 * (sobre as chaves efetivas quando `now` é dado), mescla ou cria.
 */
function ingestOsmItem(
  companies: InMemoryCompany[],
  usedIds: Set<string>,
  f: FoundCompany,
  now: Date | null,
): { company: InMemoryCompany; isNew: boolean } {
  const key = toCompanyKey(f);
  const match = now === null ? (matchCompany(key, companies) as InMemoryCompany | null) : matchEffective(key, companies, now);
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
    return { company: match, isNew: false };
  }
  const company: InMemoryCompany = {
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
  return { company, isNew: true };
}

/** `matchCompany` sobre as chaves efetivas, devolvendo a Empresa (não a chave). */
function matchEffective(key: CompanyKey, companies: InMemoryCompany[], now: Date): InMemoryCompany | null {
  const keys = companies.map((c) => effectiveKey(c, now));
  const hit = matchCompany(key, keys);
  return hit ? companies[keys.indexOf(hit)] : null;
}

/** Linha do Cache_Google gravada/renovada a partir do lugar, válida por GOOGLE_CACHE_DAYS. */
function cacheRowFrom(p: GooglePlace, now: Date): GoogleCacheRow {
  return {
    nome: p.nome,
    endereco: p.endereco,
    bairro: p.bairro,
    cidade: p.cidade,
    uf: p.uf,
    telefone: p.telefone,
    website: p.website,
    latitude: p.latitude,
    longitude: p.longitude,
    mapsUri: p.mapsUri,
    businessStatus: p.businessStatus,
    tipos: [...p.tipos],
    obtidoEm: new Date(now.getTime()),
    expiraEm: new Date(now.getTime() + GOOGLE_CACHE_DAYS * 24 * 60 * 60 * 1000),
  };
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
    const { company, isNew } = ingestOsmItem(companies, usedIds, f, null);
    if (!linked.has(company.id)) {
      linked.add(company.id);
      links.push({ runId, companyId: company.id, isNew, nicho: f.nicho });
    }
  }
  return { companies, links };
}

/** Item da ingestão combinada: elemento OSM ou lugar do Google. */
export type SourceItem =
  | { kind: 'OSM'; found: FoundCompany }
  | { kind: 'GOOGLE'; place: GooglePlace };

/**
 * Modelo de referência da ingestão combinada Google + OSM (Req. 5), sem mutar a entrada.
 * As candidatas são comparadas pela chave efetiva (próprios ou Cache_Google válido em `now`).
 * - OSM: como `ingestInMemory` (patch cadastral, preenche `osmId`, alias `OSM`).
 * - GOOGLE casou: grava `googlePlaceId` se a Empresa não tem (Req. 5.2) ou registra alias
 *   `GOOGLE` se tem outro (Req. 5.3); grava/renova só o Cache_Google, sem patch cadastral (Req. 5.5).
 * - GOOGLE sem correspondente: cria Empresa com `nome = ''`, `nomeNormalizado = ''`, sem campos
 *   próprios nem coordenadas, e com Cache_Google.
 * - `fonte` da Empresa recalculada por `companySource` (Req. 5.4).
 * - Vínculo único por (runId, companyId), `isNew` da 1ª ocorrência; `origem` acumula a fonte
 *   (igual mantém, diferente vira `MISTA`), como o `ON CONFLICT … DO UPDATE` do repositório.
 */
export function ingestSourcesInMemory(
  base: InMemoryBase,
  items: readonly SourceItem[],
  runId: string,
  now: Date,
): InMemoryBase {
  const companies = base.companies.map((c) => ({
    ...c,
    ...(c.aliases ? { aliases: [...c.aliases] } : {}),
    ...(c.googleAliases ? { googleAliases: [...c.googleAliases] } : {}),
  }));
  const links = base.links.map((l) => ({ ...l }));
  const usedIds = new Set(companies.map((c) => c.id));
  const linkByCompany = new Map<string, InMemoryLink>();
  for (const l of links) if (l.runId === runId) linkByCompany.set(l.companyId, l);

  for (const item of items) {
    let company: InMemoryCompany;
    let isNew: boolean;
    let nicho: string;
    if (item.kind === 'OSM') {
      ({ company, isNew } = ingestOsmItem(companies, usedIds, item.found, now));
      nicho = item.found.nicho;
    } else {
      const p = item.place;
      const key = toGoogleKey(p);
      const match = matchEffective(key, companies, now);
      nicho = p.nicho;
      if (match) {
        const pid = key.googlePlaceId;
        if (pid !== null) {
          if (match.googlePlaceId === null) match.googlePlaceId = pid;
          else if (!hasIdentifier(match, 'googlePlaceId', pid)) {
            match.googleAliases = [...(match.googleAliases ?? []), pid];
          }
        }
        match.googleCache = cacheRowFrom(p, now);
        company = match;
        isNew = false;
      } else {
        company = {
          id: nextId(usedIds),
          googlePlaceId: key.googlePlaceId,
          osmId: null,
          cnpj: null,
          nome: '',
          nomeNormalizado: '',
          nicho: p.nicho,
          endereco: null,
          bairro: null,
          cidade: null,
          uf: null,
          telefone: null,
          website: null,
          latitude: null,
          longitude: null,
          marcaRede: null,
          assignedTo: null,
          googleCache: cacheRowFrom(p, now),
        };
        companies.push(company);
        isNew = true;
      }
    }
    company.fonte = companySource(company);
    const link = linkByCompany.get(company.id);
    if (link) {
      link.origem = combineOrigin(link.origem ?? 'OSM', item.kind);
    } else {
      const created: InMemoryLink = { runId, companyId: company.id, isNew, nicho, origem: item.kind };
      linkByCompany.set(company.id, created);
      links.push(created);
    }
  }
  return { companies, links };
}
