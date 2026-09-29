/**
 * Orquestração do Minerador de Leads (Req. 2, 7.7–7.9, 8, 18.4, 18.7, 18.12).
 *
 * A mineração é executada em passos curtos disparados pelo navegador:
 * - `createRun`: valida e cria a mineração em `PENDENTE`;
 * - `discoverStep`: geocodifica e consulta os nichos pendentes até o deadline (lease `lockedUntil`);
 * - `runBatch`: analisa até `BATCH_SIZE` empresas reservadas (claim atômico) até o deadline.
 *
 * Toda I/O externa vem de `PipelineDeps` (injeção), o que permite testar sem rede.
 * O autor vem sempre de `actorId` (sessão), nunca do corpo da requisição (Req. 18.4).
 */
import { Prisma, type MiningRun, type MiningStatus, type PrismaClient } from '@prisma/client';
import { ApiError, notFound } from '@/lib/api-error';
import { analyzeWithAi, type AiDeps } from './ai';
import { classify } from './classifier';
import { BATCH_SIZE, NICHES, type Niche } from './config';
import { buildRunParamsKey, finalizeDiscovery, validateRunInput } from './filters';
import {
  claimBatch,
  persistAnalysis,
  persistFailure,
  releaseClaims,
  upsertFoundCompany,
  type ClaimedItem,
} from './repository';
import { score } from './scorer';
import { analyzeSite, type SiteAnalyzerDeps } from './site-analyzer';
import {
  excludeChains,
  geocode,
  mergeByOsmId,
  searchNiche,
  type OsmDeps,
  type SearchArea,
} from './sources/osm';
import { normalizeText } from './text';

export interface PipelineDeps {
  db: PrismaClient;
  osm: OsmDeps;
  site: SiteAnalyzerDeps;
  ai: AiDeps;
  /** Relógio em ms (mesma base do `deadline`). */
  now: () => number;
  /** Token único de claim de um lote. */
  newToken: () => string;
}

export type IaDisabledReason = 'SEM_CHAVE';

export interface RunProgress {
  id: string;
  status: MiningStatus;
  processados: number;
  total: number;
  novos: number;
  existentes: number;
  errorMessage: string | null;
  /** ids dos nichos falhos; a UI mostra os rótulos (Req. 2.14–2.17). */
  nichosFalhos: string[];
  iaDisabledReason: IaDisabledReason | null;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const MSG_PIPELINE = {
  invalido: 'Parâmetros da mineração inválidos.',
  duplicada: 'Já existe uma mineração em andamento com esses parâmetros.',
  bairroNaoEncontrado: 'Bairro não encontrado no OpenStreetMap',
  geocodIndisponivel: 'Serviço de geocodificação (Nominatim) indisponível. Tente novamente mais tarde.',
  falhaBanco: 'Falha ao gravar no banco de dados',
  mineracaoNaoEncontrada: 'Mineração não encontrada.',
} as const;

/** Pior caso de uma empresa: 10 s site + 20 s IA + gravação (Req. 8.4). */
export const PER_COMPANY_MARGIN_MS = 32_000;
/** Concorrência de análise dentro de um lote. */
export const BATCH_CONCURRENCY = 3;
/** Duração do lease da descoberta (> orçamento de 50 s). */
export const DISCOVERY_LEASE_SECONDS = 70;

const ACTIVE_STATUSES: MiningStatus[] = ['PENDENTE', 'EM_ANDAMENTO'];
const NICHE_BY_ID = new Map<string, Niche>(NICHES.map((n) => [n.id, n]));

// ---------------------------------------------------------------------------
// Progresso
// ---------------------------------------------------------------------------

/** Lê um campo Json que deveria ser `string[]`, descartando valores inesperados. */
function jsonStringArray(v: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

type RunProgressSource = Pick<
  MiningRun,
  'id' | 'status' | 'processados' | 'total' | 'errorMessage' | 'nichosFalhos' | 'iaDisabledReason'
>;

/** Monta o `RunProgress` a partir da linha da mineração e das contagens de vínculos. */
export function toRunProgress(
  run: RunProgressSource,
  counts: { novos: number; existentes: number },
): RunProgress {
  return {
    id: run.id,
    status: run.status,
    processados: run.processados,
    total: run.total,
    novos: counts.novos,
    existentes: counts.existentes,
    errorMessage: run.errorMessage,
    nichosFalhos: jsonStringArray(run.nichosFalhos),
    iaDisabledReason: run.iaDisabledReason === 'SEM_CHAVE' ? 'SEM_CHAVE' : null,
  };
}

/** Contagem de vínculos novos/existentes da mineração (`MiningRunCompany.isNew`). */
async function countNewExisting(db: PrismaClient, runId: string): Promise<{ novos: number; existentes: number }> {
  const groups = await db.miningRunCompany.groupBy({
    by: ['isNew'],
    where: { runId },
    _count: { _all: true },
  });
  let novos = 0;
  let existentes = 0;
  for (const g of groups) {
    if (g.isNew) novos += g._count._all;
    else existentes += g._count._all;
  }
  return { novos, existentes };
}

/** Progresso atual da mineração; 404 se não existir. */
export async function getRunProgress(runId: string, db: PrismaClient): Promise<RunProgress> {
  const run = await db.miningRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound(MSG_PIPELINE.mineracaoNaoEncontrada);
  return toRunProgress(run, await countNewExisting(db, runId));
}

/** Leva a mineração a ERRO (só a partir de um status ativo), preservando o que já foi gravado. */
async function markRunError(db: PrismaClient, runId: string, message: string): Promise<void> {
  await db.miningRun.updateMany({
    where: { id: runId, status: { in: ACTIVE_STATUSES } },
    data: { status: 'ERRO', errorMessage: message, finishedAt: new Date(), lockedUntil: null },
  });
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

// ---------------------------------------------------------------------------
// createRun (Req. 7.7, 7.9, 8.1, 8.10, 18.4, 18.7, 18.12)
// ---------------------------------------------------------------------------

async function findActiveRunId(db: PrismaClient, actorId: string, paramsKey: string): Promise<string | null> {
  const run = await db.miningRun.findFirst({
    where: { createdById: actorId, paramsKey, status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return run?.id ?? null;
}

const duplicateRunError = (runId: string) => new ApiError(409, MSG_PIPELINE.duplicada, { runId });

/**
 * Valida os parâmetros e cria a mineração em `PENDENTE`.
 * - Parâmetros inválidos → 400 `{ error, fields }`, nada é criado.
 * - IA pedida sem cliente Gemini → `iaEnabled = false`, `iaDisabledReason = 'SEM_CHAVE'`.
 * - Mesmo autor + mesmo `paramsKey` ativo → 409 `{ error, runId }` (checagem otimista; a corrida
 *   é fechada pelo índice único parcial `MiningRun_one_active_per_author_params` → P2002 → 409).
 */
export async function createRun(actorId: string, input: unknown, deps: PipelineDeps): Promise<RunProgress> {
  const parsed = validateRunInput(input);
  if (!parsed.ok) throw new ApiError(400, MSG_PIPELINE.invalido, { fields: parsed.fields });
  const v = parsed.value;

  const paramsKey = buildRunParamsKey(v);
  const iaRequested = v.iaEnabled;
  const iaEnabled = iaRequested && deps.ai.client != null;
  const iaDisabledReason: IaDisabledReason | null = iaRequested && !iaEnabled ? 'SEM_CHAVE' : null;

  const existing = await findActiveRunId(deps.db, actorId, paramsKey);
  if (existing) throw duplicateRunError(existing);

  let run: MiningRun;
  try {
    run = await deps.db.miningRun.create({
      data: {
        bairro: v.bairro,
        cidade: v.cidade,
        uf: v.uf,
        bairroNorm: normalizeText(v.bairro),
        cidadeNorm: normalizeText(v.cidade),
        nichos: v.nichos,
        excluirRedes: v.excluirRedes,
        iaEnabled,
        iaDisabledReason,
        paramsKey,
        fonte: 'OSM',
        status: 'PENDENTE',
        createdById: actorId,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const winner = await findActiveRunId(deps.db, actorId, paramsKey);
      if (winner) throw duplicateRunError(winner);
    }
    throw e;
  }
  return toRunProgress(run, { novos: 0, existentes: 0 });
}

// ---------------------------------------------------------------------------
// discoverStep (Req. 2.1, 2.7, 2.9–2.13, 8.8, 8.13)
// ---------------------------------------------------------------------------

/** Lease atômico da descoberta: só uma chamada por vez processa a mineração `PENDENTE`. */
async function acquireDiscoveryLease(db: PrismaClient, runId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "MiningRun"
    SET "lockedUntil" = now() + (${DISCOVERY_LEASE_SECONDS}::int * interval '1 second'), "updatedAt" = now()
    WHERE id = ${runId} AND status = 'PENDENTE'::"MiningStatus"
      AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
    RETURNING id`;
  return rows.length > 0;
}

async function renewDiscoveryLease(db: PrismaClient, runId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "MiningRun"
    SET "lockedUntil" = now() + (${DISCOVERY_LEASE_SECONDS}::int * interval '1 second')
    WHERE id = ${runId} AND status = 'PENDENTE'::"MiningStatus"`;
}

async function releaseDiscoveryLease(db: PrismaClient, runId: string): Promise<void> {
  await db.miningRun.update({ where: { id: runId }, data: { lockedUntil: null } });
}

function isSearchArea(v: unknown): v is SearchArea {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  if (a.kind === 'area') return typeof a.areaId === 'number';
  if (a.kind === 'bbox') {
    return ['south', 'west', 'north', 'east'].every((k) => typeof a[k] === 'number');
  }
  return false;
}

/** osmIds (da Empresa e aliases OSM) já vinculados a esta mineração. */
async function linkedOsmIds(db: PrismaClient, runId: string): Promise<Set<string>> {
  const rows = await db.miningRunCompany.findMany({
    where: { runId },
    select: {
      company: {
        select: { osmId: true, aliases: { where: { source: 'OSM' }, select: { externalId: true } } },
      },
    },
  });
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.company.osmId) seen.add(r.company.osmId);
    for (const a of r.company.aliases) seen.add(a.externalId);
  }
  return seen;
}

/**
 * Um passo da descoberta. Sem lease (outra descoberta em curso ou mineração fora de `PENDENTE`)
 * apenas devolve o progresso atual. Processa nichos pendentes em ordem enquanto houver tempo
 * e, ao tratar todos, decide o destino com `finalizeDiscovery`.
 */
export async function discoverStep(runId: string, deps: PipelineDeps, deadline: number): Promise<RunProgress> {
  const { db } = deps;
  const run = await db.miningRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound(MSG_PIPELINE.mineracaoNaoEncontrada);
  if (run.status !== 'PENDENTE' || !(await acquireDiscoveryLease(db, runId))) {
    return getRunProgress(runId, db);
  }

  try {
    // 1) Geocodificação (uma vez por mineração).
    let area: SearchArea | null = isSearchArea(run.area) ? run.area : null;
    if (!area) {
      const geo = await geocode(run.bairro, run.cidade, run.uf, deps.osm);
      if (!geo.ok) {
        await markRunError(
          db,
          runId,
          geo.reason === 'NAO_ENCONTRADO' ? MSG_PIPELINE.bairroNaoEncontrado : MSG_PIPELINE.geocodIndisponivel,
        );
        return getRunProgress(runId, db);
      }
      area = geo.area;
      await db.miningRun.update({ where: { id: runId }, data: { area: area as Prisma.InputJsonValue } });
    }

    // 2) Nichos pendentes, em ordem, até o deadline.
    const selecionados = jsonStringArray(run.nichos);
    const processados = jsonStringArray(run.nichosProcessados);
    const falhos = jsonStringArray(run.nichosFalhos);
    const done = new Set([...processados, ...falhos]);
    const pending = selecionados.filter((id) => !done.has(id));
    let seen: Set<string> | null = null;

    for (const nicheId of pending) {
      if (deps.now() >= deadline) break;
      const niche = NICHE_BY_ID.get(nicheId);
      const result = niche ? await searchNiche(niche, area, deps.osm) : ({ ok: false } as const);

      if (result.ok) {
        seen ??= await linkedOsmIds(db, runId);
        const found = run.excluirRedes ? excludeChains(result.companies) : result.companies;
        const fresh = mergeByOsmId([found.filter((c) => !seen!.has(c.osmId))]);
        for (const company of fresh) {
          // Transação própria por empresa; o vínculo único (runId, companyId) mantém a 1ª ocorrência.
          await upsertFoundCompany(db, runId, company);
          seen.add(company.osmId);
        }
        processados.push(nicheId);
      } else {
        falhos.push(nicheId);
      }
      await db.miningRun.update({
        where: { id: runId },
        data: { nichosProcessados: processados, nichosFalhos: falhos },
      });
      await renewDiscoveryLease(db, runId);
    }

    // 3) Fim da descoberta quando todos os nichos foram tratados.
    const treated = new Set([...processados, ...falhos]);
    if (selecionados.every((id) => treated.has(id))) {
      await db.$transaction(async (tx) => {
        const total = await tx.miningRunCompany.count({ where: { runId } });
        const outcome = finalizeDiscovery(selecionados, falhos, total);
        await tx.miningRun.updateMany({
          where: { id: runId, status: 'PENDENTE' },
          data: {
            status: outcome.status,
            errorMessage: outcome.errorMessage,
            total,
            lockedUntil: null,
            finishedAt: outcome.status === 'EM_ANDAMENTO' ? null : new Date(),
          },
        });
      });
    } else {
      await releaseDiscoveryLease(db, runId);
    }
    return getRunProgress(runId, db);
  } catch (e) {
    console.error('[lead-miner] falha na descoberta', runId, e);
    await markRunError(db, runId, MSG_PIPELINE.falhaBanco).catch(() => undefined);
    await releaseDiscoveryLease(db, runId).catch(() => undefined);
    return getRunProgress(runId, db);
  }
}

// ---------------------------------------------------------------------------
// runBatch (Req. 7.8, 8.2–8.5, 8.7–8.9, 8.11, 8.14)
// ---------------------------------------------------------------------------

/** Erro de gravação no banco durante o lote (irrecuperável para a mineração). */
class BatchDbError extends Error {
  constructor(public cause: unknown) {
    super('Falha de gravação no lote');
  }
}

function errorText(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  return 'Falha inesperada na análise da empresa';
}

/** Analisa uma empresa e grava o resultado (ou a falha). Lança `BatchDbError` em falha de banco. */
async function processItem(
  run: Pick<MiningRun, 'iaEnabled'>,
  item: ClaimedItem,
  token: string,
  deps: PipelineDeps,
): Promise<void> {
  let data: Parameters<typeof persistAnalysis>[3] | null = null;
  let failure: string | null = null;
  try {
    const niche = NICHE_BY_ID.get(item.nicho);
    if (!niche) throw new Error(`Nicho desconhecido: ${item.nicho}`);
    const site = await analyzeSite(item.website, deps.site);
    const classification = classify(site);
    const ai = run.iaEnabled
      ? await analyzeWithAi(
          { nome: item.nome, nicho: niche.label, bairro: item.bairro, cidade: item.cidade, site },
          deps.ai,
        )
      : null;
    const breakdown = score({ analysis: site, tier: niche.tier, iaEnabled: run.iaEnabled, ai });
    data = { site, classification, breakdown, ai };
  } catch (e) {
    failure = errorText(e);
  }

  try {
    // 'LOST_CLAIM' (claim expirado e retomado por outro lote) é ignorado.
    if (data) await persistAnalysis(deps.db, item, token, data);
    else await persistFailure(deps.db, item, token, failure ?? 'Falha desconhecida');
  } catch (e) {
    throw new BatchDbError(e);
  }
}

/**
 * Um lote. Fora de `EM_ANDAMENTO` é no-op. Reserva até `BATCH_SIZE` itens, processa com
 * concorrência 3 e só inicia uma empresa se ainda restarem ≥ 32 s até o deadline. Itens não
 * iniciados são devolvidos ao pool. Falha de banco → mineração em ERRO, mantendo o já gravado.
 */
export async function runBatch(runId: string, deps: PipelineDeps, deadline: number): Promise<RunProgress> {
  const { db } = deps;
  const run = await db.miningRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound(MSG_PIPELINE.mineracaoNaoEncontrada);
  if (run.status !== 'EM_ANDAMENTO') return getRunProgress(runId, db);

  const token = deps.newToken();
  let items: ClaimedItem[];
  try {
    items = await claimBatch(db, runId, token, BATCH_SIZE);
  } catch (e) {
    console.error('[lead-miner] falha ao reservar lote', runId, e);
    await markRunError(db, runId, MSG_PIPELINE.falhaBanco).catch(() => undefined);
    return getRunProgress(runId, db);
  }

  let next = 0;
  let stop = false;
  let dbError: unknown = null;
  const started = new Set<string>();

  const worker = async () => {
    while (!stop && next < items.length) {
      if (deps.now() + PER_COMPANY_MARGIN_MS > deadline) {
        stop = true;
        return;
      }
      const item = items[next++];
      started.add(item.id);
      try {
        await processItem(run, item, token, deps);
      } catch (e) {
        dbError ??= e instanceof BatchDbError ? e.cause : e;
        stop = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, items.length) }, worker));

  const notStarted = items.filter((i) => !started.has(i.id)).map((i) => i.id);
  try {
    await releaseClaims(db, token, notStarted);
  } catch (e) {
    dbError ??= e;
  }

  if (dbError !== null) {
    console.error('[lead-miner] falha de banco no lote', runId, dbError);
    await markRunError(db, runId, MSG_PIPELINE.falhaBanco).catch(() => undefined);
  }
  return getRunProgress(runId, db);
}
