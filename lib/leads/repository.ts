/**
 * Repositório do Minerador de Leads (Prisma) — Etapa 1 (Req. 8 e 9) e Etapa 3 (Req. 3.9, 5, 8.8,
 * 9.5, 10.7, 11.4, 11.5, 11.8, 12.1, 13.1, 16.6).
 *
 * - `upsertFoundCompany` (OSM) / `upsertGooglePlace` (Google): deduplicação pela chave efetiva das
 *   candidatas (valores próprios ou do Cache_Google válido), mescla, aliases por fonte, `fonte`
 *   derivada e vínculo único (runId, companyId) com `origem` acumulada — espelhando
 *   `ingestSourcesInMemory` de `dedup.ts` (Req. 5.1–5.5; Etapa 1 Req. 9.1–9.6, 9.12, 9.14–9.16).
 * - `claimBatch` / `releaseClaims`: reserva de itens com `FOR UPDATE SKIP LOCKED` e expiração
 *   de 90 s (Req. 8.3, 8.7, 8.14), com os dados de enriquecimento da Empresa.
 * - `persistAnalysis` / `persistReanalysis` / `persistFailure`: gravação transacional
 *   (claim por token no Lote; sem claim na Reanalise), incluindo a Versao_Score 2.
 * - `applyCnpjInTx` / `writeCnpjDataInTx`: aplicação de CNPJ com unicidade por SAVEPOINT
 *   (conflito → candidato `CONFLITO`) e gravação dos Dados_CNPJ.
 * - `pruneGoogleChains`: descarte de Redes do Google no fim da descoberta (Req. 3.9).
 *
 * Todo SQL cru usa a template tag de `$queryRaw`/`$executeRaw` (parametrizado).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { cnpjAiFields, type CnpjAiFields } from './ai';
import { isPoorPerformance } from './classifier';
import { mergeCandidates, normalizeCnpj, parseCandidates, serializeCandidates, type CnpjPlan } from './cnpj';
import {
  companySource,
  effectiveKey,
  IDENTIFIER_FIELDS,
  isEmptyValue,
  matchCompany,
  mergeCompanyFields,
  toCompanyKey,
  toGoogleKey,
  type CompanyKey,
} from './dedup';
import { sortName } from './display';
import { recomputeNomeExibicao, writeGoogleCache } from './google-cache';
import { normalizeInstagram, normalizeWhatsapp, serializeSinais } from './signals';
import { detectGoogleChains } from './sources/google-places';
import { normalizeCompanyName } from './text';
import type {
  AiOutcome,
  CnpjCandidate,
  CnpjData,
  CnpjOrigin,
  ClassificationResult,
  FoundCompany,
  GooglePlace,
  PageSpeedOutcome,
  ScoreBreakdown,
  SinaisDigitais,
  SiteAnalysis,
  SourceMode,
} from './types';

export type Db = PrismaClient | Prisma.TransactionClient;

/** Meia-largura (graus) da caixa de busca de candidatas por nome + proximidade (~165 m). */
export const DEDUP_BOX_DEG = 0.0015;
/**
 * Claim mais antigo que isso é considerado abandonado (> 60 s de orçamento do lote).
 * Documental: o SQL de `claimBatch` usa o literal `interval '90 seconds'`.
 */
export const CLAIM_EXPIRY_SECONDS = 90;
/** Limite de caracteres da mensagem de falha gravada no vínculo. */
export const ERROR_MESSAGE_MAX = 500;

/** Executa `fn` numa transação se `db` é o cliente raiz; dentro de uma transação, reutiliza-a. */
async function inTx<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if ('$transaction' in db && typeof db.$transaction === 'function') {
    return (db as PrismaClient).$transaction(fn);
  }
  return fn(db as Prisma.TransactionClient);
}

// ---------------------------------------------------------------------------
// Ingestão (upsertFoundCompany / upsertGooglePlace)
// ---------------------------------------------------------------------------

export interface UpsertResult {
  companyId: string;
  /** true só quando esta chamada criou a Empresa. */
  isNew: boolean;
  /** true quando esta chamada criou o vínculo (runId, companyId). */
  linked: boolean;
}

const companyForDedup = {
  include: {
    aliases: { select: { source: true, externalId: true } },
    googleCache: { select: { nome: true, latitude: true, longitude: true, expiraEm: true } },
  },
} satisfies Prisma.CompanyDefaultArgs;
type CompanyRow = Prisma.CompanyGetPayload<typeof companyForDedup>;

const nullIfEmpty = <V>(v: V | null | undefined): V | null => (isEmptyValue(v) ? null : (v as V));

const aliasesOf = (c: Pick<CompanyRow, 'aliases'>, source: SourceMode): string[] =>
  c.aliases.filter((a) => a.source === source).map((a) => a.externalId);

/** Chave efetiva da Empresa (próprios ou Cache_Google válido em `now`), com aliases por fonte. */
function toKey(c: CompanyRow, now: Date): CompanyKey & { id: string } {
  return effectiveKey(
    {
      id: c.id,
      googlePlaceId: c.googlePlaceId,
      osmId: c.osmId,
      cnpj: c.cnpj,
      nomeNormalizado: c.nomeNormalizado,
      latitude: c.latitude,
      longitude: c.longitude,
      aliases: aliasesOf(c, 'OSM'),
      googleAliases: aliasesOf(c, 'GOOGLE'),
      googleCache: c.googleCache,
    },
    now,
  ) as CompanyKey & { id: string };
}

function hasAliasOrOwn(c: CompanyRow, field: 'osmId' | 'googlePlaceId', value: string): boolean {
  const source: SourceMode = field === 'osmId' ? 'OSM' : 'GOOGLE';
  return c[field] === value || aliasesOf(c, source).includes(value);
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Campos cadastrais da empresa encontrada, na forma aceita por `mergeCompanyFields`. */
function incomingFields(f: FoundCompany) {
  return {
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
}

const finite = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Candidatas: por identificador (próprio ou alias da mesma fonte) ou por nome + caixa,
 * considerando a chave efetiva. As cláusulas da caixa formam um superconjunto das Empresas
 * cuja chave efetiva pode casar; a decisão final é sempre de `matchCompany`.
 */
async function findCandidates(tx: Prisma.TransactionClient, key: CompanyKey, now: Date): Promise<CompanyRow[]> {
  const or: Prisma.CompanyWhereInput[] = [];
  for (const field of IDENTIFIER_FIELDS) {
    const value = key[field];
    if (value !== null) or.push({ [field]: value });
  }
  if (key.osmId !== null) or.push({ aliases: { some: { source: 'OSM', externalId: key.osmId } } });
  if (key.googlePlaceId !== null) {
    or.push({ aliases: { some: { source: 'GOOGLE', externalId: key.googlePlaceId } } });
  }
  if (key.nomeNormalizado && finite(key.latitude) && finite(key.longitude)) {
    const latitude = { gte: key.latitude - DEDUP_BOX_DEG, lte: key.latitude + DEDUP_BOX_DEG };
    const longitude = { gte: key.longitude - DEDUP_BOX_DEG, lte: key.longitude + DEDUP_BOX_DEG };
    // nome e coordenadas próprios
    or.push({ nomeNormalizado: key.nomeNormalizado, latitude, longitude });
    // coordenadas do Cache_Google válido (nome próprio ou do cache, comparado em memória)
    or.push({ googleCache: { is: { expiraEm: { gt: now }, latitude, longitude } } });
    // coordenadas próprias com nome vindo do Cache_Google válido
    or.push({ nomeNormalizado: '', latitude, longitude, googleCache: { is: { expiraEm: { gt: now } } } });
  }
  if (or.length === 0) return [];
  return tx.company.findMany({ where: { OR: or }, orderBy: { createdAt: 'asc' }, ...companyForDedup });
}

/** Executa `fn` dentro de um SAVEPOINT; em P2002 volta ao savepoint e devolve `null`. */
async function withSavepoint<T>(tx: Prisma.TransactionClient, fn: () => Promise<T>): Promise<T | null> {
  await tx.$executeRaw`SAVEPOINT lead_miner_sp`;
  try {
    const out = await fn();
    await tx.$executeRaw`RELEASE SAVEPOINT lead_miner_sp`;
    return out;
  } catch (e) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT lead_miner_sp`;
    await tx.$executeRaw`RELEASE SAVEPOINT lead_miner_sp`;
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}

async function insertAlias(tx: Prisma.TransactionClient, companyId: string, source: SourceMode, externalId: string) {
  await tx.$executeRaw`
    INSERT INTO "CompanyAlias" (id, "companyId", source, "externalId", "createdAt")
    VALUES (gen_random_uuid()::text, ${companyId}, ${source}::"MiningSource", ${externalId}, now())
    ON CONFLICT (source, "externalId") DO NOTHING`;
}

/** Recalcula `Company.fonte` pelos identificadores próprios e aliases (Req. 5.4). */
async function refreshFonte(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
  const c = await tx.company.findUnique({
    where: { id: companyId },
    select: { fonte: true, googlePlaceId: true, osmId: true, aliases: { select: { source: true, externalId: true } } },
  });
  if (!c) return;
  const fonte = companySource({
    googlePlaceId: c.googlePlaceId,
    osmId: c.osmId,
    aliases: aliasesOf(c, 'OSM'),
    googleAliases: aliasesOf(c, 'GOOGLE'),
  });
  if (fonte !== c.fonte) await tx.company.update({ where: { id: companyId }, data: { fonte } });
}

/** Tags OSM de contato normalizadas (Req. 8.5). */
function osmContacts(f: FoundCompany): { instagramOsm: string | null; whatsappOsm: string | null } {
  return {
    instagramOsm: normalizeInstagram(f.instagramOsm ?? null),
    whatsappOsm: normalizeWhatsapp(f.whatsappOsm ?? null),
  };
}

/**
 * Aplica a empresa encontrada no OSM a uma Empresa existente: mescla cadastral (recalculando
 * `nomeNormalizado` e `nomeExibicao`), tags de contato, preenche `osmId` vazio e, se a Empresa
 * já tem outro `osmId`, registra o encontrado como alias; por fim recalcula `fonte`
 * (Req. 5.4; Etapa 1 Req. 9.4, 9.16).
 */
async function applyOsmToExisting(
  tx: Prisma.TransactionClient,
  current: CompanyRow,
  found: FoundCompany,
  key: CompanyKey,
  now: Date,
): Promise<void> {
  // O patch cadastral só contém CADASTRAL_FIELDS (garantido por mergeCompanyFields).
  const patch = mergeCompanyFields(current, incomingFields(found)) as Prisma.CompanyUpdateInput;
  const nameChanged = typeof patch.nome === 'string';
  if (nameChanged) patch.nomeNormalizado = normalizeCompanyName(patch.nome as string);
  const contacts = osmContacts(found);
  if (contacts.instagramOsm !== null && contacts.instagramOsm !== current.instagramOsm) {
    patch.instagramOsm = contacts.instagramOsm;
  }
  if (contacts.whatsappOsm !== null && contacts.whatsappOsm !== current.whatsappOsm) {
    patch.whatsappOsm = contacts.whatsappOsm;
  }

  const fillOsmId = key.osmId !== null && current.osmId === null;
  const needsAlias = key.osmId !== null && !fillOsmId && !hasAliasOrOwn(current, 'osmId', key.osmId);

  if (fillOsmId) {
    // Preencher o identificador pode colidir com uma Empresa criada em paralelo: nesse caso
    // mantém a mescla sem o osmId (identificador pertence à vencedora).
    const ok = await withSavepoint(tx, () =>
      tx.company.update({ where: { id: current.id }, data: { ...patch, osmId: key.osmId } }),
    );
    if (ok === null && Object.keys(patch).length > 0) {
      await tx.company.update({ where: { id: current.id }, data: patch });
    }
  } else if (Object.keys(patch).length > 0) {
    await tx.company.update({ where: { id: current.id }, data: patch });
  }

  if (needsAlias) await insertAlias(tx, current.id, 'OSM', key.osmId as string);
  if (nameChanged) await recomputeNomeExibicao(tx, [current.id], now);
  await refreshFonte(tx, current.id);
}

/**
 * Aplica um lugar do Google a uma Empresa existente: grava o Place_ID se ela não tem (Req. 5.2)
 * ou registra alias `GOOGLE` se tem outro (Req. 5.3); grava/renova só o Cache_Google, sem patch
 * cadastral (Req. 5.5); recalcula `fonte` (Req. 5.4).
 */
async function applyGoogleToExisting(
  tx: Prisma.TransactionClient,
  current: CompanyRow,
  place: GooglePlace,
  key: CompanyKey,
  now: Date,
): Promise<void> {
  const pid = key.googlePlaceId;
  if (pid !== null) {
    if (current.googlePlaceId === null) {
      // Colisão com Empresa criada em paralelo: o Place_ID pertence à vencedora.
      await withSavepoint(tx, () => tx.company.update({ where: { id: current.id }, data: { googlePlaceId: pid } }));
    } else if (!hasAliasOrOwn(current, 'googlePlaceId', pid)) {
      await insertAlias(tx, current.id, 'GOOGLE', pid);
    }
  }
  await writeGoogleCache(tx, current.id, place, now);
  await refreshFonte(tx, current.id);
}

/** Reconsulta a Empresa vencedora de uma corrida de unicidade pelos identificadores do create. */
async function findWinner(tx: Prisma.TransactionClient, key: CompanyKey): Promise<CompanyRow | null> {
  const or: Prisma.CompanyWhereInput[] = [];
  for (const field of IDENTIFIER_FIELDS) {
    const value = key[field];
    if (value !== null) or.push({ [field]: value });
  }
  if (key.googlePlaceId !== null) {
    or.push({ aliases: { some: { source: 'GOOGLE', externalId: key.googlePlaceId } } });
  }
  if (or.length === 0) return null;
  return tx.company.findFirst({ where: { OR: or }, ...companyForDedup });
}

/**
 * Vínculo único (runId, companyId). Repetição na mesma Mineracao mantém `isNew`/`nicho` da 1ª
 * ocorrência e acumula `origem` (igual mantém; diferente vira `MISTA`).
 */
async function linkCompany(
  tx: Prisma.TransactionClient,
  runId: string,
  companyId: string,
  isNew: boolean,
  nicho: string,
  origem: Exclude<SourceMode, 'MISTA'>,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ inserted: boolean }>>`
    INSERT INTO "MiningRunCompany" (id, "runId", "companyId", "isNew", nicho, origem, "createdAt")
    VALUES (gen_random_uuid()::text, ${runId}, ${companyId}, ${isNew}, ${nicho}, ${origem}::"MiningSource", now())
    ON CONFLICT ("runId", "companyId") DO UPDATE SET origem = CASE
      WHEN "MiningRunCompany".origem = EXCLUDED.origem THEN EXCLUDED.origem
      ELSE 'MISTA'::"MiningSource" END
    RETURNING (xmax = 0) AS inserted`;
  return rows.length > 0 && rows[0].inserted === true;
}

async function upsertOsmInTx(
  tx: Prisma.TransactionClient,
  runId: string,
  found: FoundCompany,
  now: Date,
): Promise<UpsertResult> {
  const key = toCompanyKey(found);
  const candidates = await findCandidates(tx, key, now);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const hit = matchCompany(key, candidates.map((c) => toKey(c, now)));

  let companyId: string;
  let isNew: boolean;
  if (hit?.id && byId.has(hit.id)) {
    await applyOsmToExisting(tx, byId.get(hit.id)!, found, key, now);
    companyId = hit.id;
    isNew = false;
  } else {
    const created = await withSavepoint(tx, () =>
      tx.company.create({
        data: {
          googlePlaceId: key.googlePlaceId,
          osmId: key.osmId,
          cnpj: key.cnpj,
          nome: found.nome,
          nomeNormalizado: key.nomeNormalizado,
          nomeExibicao: sortName({ nome: found.nome, cnpjNomeFantasia: null, googleCache: null }, now),
          nicho: found.nicho,
          endereco: nullIfEmpty(found.endereco),
          bairro: nullIfEmpty(found.bairro),
          cidade: nullIfEmpty(found.cidade),
          uf: nullIfEmpty(found.uf),
          telefone: nullIfEmpty(found.telefone),
          website: nullIfEmpty(found.website),
          latitude: nullIfEmpty(found.latitude),
          longitude: nullIfEmpty(found.longitude),
          marcaRede: nullIfEmpty(found.marcaRede),
          ...osmContacts(found),
          fonte: 'OSM',
        },
        select: { id: true },
      }),
    );
    if (created) {
      companyId = created.id;
      isNew = true;
    } else {
      // Perdeu a corrida de unicidade (Req. 9.12, 9.14, 9.15): usa a vencedora como existente.
      const winner = await findWinner(tx, key);
      if (!winner) throw new Error('Conflito de unicidade sem Empresa vencedora');
      await applyOsmToExisting(tx, winner, found, key, now);
      companyId = winner.id;
      isNew = false;
    }
  }

  const linked = await linkCompany(tx, runId, companyId, isNew, found.nicho, 'OSM');
  return { companyId, isNew, linked };
}

async function upsertGoogleInTx(
  tx: Prisma.TransactionClient,
  runId: string,
  place: GooglePlace,
  now: Date,
): Promise<UpsertResult> {
  const key = toGoogleKey(place);
  const candidates = await findCandidates(tx, key, now);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const hit = matchCompany(key, candidates.map((c) => toKey(c, now)));

  let companyId: string;
  let isNew: boolean;
  if (hit?.id && byId.has(hit.id)) {
    await applyGoogleToExisting(tx, byId.get(hit.id)!, place, key, now);
    companyId = hit.id;
    isNew = false;
  } else {
    // Empresa só do Google: nada próprio além do Place_ID; o Conteudo_Google vai só para o cache.
    const created = await withSavepoint(tx, () =>
      tx.company.create({
        data: {
          googlePlaceId: key.googlePlaceId,
          nome: '',
          nomeNormalizado: '',
          nicho: place.nicho,
          fonte: 'GOOGLE',
        },
        select: { id: true },
      }),
    );
    if (created) {
      await writeGoogleCache(tx, created.id, place, now);
      companyId = created.id;
      isNew = true;
    } else {
      const winner = await findWinner(tx, key);
      if (!winner) throw new Error('Conflito de unicidade sem Empresa vencedora');
      await applyGoogleToExisting(tx, winner, place, key, now);
      companyId = winner.id;
      isNew = false;
    }
  }

  const linked = await linkCompany(tx, runId, companyId, isNew, place.nicho, 'GOOGLE');
  return { companyId, isNew, linked };
}

/**
 * Ingere uma empresa encontrada no OSM na Base_de_Empresas e a vincula à mineração.
 * Com `PrismaClient` abre uma transação interativa própria; com um `TransactionClient`
 * roda dentro da transação recebida (os SAVEPOINTs exigem uma transação aberta).
 * `now` decide a validade do Cache_Google das candidatas (chave efetiva).
 */
export async function upsertFoundCompany(
  db: Db,
  runId: string,
  found: FoundCompany,
  now: Date = new Date(),
): Promise<UpsertResult> {
  return inTx(db, (tx) => upsertOsmInTx(tx, runId, found, now));
}

/**
 * Ingere um lugar da Fonte_Google (Req. 5.1–5.5): casa pela mesma ordem da Etapa 1 sobre as
 * chaves efetivas; existente → Place_ID ou alias `GOOGLE` + Cache_Google; senão cria Empresa
 * só do Google (`nome = ''`) com Cache_Google. Vínculo com `origem` acumulada.
 */
export async function upsertGooglePlace(
  db: Db,
  runId: string,
  place: GooglePlace,
  now: Date = new Date(),
): Promise<UpsertResult> {
  return inTx(db, (tx) => upsertGoogleInTx(tx, runId, place, now));
}

// ---------------------------------------------------------------------------
// Rede no Google (Req. 3.9)
// ---------------------------------------------------------------------------

export interface PruneResult {
  removedLinks: number;
  removedCompanies: number;
}

/**
 * Remove os vínculos `origem = GOOGLE` da Mineracao cujos lugares formam Rede
 * (`detectGoogleChains` sobre o nome normalizado do Cache_Google) e apaga as Empresas criadas
 * por esta Mineracao que ficaram sem vínculos e sem Analises. Deve rodar antes da contagem do total.
 */
export async function pruneGoogleChains(db: Db, runId: string): Promise<PruneResult> {
  return inTx(db, async (tx) => {
    const links = await tx.miningRunCompany.findMany({
      where: { runId, origem: 'GOOGLE' },
      select: {
        id: true,
        companyId: true,
        isNew: true,
        company: { select: { googlePlaceId: true, googleCache: { select: { placeId: true, nome: true } } } },
      },
    });
    const placeOf = new Map<string, string>();
    const entries: Array<{ placeId: string; nomeNormalizado: string }> = [];
    for (const l of links) {
      const placeId = l.company.googleCache?.placeId || l.company.googlePlaceId;
      const nome = l.company.googleCache?.nome;
      if (!placeId || !nome) continue;
      placeOf.set(l.id, placeId);
      entries.push({ placeId, nomeNormalizado: normalizeCompanyName(nome) });
    }
    const chains = detectGoogleChains(entries);
    const doomed = links.filter((l) => chains.has(placeOf.get(l.id) ?? ''));
    if (doomed.length === 0) return { removedLinks: 0, removedCompanies: 0 };

    const removed = await tx.miningRunCompany.deleteMany({ where: { id: { in: doomed.map((l) => l.id) } } });
    const createdHere = doomed.filter((l) => l.isNew).map((l) => l.companyId);
    const companies =
      createdHere.length === 0
        ? { count: 0 }
        : await tx.company.deleteMany({
          where: { id: { in: createdHere }, runs: { none: {} }, analyses: { none: {} } },
        });
    return { removedLinks: removed.count, removedCompanies: companies.count };
  });
}

// ---------------------------------------------------------------------------
// Claim e gravação dos lotes
// ---------------------------------------------------------------------------

/** Item reservado por um lote, com os dados da Empresa necessários à análise. */
export interface ClaimedItem {
  /** id do MiningRunCompany */
  id: string;
  runId: string;
  companyId: string;
  /** nicho da 1ª ocorrência nesta mineração; o tier é derivado dele via config. */
  nicho: string;
  nome: string;
  bairro: string | null;
  cidade: string | null;
  website: string | null;
}

/** Item reservado com os campos da Etapa 3 (devolvido por `claimBatch`). */
export interface ClaimedItemV2 extends ClaimedItem {
  googlePlaceId: string | null;
  uf: string | null;
  instagramOsm: string | null;
  whatsappOsm: string | null;
  cnpj: string | null;
  cnpjOrigem: CnpjOrigin | null;
  cnpjCandidatos: CnpjCandidate[];
  cnpjDadosCnpj: string | null;
  cnpjConsultadoEm: Date | null;
  /** Dados_CNPJ gravados permitidos à IA (sem razão social); null se não há dados do CNPJ atual. */
  cnpjAi: CnpjAiFields | null;
  /** Nome do Cache_Google válido (para a IA/abordagem); null se ausente/expirado. */
  cacheNome: string | null;
  /** Website do Cache_Google somente se `expiraEm > now()`. */
  cacheWebsite: string | null;
}

interface ClaimRow extends ClaimedItem {
  googlePlaceId: string | null;
  uf: string | null;
  instagramOsm: string | null;
  whatsappOsm: string | null;
  cnpj: string | null;
  cnpjOrigem: string | null;
  cnpjCandidatos: unknown;
  cnpjDadosCnpj: string | null;
  cnpjConsultadoEm: Date | null;
  cnpjNomeFantasia: string | null;
  cnpjCnaeCodigo: string | null;
  cnpjCnaeDescricao: string | null;
  cnpjPorte: string | null;
  situacaoCadastral: string | null;
  cnpjInicioAtividade: string | null;
  cacheNome: string | null;
  cacheWebsite: string | null;
}

function toClaimedItem(r: ClaimRow): ClaimedItemV2 {
  const hasData = r.cnpj !== null && r.cnpjDadosCnpj === r.cnpj;
  return {
    id: r.id,
    runId: r.runId,
    companyId: r.companyId,
    nicho: r.nicho,
    nome: r.nome,
    bairro: r.bairro,
    cidade: r.cidade,
    website: r.website,
    googlePlaceId: r.googlePlaceId,
    uf: r.uf,
    instagramOsm: r.instagramOsm,
    whatsappOsm: r.whatsappOsm,
    cnpj: r.cnpj,
    cnpjOrigem: r.cnpjOrigem === 'SITE' || r.cnpjOrigem === 'MANUAL' ? r.cnpjOrigem : null,
    cnpjCandidatos: parseCandidates(r.cnpjCandidatos),
    cnpjDadosCnpj: r.cnpjDadosCnpj,
    cnpjConsultadoEm: r.cnpjConsultadoEm,
    cnpjAi: hasData
      ? cnpjAiFields({
        nomeFantasia: r.cnpjNomeFantasia,
        cnaeCodigo: r.cnpjCnaeCodigo,
        cnaeDescricao: r.cnpjCnaeDescricao,
        porte: r.cnpjPorte,
        situacao: r.situacaoCadastral,
        inicioAtividade: r.cnpjInicioAtividade,
      })
      : null,
    cacheNome: r.cacheNome,
    cacheWebsite: r.cacheWebsite,
  };
}

/**
 * Reserva até `limit` itens não processados da mineração, livres ou com claim expirado
 * (> 90 s). `SKIP LOCKED` faz lotes simultâneos receberem conjuntos disjuntos (Req. 8.7, 8.14).
 */
export async function claimBatch(db: Db, runId: string, token: string, limit: number): Promise<ClaimedItemV2[]> {
  const n = Math.max(0, Math.floor(limit));
  if (n === 0) return [];
  const rows = await db.$queryRaw<ClaimRow[]>`
    WITH claimed AS (
      UPDATE "MiningRunCompany" SET "claimToken" = ${token}, "claimedAt" = now()
      WHERE id IN (
        SELECT id FROM "MiningRunCompany"
        WHERE "runId" = ${runId} AND "processedAt" IS NULL
          AND ("claimToken" IS NULL OR "claimedAt" IS NULL
               OR "claimedAt" < now() - interval '90 seconds')
        ORDER BY "createdAt", id
        LIMIT ${n}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "runId", "companyId", nicho, "createdAt"
    )
    SELECT cl.id, cl."runId", cl."companyId", cl.nicho, c.nome, c.bairro, c.cidade, c.website,
      c."googlePlaceId", c.uf, c."instagramOsm", c."whatsappOsm", c.cnpj, c."cnpjOrigem"::text AS "cnpjOrigem",
      c."cnpjCandidatos", c."cnpjDadosCnpj", c."cnpjConsultadoEm", c."cnpjNomeFantasia", c."cnpjCnaeCodigo",
      c."cnpjCnaeDescricao", c."cnpjPorte", c."situacaoCadastral", c."cnpjInicioAtividade",
      CASE WHEN g."expiraEm" > now() THEN g.nome END AS "cacheNome",
      CASE WHEN g."expiraEm" > now() THEN g.website END AS "cacheWebsite"
    FROM claimed cl
    JOIN "Company" c ON c.id = cl."companyId"
    LEFT JOIN "GooglePlaceCache" g ON g."companyId" = c.id
    ORDER BY cl."createdAt", cl.id`;
  return rows.map(toClaimedItem);
}

/** Devolve ao pool os itens deste token que não chegaram a ser processados. */
export async function releaseClaims(db: Db, token: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.$executeRaw`
    UPDATE "MiningRunCompany" SET "claimToken" = NULL, "claimedAt" = NULL
    WHERE "claimToken" = ${token} AND "processedAt" IS NULL AND id IN (${Prisma.join([...ids])})`;
}

/** Dados de uma análise concluída (Analisador → Classificador → IA → Pontuador). */
export interface AnalysisData {
  site: SiteAnalysis;
  classification: ClassificationResult;
  breakdown: ScoreBreakdown;
  /** null quando a IA não foi chamada. */
  ai: AiOutcome | null;
}

/** Resultado do CNPJ de uma análise (decidido em `analyzeCompany`; conflito decidido aqui). */
export interface CnpjAnalysisOutcome {
  plan?: CnpjPlan;
  /** CNPJ a aplicar com origem `SITE` (Req. 11.4); null se nenhum. */
  apply: string | null;
  origem: 'SITE' | null;
  /** Dados_CNPJ a gravar; só gravados se se referem ao CNPJ efetivo da Empresa (Req. 12.1). */
  data: CnpjData | null;
  /** Novos CNPJ_Candidatos (Req. 11.5, 11.9, 12.3, 12.4, 12.7). */
  candidates: CnpjCandidate[];
  /** `cnpjStatus` a gravar ("CNPJ não encontrado na Receita", …); null = sem novidade. */
  status: string | null;
  /** CNPJs válidos encontrados no HTML (diagnóstico). */
  encontrados?: string[];
}

/** Dados de uma análise da Versao_Score 2 (Req. 8.8, 9.5, 10.7, 13.1). */
export interface AnalysisDataV2 extends AnalysisData {
  versaoScore: 2;
  sinais: SinaisDigitais;
  pagespeed: PageSpeedOutcome;
  cnpj: CnpjAnalysisOutcome;
}

export type PersistResult = 'OK' | 'LOST_CLAIM';

export function isAnalysisV2(d: AnalysisData | AnalysisDataV2): d is AnalysisDataV2 {
  return (d as Partial<AnalysisDataV2>).versaoScore === 2;
}

/**
 * Marca o vínculo como processado se o claim ainda é deste token. A linha fica travada até o
 * fim da transação, então lotes concorrentes com o mesmo item esperam e recebem 0 linhas.
 */
async function markProcessed(
  tx: Prisma.TransactionClient,
  item: ClaimedItem,
  token: string,
  failure: string | null,
): Promise<boolean> {
  const count = await tx.$executeRaw`
    UPDATE "MiningRunCompany"
    SET "processedAt" = now(), failed = ${failure !== null}, "errorMessage" = ${failure}
    WHERE id = ${item.id} AND "claimToken" = ${token} AND "processedAt" IS NULL`;
  return count > 0;
}

/**
 * processados += 1; CONCLUIDA/finishedAt ao atingir `total` (Req. 8.5, 8.7). Em mineração
 * CANCELADA (T1) uma análise que termina depois do cancelamento ainda conta em `processados`,
 * mas o status nunca volta a CONCLUIDA.
 */
async function incrementProcessed(tx: Prisma.TransactionClient, runId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "MiningRun" SET
      processados = processados + 1,
      status = CASE WHEN status = 'EM_ANDAMENTO'::"MiningStatus" AND processados + 1 >= total
                    THEN 'CONCLUIDA'::"MiningStatus" ELSE status END,
      "finishedAt" = CASE WHEN status = 'EM_ANDAMENTO'::"MiningStatus" AND processados + 1 >= total
                          THEN now() ELSE "finishedAt" END,
      "updatedAt" = now()
    WHERE id = ${runId}
      AND status IN ('EM_ANDAMENTO'::"MiningStatus", 'CANCELADA'::"MiningStatus")
      AND processados < total`;
}

// ---------------------------------------------------------------------------
// CNPJ (Req. 11.4, 11.5, 11.8, 12.1)
// ---------------------------------------------------------------------------

/** Campos de Dados_CNPJ zerados (CNPJ removido ou trocado). */
export const CNPJ_DATA_CLEARED = {
  cnpjDadosCnpj: null,
  cnpjConsultadoEm: null,
  cnpjRazaoSocial: null,
  cnpjNomeFantasia: null,
  situacaoCadastral: null,
  cnpjSituacaoData: null,
  cnpjCnaeCodigo: null,
  cnpjCnaeDescricao: null,
  cnpjPorte: null,
  cnpjNatureza: null,
  cnpjMei: null,
  cnpjInicioAtividade: null,
  cnpjMunicipio: null,
  cnpjUf: null,
} as const satisfies Prisma.CompanyUpdateInput;

export type ApplyCnpjResult =
  | { ok: true; previous: { cnpj: string | null; origem: CnpjOrigin | null } }
  | { ok: false; conflitoCompanyId: string };

const toJson = (list: readonly CnpjCandidate[]) => serializeCandidates(list) as Prisma.InputJsonValue;

/**
 * Aplica `cnpj` à Empresa com a origem dada, dentro de uma transação aberta. A unicidade de
 * `Company.cnpj` é garantida por SAVEPOINT: se outra Empresa já o tem (ou o grava em paralelo),
 * nada é aplicado e o CNPJ vira candidato `CONFLITO` com o id da outra Empresa (Req. 11.8).
 * Em sucesso o CNPJ sai da lista de candidatos; trocar de CNPJ apaga os Dados_CNPJ do anterior.
 */
export async function applyCnpjInTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  cnpj: string,
  origem: CnpjOrigin,
  now: Date = new Date(),
): Promise<ApplyCnpjResult> {
  const target = normalizeCnpj(cnpj);
  const cur = await tx.company.findUnique({
    where: { id: companyId },
    select: { cnpj: true, cnpjOrigem: true, cnpjCandidatos: true, cnpjDadosCnpj: true },
  });
  if (!cur) throw new Error('Empresa não encontrada');
  const candidates = parseCandidates(cur.cnpjCandidatos);

  let conflito =
    (await tx.company.findFirst({ where: { cnpj: target, NOT: { id: companyId } }, select: { id: true } }))?.id ??
    null;
  const clearData = cur.cnpjDadosCnpj !== null && cur.cnpjDadosCnpj !== target;
  if (conflito === null) {
    const ok = await withSavepoint(tx, () =>
      tx.company.update({
        where: { id: companyId },
        data: {
          cnpj: target,
          cnpjOrigem: origem,
          cnpjCandidatos: toJson(mergeCandidates(candidates, [], target)),
          ...(cur.cnpj !== target ? { cnpjStatus: null } : {}),
          ...(clearData ? CNPJ_DATA_CLEARED : {}),
        },
        select: { id: true },
      }),
    );
    if (ok === null) {
      conflito =
        (await tx.company.findFirst({ where: { cnpj: target, NOT: { id: companyId } }, select: { id: true } }))
          ?.id ?? null;
      if (conflito === null) throw new Error('Conflito de unicidade de CNPJ sem Empresa vencedora');
    }
  }
  if (conflito !== null) {
    const next = mergeCandidates([{ cnpj: target, motivo: 'CONFLITO', conflitoCompanyId: conflito }], candidates, cur.cnpj);
    await tx.company.update({ where: { id: companyId }, data: { cnpjCandidatos: toJson(next) } });
    return { ok: false, conflitoCompanyId: conflito };
  }
  if (clearData) await recomputeNomeExibicao(tx, [companyId], now);
  return { ok: true, previous: { cnpj: cur.cnpj, origem: cur.cnpjOrigem } };
}

/** Grava os Dados_CNPJ (com a data da consulta) e recalcula `nomeExibicao` (Req. 12.1, 12.2). */
export async function writeCnpjDataInTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  d: CnpjData,
  now: Date = new Date(),
): Promise<void> {
  const consultadoEm = new Date(d.consultadoEm);
  await tx.company.update({
    where: { id: companyId },
    data: {
      cnpjDadosCnpj: normalizeCnpj(d.cnpj),
      cnpjConsultadoEm: Number.isFinite(consultadoEm.getTime()) ? consultadoEm : now,
      cnpjRazaoSocial: d.razaoSocial,
      cnpjNomeFantasia: d.nomeFantasia,
      situacaoCadastral: d.situacao,
      cnpjSituacaoData: d.situacaoData,
      cnpjCnaeCodigo: d.cnaeCodigo,
      cnpjCnaeDescricao: d.cnaeDescricao,
      cnpjPorte: d.porte,
      cnpjNatureza: d.naturezaJuridica,
      cnpjMei: d.mei,
      cnpjInicioAtividade: d.inicioAtividade,
      cnpjMunicipio: d.municipio,
      cnpjUf: d.uf,
    },
  });
  await recomputeNomeExibicao(tx, [companyId], now);
}

/**
 * Aplica o resultado de CNPJ da análise. O estado é relido na transação: se outra ação gravou
 * um CNPJ desde a análise, o do site não o substitui e vira candidato.
 */
async function applyAnalysisCnpj(
  tx: Prisma.TransactionClient,
  companyId: string,
  c: CnpjAnalysisOutcome,
  now: Date,
): Promise<void> {
  const cur = await tx.company.findUnique({
    where: { id: companyId },
    select: { cnpj: true, cnpjOrigem: true, cnpjCandidatos: true },
  });
  if (!cur) throw new Error('Empresa não encontrada');

  const fresh: CnpjCandidate[] = [...c.candidates];
  const apply = c.apply ? normalizeCnpj(c.apply) : null;
  if (apply !== null && cur.cnpj !== null && cur.cnpj !== apply) {
    fresh.unshift({ cnpj: apply, motivo: cur.cnpjOrigem === 'MANUAL' ? 'MANUAL_PRESERVADO' : 'MULTIPLOS' });
  }
  const existing = parseCandidates(cur.cnpjCandidatos);
  const merged = mergeCandidates(fresh, existing, cur.cnpj);
  if (JSON.stringify(serializeCandidates(merged)) !== JSON.stringify(serializeCandidates(existing))) {
    await tx.company.update({ where: { id: companyId }, data: { cnpjCandidatos: toJson(merged) } });
  }

  let effective = cur.cnpj;
  let conflict = false;
  if (apply !== null && cur.cnpj === null) {
    const r = await applyCnpjInTx(tx, companyId, apply, 'SITE', now);
    if (r.ok) effective = apply;
    else conflict = true;
  }
  if (conflict) return;

  const writeData = c.data !== null && effective !== null && normalizeCnpj(c.data.cnpj) === effective;
  if (writeData) await writeCnpjDataInTx(tx, companyId, c.data as CnpjData, now);
  if (c.status !== null || writeData) {
    await tx.company.update({ where: { id: companyId }, data: { cnpjStatus: c.status } });
  }
}

// ---------------------------------------------------------------------------
// Gravação da análise
// ---------------------------------------------------------------------------

/** Cria a Analise e atualiza o snapshot da Empresa (Etapa 1 + campos da Versao_Score 2). */
async function writeAnalysisInTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  runId: string | null,
  data: AnalysisData | AnalysisDataV2,
  now: Date,
): Promise<{ id: string; createdAt: Date }> {
  const { site, classification, breakdown, ai } = data;
  const v2 = isAnalysisV2(data) ? data : null;
  const analysis = await tx.companyAnalysis.create({
    data: {
      companyId,
      runId,
      hasSite: site.hasSite,
      online: site.online,
      statusCode: site.statusCode,
      isHttps: site.isHttps,
      sslValid: site.sslValid,
      sslProblem: site.sslProblem,
      responseTime: site.responseTimeMs,
      lento: site.slow,
      motivoFalha: site.failureDetail ?? site.failure,
      finalUrl: site.finalUrl,
      categoria: classification.category,
      motivos: classification.motivos,
      scoreDigital: breakdown.digital.value,
      scoreIcp: breakdown.icp.value,
      scoreObjetivo: breakdown.objetivo,
      scoreIa: breakdown.ia?.value ?? null,
      scoreFinal: breakdown.final,
      prioridade: breakdown.prioridade,
      iaAplicada: breakdown.ia !== null,
      iaMotivo: breakdown.iaNaoUsadaMotivo,
      oportunidadeIa: ai?.ok ? ai.result.oportunidade : null,
      justificativaIa: ai?.ok ? ai.result.justificativa : null,
      detalhamento: (v2 ? { ...breakdown, versao: 2 } : breakdown) as unknown as Prisma.InputJsonValue,
      ...(v2
        ? {
          versaoScore: 2,
          sinais: serializeSinais(v2.sinais) as unknown as Prisma.InputJsonValue,
          tecnologias: v2.sinais.tecnologias.map((t) => t.id),
          pagespeed: v2.pagespeed.ok
            ? (v2.pagespeed.result as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          pagespeedMotivo: v2.pagespeed.ok ? null : v2.pagespeed.reason,
          ...(v2.cnpj.encontrados ? { cnpjEncontrados: [...v2.cnpj.encontrados] } : {}),
        }
        : {}),
    },
    select: { id: true, createdAt: true },
  });

  await tx.company.update({
    where: { id: companyId },
    data: {
      categoria: classification.category,
      scoreFinal: breakdown.final,
      prioridade: breakdown.prioridade,
      hasSite: site.hasSite,
      isHttps: site.isHttps,
      lastAnalyzedAt: analysis.createdAt,
      ...(v2
        ? {
          temInstagram: v2.sinais.instagram !== null,
          temWhatsapp: v2.sinais.whatsapp !== null,
          desempenhoRuim: v2.pagespeed.ok ? isPoorPerformance(v2.pagespeed.result) : null,
        }
        : {}),
    },
  });
  if (v2) {
    await applyAnalysisCnpj(tx, companyId, v2.cnpj, now);
    await recomputeNomeExibicao(tx, [companyId], now);
  }
  return analysis;
}

/**
 * Grava análise + snapshot + progresso numa única transação (Req. 9.7, 9.8). Com dados v2
 * grava também sinais, tecnologias, PageSpeed/motivo, `versaoScore = 2`, CNPJ/Dados_CNPJ/
 * candidatos e `nomeExibicao`. Claim perdido → 'LOST_CLAIM', nada gravado.
 */
export async function persistAnalysis(
  db: PrismaClient,
  item: ClaimedItem,
  token: string,
  data: AnalysisData | AnalysisDataV2,
  now: Date = new Date(),
): Promise<PersistResult> {
  return db.$transaction(async (tx) => {
    if (!(await markProcessed(tx, item, token, null))) return 'LOST_CLAIM';
    const analysis = await writeAnalysisInTx(tx, item.companyId, item.runId, data, now);
    await tx.miningRunCompany.update({ where: { id: item.id }, data: { analysisId: analysis.id } });
    await incrementProcessed(tx, item.runId);
    return 'OK';
  });
}

/**
 * Reanalise (Req. 16.2, 16.6): mesma gravação de `persistAnalysis` v2, sem claim, vínculo nem
 * progresso, com `runId = null`. Transação única: em erro nada é gravado e a Analise e o
 * snapshot anteriores ficam como estavam.
 */
export async function persistReanalysis(
  db: PrismaClient,
  companyId: string,
  data: AnalysisDataV2,
  now: Date = new Date(),
): Promise<{ analysisId: string }> {
  return db.$transaction(async (tx) => {
    const analysis = await writeAnalysisInTx(tx, companyId, null, data, now);
    return { analysisId: analysis.id };
  });
}

/** Registra a falha da empresa no vínculo e a conta como processada (Req. 8.9). */
export async function persistFailure(
  db: PrismaClient,
  item: ClaimedItem,
  token: string,
  message: string,
): Promise<PersistResult> {
  const msg = (message.trim() || 'Falha desconhecida').slice(0, ERROR_MESSAGE_MAX);
  return db.$transaction(async (tx) => {
    if (!(await markProcessed(tx, item, token, msg))) return 'LOST_CLAIM';
    await incrementProcessed(tx, item.runId);
    return 'OK';
  });
}
