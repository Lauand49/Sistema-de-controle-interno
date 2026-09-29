/**
 * Repositório do Minerador de Leads (Prisma) — Req. 8 e 9.
 *
 * - `upsertFoundCompany`: deduplicação + mescla + vínculo único (runId, companyId), espelhando
 *   `ingestInMemory` de `dedup.ts` (Req. 9.1–9.6, 9.12, 9.14–9.16).
 * - `claimBatch` / `releaseClaims`: reserva de itens com `FOR UPDATE SKIP LOCKED` e expiração
 *   de 90 s (Req. 8.3, 8.7, 8.14).
 * - `persistAnalysis` / `persistFailure`: gravação transacional condicionada ao token do claim
 *   (Req. 8.5, 8.7, 8.9, 9.7–9.9).
 *
 * Todo SQL cru usa a template tag de `$queryRaw`/`$executeRaw` (parametrizado).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  IDENTIFIER_FIELDS,
  isEmptyValue,
  matchCompany,
  mergeCompanyFields,
  toCompanyKey,
  type CompanyKey,
} from './dedup';
import { normalizeCompanyName } from './text';
import type {
  AiOutcome,
  ClassificationResult,
  FoundCompany,
  ScoreBreakdown,
  SiteAnalysis,
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

// ---------------------------------------------------------------------------
// Ingestão (upsertFoundCompany)
// ---------------------------------------------------------------------------

export interface UpsertResult {
  companyId: string;
  /** true só quando esta chamada criou a Empresa. */
  isNew: boolean;
  /** true quando esta chamada criou o vínculo (runId, companyId). */
  linked: boolean;
}

const companyWithAliases = {
  include: { aliases: { where: { source: 'OSM' as const }, select: { externalId: true } } },
} satisfies Prisma.CompanyDefaultArgs;
type CompanyRow = Prisma.CompanyGetPayload<typeof companyWithAliases>;

const nullIfEmpty = <V>(v: V | null | undefined): V | null => (isEmptyValue(v) ? null : (v as V));

function toKey(c: CompanyRow): CompanyKey & { id: string } {
  return {
    id: c.id,
    googlePlaceId: c.googlePlaceId,
    osmId: c.osmId,
    cnpj: c.cnpj,
    nomeNormalizado: c.nomeNormalizado,
    latitude: c.latitude,
    longitude: c.longitude,
    aliases: c.aliases.map((a) => a.externalId),
  };
}

function hasOsmIdentifier(c: CompanyRow, osmId: string): boolean {
  return c.osmId === osmId || c.aliases.some((a) => a.externalId === osmId);
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

/** Candidatas: por identificador (osmId da Empresa ou alias OSM) ou nome normalizado + caixa. */
async function findCandidates(tx: Prisma.TransactionClient, key: CompanyKey): Promise<CompanyRow[]> {
  const or: Prisma.CompanyWhereInput[] = [];
  for (const field of IDENTIFIER_FIELDS) {
    const value = key[field];
    if (value !== null) or.push({ [field]: value });
  }
  if (key.osmId !== null) {
    or.push({ aliases: { some: { source: 'OSM', externalId: key.osmId } } });
  }
  if (key.nomeNormalizado && key.latitude !== null && key.longitude !== null
    && Number.isFinite(key.latitude) && Number.isFinite(key.longitude)) {
    or.push({
      nomeNormalizado: key.nomeNormalizado,
      latitude: { gte: key.latitude - DEDUP_BOX_DEG, lte: key.latitude + DEDUP_BOX_DEG },
      longitude: { gte: key.longitude - DEDUP_BOX_DEG, lte: key.longitude + DEDUP_BOX_DEG },
    });
  }
  if (or.length === 0) return [];
  return tx.company.findMany({ where: { OR: or }, orderBy: { createdAt: 'asc' }, ...companyWithAliases });
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

/**
 * Aplica a empresa encontrada a uma Empresa existente: mescla cadastral (recalculando
 * `nomeNormalizado`), preenche `osmId` vazio e, se a Empresa já tem outro `osmId`, registra
 * o encontrado como alias (Req. 9.4, 9.16).
 */
async function applyToExisting(
  tx: Prisma.TransactionClient,
  current: CompanyRow,
  found: FoundCompany,
  key: CompanyKey,
): Promise<void> {
  // O patch só contém CADASTRAL_FIELDS (garantido por mergeCompanyFields).
  const patch = mergeCompanyFields(current, incomingFields(found)) as Prisma.CompanyUpdateInput;
  if (typeof patch.nome === 'string') patch.nomeNormalizado = normalizeCompanyName(patch.nome);

  const fillOsmId = key.osmId !== null && current.osmId === null;
  const needsAlias = key.osmId !== null && !fillOsmId && !hasOsmIdentifier(current, key.osmId);

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

  if (needsAlias) {
    await tx.$executeRaw`
      INSERT INTO "CompanyAlias" (id, "companyId", source, "externalId", "createdAt")
      VALUES (gen_random_uuid()::text, ${current.id}, 'OSM'::"MiningSource", ${key.osmId}, now())
      ON CONFLICT (source, "externalId") DO NOTHING`;
  }
}

/** Reconsulta a Empresa vencedora de uma corrida de unicidade pelos identificadores do create. */
async function findWinner(tx: Prisma.TransactionClient, key: CompanyKey): Promise<CompanyRow | null> {
  const or: Prisma.CompanyWhereInput[] = [];
  for (const field of IDENTIFIER_FIELDS) {
    const value = key[field];
    if (value !== null) or.push({ [field]: value });
  }
  if (or.length === 0) return null;
  return tx.company.findFirst({ where: { OR: or }, ...companyWithAliases });
}

async function upsertInTx(tx: Prisma.TransactionClient, runId: string, found: FoundCompany): Promise<UpsertResult> {
  const key = toCompanyKey(found);
  const candidates = await findCandidates(tx, key);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const hit = matchCompany(key, candidates.map(toKey));

  let companyId: string;
  let isNew: boolean;
  if (hit?.id && byId.has(hit.id)) {
    await applyToExisting(tx, byId.get(hit.id)!, found, key);
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
      await applyToExisting(tx, winner, found, key);
      companyId = winner.id;
      isNew = false;
    }
  }

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "MiningRunCompany" (id, "runId", "companyId", "isNew", nicho, "createdAt")
    VALUES (gen_random_uuid()::text, ${runId}, ${companyId}, ${isNew}, ${found.nicho}, now())
    ON CONFLICT ("runId", "companyId") DO NOTHING
    RETURNING id`;
  return { companyId, isNew, linked: rows.length > 0 };
}

/**
 * Ingere uma empresa encontrada na Base_de_Empresas e a vincula à mineração.
 * Com `PrismaClient` abre uma transação interativa própria; com um `TransactionClient`
 * roda dentro da transação recebida (os SAVEPOINTs exigem uma transação aberta).
 */
export async function upsertFoundCompany(db: Db, runId: string, found: FoundCompany): Promise<UpsertResult> {
  if ('$transaction' in db) {
    return (db as PrismaClient).$transaction((tx) => upsertInTx(tx, runId, found));
  }
  return upsertInTx(db, runId, found);
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

/**
 * Reserva até `limit` itens não processados da mineração, livres ou com claim expirado
 * (> 90 s). `SKIP LOCKED` faz lotes simultâneos receberem conjuntos disjuntos (Req. 8.7, 8.14).
 */
export async function claimBatch(db: Db, runId: string, token: string, limit: number): Promise<ClaimedItem[]> {
  const n = Math.max(0, Math.floor(limit));
  if (n === 0) return [];
  return db.$queryRaw<ClaimedItem[]>`
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
    SELECT cl.id, cl."runId", cl."companyId", cl.nicho, c.nome, c.bairro, c.cidade, c.website
    FROM claimed cl JOIN "Company" c ON c.id = cl."companyId"
    ORDER BY cl."createdAt", cl.id`;
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

export type PersistResult = 'OK' | 'LOST_CLAIM';

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

/** processados += 1; CONCLUIDA/finishedAt ao atingir `total` (Req. 8.5, 8.7). */
async function incrementProcessed(tx: Prisma.TransactionClient, runId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "MiningRun" SET
      processados = processados + 1,
      status = CASE WHEN processados + 1 >= total THEN 'CONCLUIDA'::"MiningStatus" ELSE status END,
      "finishedAt" = CASE WHEN processados + 1 >= total THEN now() ELSE "finishedAt" END,
      "updatedAt" = now()
    WHERE id = ${runId} AND status = 'EM_ANDAMENTO'::"MiningStatus" AND processados < total`;
}

/**
 * Grava análise + snapshot + progresso numa única transação (Req. 9.7, 9.8).
 * Claim perdido (expirado e retomado por outro lote, ou já processado) → 'LOST_CLAIM', nada gravado.
 */
export async function persistAnalysis(
  db: PrismaClient,
  item: ClaimedItem,
  token: string,
  data: AnalysisData,
): Promise<PersistResult> {
  const { site, classification, breakdown, ai } = data;
  return db.$transaction(async (tx) => {
    if (!(await markProcessed(tx, item, token, null))) return 'LOST_CLAIM';

    const analysis = await tx.companyAnalysis.create({
      data: {
        companyId: item.companyId,
        runId: item.runId,
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
        detalhamento: breakdown as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });

    await tx.miningRunCompany.update({ where: { id: item.id }, data: { analysisId: analysis.id } });
    await tx.company.update({
      where: { id: item.companyId },
      data: {
        categoria: classification.category,
        scoreFinal: breakdown.final,
        prioridade: breakdown.prioridade,
        hasSite: site.hasSite,
        isHttps: site.isHttps,
        lastAnalyzedAt: analysis.createdAt,
      },
    });
    await incrementProcessed(tx, item.runId);
    return 'OK';
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
