/**
 * Orquestração do Minerador de Leads (Etapa 1: Req. 2, 7.7–7.9, 8, 18.4, 18.7, 18.12;
 * Etapa 3: Req. 3.3, 3.6, 3.8, 3.9, 4.3–4.10, 6.2, 10.8).
 *
 * A mineração é executada em passos curtos disparados pelo navegador:
 * - `createRun`: valida, decide as fontes/serviços (`resolveRunSources`) e cria em `PENDENTE`;
 * - `discoverStep`: purga o Cache_Google expirado, geocodifica e trata os nichos pendentes até o
 *   deadline (lease `lockedUntil`), pela Fonte_Google (páginas com cursor retomável) e/ou pela
 *   Fonte_OSM conforme `nichePlan`; no fim poda Redes do Google e grava a Fonte_Efetiva;
 * - `runBatch`: analisa (`analyzeCompany`) até `BATCH_SIZE` empresas reservadas até o deadline.
 *
 * Toda I/O externa vem de `PipelineDeps` (injeção), o que permite testar sem rede.
 * O autor vem sempre de `actorId` (sessão), nunca do corpo da requisição (Req. 18.4).
 */
import { Prisma, type MiningRun, type MiningStatus, type PrismaClient } from '@prisma/client';
import { ApiError, notFound } from '@/lib/api-error';
import type { AiDeps } from './ai';
import { analyzeCompany, AnalysisAbortedError, ANALYSIS_WRITE_MARGIN_MS } from './analysis';
import { isRunCancelled, registerRunAbort, watchRunCancellation } from './cancel';
import type { BrasilApiDeps } from './brasilapi';
import {
  BATCH_SIZE,
  BRASILAPI_RETRY_DELAY_MS,
  BRASILAPI_TIMEOUT_MS,
  GEMINI_TIMEOUT_MS,
  GOOGLE_MAX_PAGES,
  NICHES,
  PAGESPEED_TIMEOUT_MS,
  SITE_TIMEOUT_MS,
  type Niche,
} from './config';
import { effectiveSource } from './dedup';
import { buildRunParamsKey, finalizeDiscovery, validateRunInput } from './filters';
import { purgeExpiredGoogleCache } from './google-cache';
import {
  claimBatch,
  persistAnalysis,
  persistFailure,
  pruneGoogleChains,
  releaseClaims,
  upsertFoundCompany,
  upsertGooglePlace,
  type ClaimedItemV2,
} from './repository';
import type { PageSpeedDeps } from './pagespeed';
import { serviceState } from './services';
import type { SiteAnalyzerDeps } from './site-analyzer';
import {
  excludeChains,
  geocode,
  mergeByOsmId,
  searchNiche,
  type OsmDeps,
  type SearchArea,
} from './sources/osm';
import {
  mergeByPlaceId,
  rectFromArea,
  searchGooglePage,
  type GooglePlacesDeps,
  type PageOutcome,
  type Rect,
} from './sources/google-places';
import { normalizeText } from './text';
import type { SourceMode, UnavailableReason } from './types';
import { monthKey, type UsageGate, type UsageProvider } from './usage';

export interface PipelineDeps {
  db: PrismaClient;
  osm: OsmDeps;
  /** Fonte_Google (Places API); `http = null` sem chave. */
  google: GooglePlacesDeps;
  site: SiteAnalyzerDeps;
  ai: AiDeps;
  /** Analisador_PageSpeed. */
  pagespeed: PageSpeedDeps;
  /** Enriquecedor_CNPJ (BrasilAPI). */
  cnpj: BrasilApiDeps;
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
  /** Modo_Fonte solicitado (Req. 4.3). */
  fonteSolicitada: SourceMode;
  /** Fonte_Efetiva (provisória até o fim da descoberta, Req. 4.7). */
  fonte: SourceMode;
  /** Motivo do Google Places não usado (Req. 4.3, 4.6, 4.9). */
  googleMotivo: GoogleUnavailableReason | null;
  /** ids dos Nichos que o Google não atendeu (Req. 4.6). */
  googleNichosAfetados: string[];
  pagespeedEnabled: boolean;
  pagespeedMotivo: UnavailableReason | null;
  cnpjEnabled: boolean;
}

/** Motivos de indisponibilidade do Google Places gravados na Mineracao. */
export type GoogleUnavailableReason = 'SEM_CHAVE' | 'COTA_ESGOTADA' | 'ERRO';

/** Cursor da paginação do Google, retomável entre passos (Req. 3.3, 4.10). */
export interface GoogleCursor {
  nicheId: string;
  /** Páginas já obtidas deste Nicho. */
  page: number;
  /** Token da próxima página; null = primeira página. */
  pageToken: string | null;
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

/**
 * Margem por empresa (Req. 10.8): 10 s do site + o maior pior caso dos serviços habilitados no
 * bloco paralelo (PageSpeed 30 s; CNPJ 8 + 2 + 8 = 18 s; IA 20 s) + 2 s de gravação. Puro.
 * Sem nenhum serviço: 12 s; só IA (Etapa 1): 32 s; com PageSpeed: 42 s.
 */
export function perCompanyMarginMs(run: { iaEnabled: boolean; pagespeedEnabled: boolean; cnpjEnabled: boolean }): number {
  const parallel = Math.max(
    0,
    run.pagespeedEnabled ? PAGESPEED_TIMEOUT_MS : 0,
    run.cnpjEnabled ? 2 * BRASILAPI_TIMEOUT_MS + BRASILAPI_RETRY_DELAY_MS : 0,
    run.iaEnabled ? GEMINI_TIMEOUT_MS : 0,
  );
  return SITE_TIMEOUT_MS + parallel + ANALYSIS_WRITE_MARGIN_MS;
}

/** Pior caso de uma empresa na Etapa 1 (site + IA + gravação, Req. 8.4) = `perCompanyMarginMs` só com IA. */
export const PER_COMPANY_MARGIN_MS = perCompanyMarginMs({ iaEnabled: true, pagespeedEnabled: false, cnpjEnabled: false });
/** Concorrência de análise dentro de um lote. */
export const BATCH_CONCURRENCY = 3;
/** Duração do lease da descoberta (> orçamento de 50 s). */
export const DISCOVERY_LEASE_SECONDS = 70;
/** Tempo mínimo restante para pedir mais uma página ao Google; senão grava o cursor e encerra o passo. */
export const GOOGLE_PAGE_MARGIN_MS = 20_000;

const ACTIVE_STATUSES: MiningStatus[] = ['PENDENTE', 'EM_ANDAMENTO'];
const NICHE_BY_ID = new Map<string, Niche>(NICHES.map((n) => [n.id, n]));

// ---------------------------------------------------------------------------
// Progresso
// ---------------------------------------------------------------------------

/** Lê um campo Json que deveria ser `string[]`, descartando valores inesperados. */
function jsonStringArray(v: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

const SOURCE_MODES: ReadonlySet<string> = new Set<SourceMode>(['OSM', 'GOOGLE', 'MISTA']);
const GOOGLE_REASONS: ReadonlySet<string> = new Set<GoogleUnavailableReason>(['SEM_CHAVE', 'COTA_ESGOTADA', 'ERRO']);
const UNAVAILABLE_REASONS: ReadonlySet<string> = new Set<UnavailableReason>([
  'SEM_CHAVE',
  'COTA_ESGOTADA',
  'ERRO',
  'DESABILITADO_NA_MINERACAO',
]);

const asSourceMode = (v: unknown): SourceMode => (typeof v === 'string' && SOURCE_MODES.has(v) ? (v as SourceMode) : 'OSM');
const asGoogleReason = (v: unknown): GoogleUnavailableReason | null =>
  typeof v === 'string' && GOOGLE_REASONS.has(v) ? (v as GoogleUnavailableReason) : null;
const asUnavailableReason = (v: unknown): UnavailableReason | null =>
  typeof v === 'string' && UNAVAILABLE_REASONS.has(v) ? (v as UnavailableReason) : null;

/** Lê o `googleCursor` gravado; valores inesperados viram null. */
export function parseGoogleCursor(v: unknown): GoogleCursor | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  if (typeof c.nicheId !== 'string' || typeof c.page !== 'number' || !Number.isInteger(c.page) || c.page < 0) {
    return null;
  }
  const pageToken = typeof c.pageToken === 'string' && c.pageToken !== '' ? c.pageToken : null;
  return { nicheId: c.nicheId, page: c.page, pageToken };
}

type RunProgressSource = Pick<
  MiningRun,
  'id' | 'status' | 'processados' | 'total' | 'errorMessage' | 'nichosFalhos' | 'iaDisabledReason'
> &
  Partial<
    Pick<
      MiningRun,
      | 'fonteSolicitada'
      | 'fonte'
      | 'googleMotivo'
      | 'googleNichosAfetados'
      | 'pagespeedEnabled'
      | 'pagespeedMotivo'
      | 'cnpjEnabled'
    >
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
    fonteSolicitada: asSourceMode(run.fonteSolicitada),
    fonte: asSourceMode(run.fonte),
    googleMotivo: asGoogleReason(run.googleMotivo),
    googleNichosAfetados: jsonStringArray(run.googleNichosAfetados),
    pagespeedEnabled: run.pagespeedEnabled === true,
    pagespeedMotivo: asUnavailableReason(run.pagespeedMotivo),
    cnpjEnabled: run.cnpjEnabled === true,
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

/** Disponibilidade de um serviço no momento da criação. */
export interface ServiceAvailability {
  available: boolean;
  motivo: 'SEM_CHAVE' | 'COTA_ESGOTADA' | null;
}

export interface RunSources {
  fonteSolicitada: SourceMode;
  /** Fonte provisória: `OSM` se o Google não será usado; senão a solicitada. */
  fonte: SourceMode;
  googleMotivo: GoogleUnavailableReason | null;
  pagespeedEnabled: boolean;
  pagespeedMotivo: UnavailableReason | null;
  cnpjEnabled: boolean;
}

/**
 * Decide as fontes e os serviços de uma Mineracao (Req. 4.3, 10.1, 12.7). Puro.
 * - `GOOGLE`/`MISTA` com Google indisponível → `fonte = OSM` e `googleMotivo` = motivo;
 * - PageSpeed pedido e indisponível → desabilitado com o motivo;
 * - BrasilAPI não tem chave nem cota: `cnpjEnabled` = pedido.
 */
export function resolveRunSources(
  req: { fonte: SourceMode; pagespeedEnabled: boolean; cnpjEnabled: boolean },
  avail: { google: ServiceAvailability; pagespeed: ServiceAvailability },
): RunSources {
  const wantsGoogle = req.fonte !== 'OSM';
  const googleMotivo = wantsGoogle && !avail.google.available ? (avail.google.motivo ?? 'ERRO') : null;
  const pagespeedMotivo =
    req.pagespeedEnabled && !avail.pagespeed.available ? (avail.pagespeed.motivo ?? 'COTA_ESGOTADA') : null;
  return {
    fonteSolicitada: req.fonte,
    fonte: wantsGoogle && googleMotivo === null ? req.fonte : 'OSM',
    googleMotivo,
    pagespeedEnabled: req.pagespeedEnabled && pagespeedMotivo === null,
    pagespeedMotivo,
    cnpjEnabled: req.cnpjEnabled,
  };
}

/**
 * Uso do mês de um provedor. Falha na leitura conta como "disponível": a cota continua sendo
 * garantida pelo Portao_Uso em cada requisição (`reserve`, Req. 2.4, 2.5).
 */
async function monthCount(usage: UsageGate, provider: UsageProvider, now: Date): Promise<number> {
  try {
    const n = await usage.count(provider, monthKey(now));
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    console.error('[lead-miner] falha ao ler o uso do mês', provider, e);
    return 0;
  }
}

/** Google Places: chave (cliente HTTP) e uso do mês < limite (Req. 2.1). */
async function googleAvailability(google: GooglePlacesDeps): Promise<ServiceAvailability> {
  if (google.http === null) return { available: false, motivo: 'SEM_CHAVE' };
  const count = await monthCount(google.usage, 'places', google.now());
  const s = serviceState({ requiresKey: true, hasKey: true, count, limit: google.limit });
  return { available: s.available, motivo: s.motivo };
}

/** PageSpeed: sem chave obrigatória; uso do mês < limite (Req. 2.2). */
async function pagespeedAvailability(pagespeed: PageSpeedDeps): Promise<ServiceAvailability> {
  const count = await monthCount(pagespeed.usage, 'pagespeed', pagespeed.now());
  const s = serviceState({ requiresKey: false, hasKey: pagespeed.hasKey, count, limit: pagespeed.limit });
  return { available: s.available, motivo: s.motivo };
}

const AVAILABLE: ServiceAvailability = { available: true, motivo: null };

/**
 * Valida os parâmetros e cria a mineração em `PENDENTE`.
 * - Parâmetros inválidos → 400 `{ error, fields }`, nada é criado.
 * - IA pedida sem cliente Gemini → `iaEnabled = false`, `iaDisabledReason = 'SEM_CHAVE'`.
 * - Fonte/PageSpeed/CNPJ decididos por `resolveRunSources` (Req. 4.3); o uso do mês só é lido
 *   para os serviços pedidos.
 * - Mesmo autor + mesmo `paramsKey` ativo → 409 `{ error, runId }` (checagem otimista; a corrida
 *   é fechada pelo índice único parcial `MiningRun_one_active_per_author_params` → P2002 → 409).
 *   As opções novas não entram no `paramsKey`.
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

  const [google, pagespeed] = await Promise.all([
    v.fonte !== 'OSM' ? googleAvailability(deps.google) : Promise.resolve(AVAILABLE),
    v.pagespeedEnabled ? pagespeedAvailability(deps.pagespeed) : Promise.resolve(AVAILABLE),
  ]);
  const sources = resolveRunSources(v, { google, pagespeed });

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
        fonteSolicitada: sources.fonteSolicitada,
        fonte: sources.fonte,
        googleMotivo: sources.googleMotivo,
        pagespeedEnabled: sources.pagespeedEnabled,
        pagespeedMotivo: sources.pagespeedMotivo,
        cnpjEnabled: sources.cnpjEnabled,
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
// Plano por Nicho (Req. 4.4, 4.5, 4.6, 4.8) — puro
// ---------------------------------------------------------------------------

/** Próximo passo de um Nicho na descoberta. */
export type NicheStep = 'GOOGLE_PAGE' | 'OSM' | 'DONE' | 'FAILED';

export interface NichePlanState {
  /** Google Places ainda disponível na Mineracao (sem `googleMotivo`). */
  googleAvailable: boolean;
  /** Nicho em `nichosGoogleProcessados` (todas as páginas obtidas). */
  googleDone: boolean;
  /** Nicho em `nichosGoogleFalhos`. */
  googleFailed: boolean;
  /** Fonte_OSM neste Nicho: ainda não consultada, ok ou falha. */
  osm: 'PENDING' | 'OK' | 'FAILED';
}

/**
 * Decide o próximo passo de um Nicho a partir do Modo_Fonte solicitado e do estado do Nicho:
 * - Google primeiro (em `GOOGLE`/`MISTA`, enquanto disponível e o Nicho não terminou nele);
 * - OSM sempre em `OSM` e `MISTA`; em `GOOGLE` só se o Google falhou ou não foi consultado (Req. 4.5);
 * - `DONE` se ao menos uma fonte atendeu; `FAILED` se nenhuma atendeu (Req. 4.8).
 */
export function nichePlan(mode: SourceMode, s: NichePlanState): NicheStep {
  const usesGoogle = mode !== 'OSM';
  if (usesGoogle && s.googleAvailable && !s.googleDone && !s.googleFailed) return 'GOOGLE_PAGE';
  const googleOk = usesGoogle && s.googleDone;
  const needsOsm = mode !== 'GOOGLE' || !googleOk;
  if (needsOsm && s.osm === 'PENDING') return 'OSM';
  return googleOk || s.osm === 'OK' ? 'DONE' : 'FAILED';
}

/** Motivo de indisponibilidade do Google a partir do desfecho de uma página; null = só o Nicho falhou. */
export function googleReasonFor(kind: Exclude<PageOutcome, { ok: true }>['kind']): GoogleUnavailableReason | null {
  switch (kind) {
    case 'QUOTA':
      return 'COTA_ESGOTADA';
    case 'FATAL':
      return 'ERRO';
    case 'UNAVAILABLE':
      return 'SEM_CHAVE';
    default:
      return null; // RETRYABLE_EXHAUSTED (Req. 3.7)
  }
}

/**
 * Fonte_Efetiva no fim da descoberta (Req. 4.7): pelas `origem` dos vínculos; sem vínculos,
 * a solicitada se o Google atendeu algum Nicho, senão `OSM`. Puro.
 */
export function finalSource(origens: readonly SourceMode[], opts: { googleUsed: boolean; requested: SourceMode }): SourceMode {
  if (origens.length > 0) return effectiveSource(origens);
  return opts.googleUsed && opts.requested !== 'OSM' ? opts.requested : 'OSM';
}

// ---------------------------------------------------------------------------
// discoverStep (Etapa 1: Req. 2.1, 2.7, 2.9–2.13, 8.8, 8.13; Etapa 3: Req. 3.3, 3.6, 3.8, 3.9,
// 4.4–4.8, 4.10, 6.2)
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

/** osmIds e Place_IDs (da Empresa e aliases por fonte) já vinculados a esta mineração. */
async function linkedIdentifiers(db: PrismaClient, runId: string): Promise<{ osm: Set<string>; google: Set<string> }> {
  const rows = await db.miningRunCompany.findMany({
    where: { runId },
    select: {
      company: {
        select: {
          osmId: true,
          googlePlaceId: true,
          aliases: { select: { source: true, externalId: true } },
        },
      },
    },
  });
  const osm = new Set<string>();
  const google = new Set<string>();
  for (const r of rows) {
    if (r.company.osmId) osm.add(r.company.osmId);
    if (r.company.googlePlaceId) google.add(r.company.googlePlaceId);
    for (const a of r.company.aliases) {
      if (a.source === 'OSM') osm.add(a.externalId);
      else if (a.source === 'GOOGLE') google.add(a.externalId);
    }
  }
  return { osm, google };
}

/** Retângulo da Text Search a partir da área (Req. 3.1); null se a área não tem bbox válido. */
function googleRect(area: SearchArea): Rect | null {
  const r = rectFromArea(area);
  if (!r) return null;
  const coords = [r.low.latitude, r.low.longitude, r.high.latitude, r.high.longitude];
  return coords.every((n) => typeof n === 'number' && Number.isFinite(n)) ? r : null;
}

/**
 * Um passo da descoberta. Sem lease (outra descoberta em curso ou mineração fora de `PENDENTE`)
 * apenas devolve o progresso atual. Purga o Cache_Google expirado (melhor esforço), trata os
 * nichos pendentes em ordem conforme `nichePlan` enquanto houver tempo — páginas do Google com
 * cursor gravado a cada página (retomável, Req. 4.10) e fallback para o OSM (Req. 4.5, 4.6) — e,
 * ao tratar todos, poda Redes do Google, grava a Fonte_Efetiva e decide o destino com
 * `finalizeDiscovery`.
 */
export async function discoverStep(runId: string, deps: PipelineDeps, deadline: number): Promise<RunProgress> {
  const { db } = deps;
  const run = await db.miningRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound(MSG_PIPELINE.mineracaoNaoEncontrada);
  if (run.status !== 'PENDENTE' || !(await acquireDiscoveryLease(db, runId))) {
    return getRunProgress(runId, db);
  }

  // Cancelamento (P2): o sinal da mineração chega às requisições HTTP de Nominatim, Overpass e
  // Google Places. Aborta na hora quando o pedido de cancelamento chega a ESTA instância
  // (`abortRunLocally`) e, se chegar a outra, pelo vigia do status no banco. O `isRunCancelled`
  // entre os passos continua sendo o fallback. Sempre desregistrado no `finally`.
  const { controller, dispose } = registerRunAbort(runId);
  const stopWatching = watchRunCancellation(db, runId, controller);
  const signal = controller.signal;
  const osm = { ...deps.osm, signal };
  const google = { ...deps.google, signal };

  try {
    // 0) Purga oportunista do Conteudo_Google expirado (Req. 6.2); falha não interrompe o passo.
    try {
      await purgeExpiredGoogleCache(db, deps.google.now());
    } catch (e) {
      console.error('[lead-miner] falha na purga do Cache_Google', e);
    }

    // 1) Geocodificação (uma vez por mineração).
    let area: SearchArea | null = isSearchArea(run.area) ? run.area : null;
    if (!area) {
      const geo = await geocode(run.bairro, run.cidade, run.uf, osm);
      if (!geo.ok) {
        // Cancelada durante a geocodificação: não é erro (o status já é CANCELADA).
        if (geo.reason === 'CANCELADA' || signal.aborted) return getRunProgress(runId, db);
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

    // 2) Estado da descoberta.
    const mode = asSourceMode(run.fonteSolicitada);
    const usesGoogle = mode !== 'OSM';
    const selecionados = jsonStringArray(run.nichos);
    const processados = jsonStringArray(run.nichosProcessados);
    const falhos = jsonStringArray(run.nichosFalhos);
    const gProcessados = jsonStringArray(run.nichosGoogleProcessados);
    const gFalhos = jsonStringArray(run.nichosGoogleFalhos);
    const afetados = jsonStringArray(run.googleNichosAfetados);
    let googleMotivo = asGoogleReason(run.googleMotivo);
    let cursor = parseGoogleCursor(run.googleCursor);
    const rect = usesGoogle ? googleRect(area) : null;
    // Mineração antiga sem bbox na área: Google indisponível (ERRO), segue pelo OSM.
    if (usesGoogle && googleMotivo === null && rect === null) googleMotivo = 'ERRO';

    const done = new Set([...processados, ...falhos]);
    const pending = selecionados.filter((id) => !done.has(id));
    const place = { bairro: run.bairro, cidade: run.cidade, uf: run.uf };
    let linked: { osm: Set<string>; google: Set<string> } | null = null;
    const linkedIds = async () => (linked ??= await linkedIdentifiers(db, runId));

    const saveState = async () => {
      await db.miningRun.update({
        where: { id: runId },
        data: {
          nichosProcessados: processados,
          nichosFalhos: falhos,
          nichosGoogleProcessados: gProcessados,
          nichosGoogleFalhos: gFalhos,
          googleNichosAfetados: afetados,
          googleMotivo,
          googleCursor: cursor ? (cursor as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      await renewDiscoveryLease(db, runId);
    };

    // 3) Nichos pendentes, em ordem, até o deadline.
    let paused = false;
    // Cancelada pelo usuário (T1): sai sem gravar nada novo; o que já foi salvo permanece.
    let cancelled = false;
    for (const nicheId of pending) {
      if (deps.now() >= deadline) break;
      if (await isRunCancelled(db, runId)) {
        cancelled = true;
        break;
      }
      const niche = NICHE_BY_ID.get(nicheId);
      const st: NichePlanState = {
        googleAvailable: googleMotivo === null && rect !== null && niche !== undefined,
        googleDone: gProcessados.includes(nicheId),
        googleFailed: gFalhos.includes(nicheId),
        osm: 'PENDING',
      };

      for (; ;) {
        const step = nichePlan(mode, st);

        if (step === 'GOOGLE_PAGE') {
          // Sem tempo para mais uma página: o cursor já está gravado; retoma no próximo passo.
          if (deadline - deps.now() < GOOGLE_PAGE_MARGIN_MS) {
            paused = true;
            break;
          }
          const c: GoogleCursor = cursor?.nicheId === nicheId ? cursor : { nicheId, page: 0, pageToken: null };
          if (await isRunCancelled(db, runId)) {
            cancelled = true;
            paused = true;
            break;
          }
          const r = await searchGooglePage(niche as Niche, place, rect as Rect, c.pageToken, google);
          // Cancelada durante a requisição (abortada em voo ou vista no banco): descarta a página.
          if ((!r.ok && r.kind === 'ABORTED') || signal.aborted || (await isRunCancelled(db, runId))) {
            cancelled = true;
            paused = true;
            break;
          }
          if (r.ok) {
            const ids = await linkedIds();
            // Place_ID já trazido por outro Nicho (ou página) desta Mineracao: mantém o 1º (Req. 3.6).
            const fresh = mergeByPlaceId([r.places.filter((p) => !ids.google.has(p.placeId))]);
            for (const p of fresh) {
              await upsertGooglePlace(db, runId, p, deps.google.now());
              ids.google.add(p.placeId);
            }
            const page = c.page + 1;
            if (r.nextPageToken && page < GOOGLE_MAX_PAGES) {
              cursor = { nicheId, page, pageToken: r.nextPageToken }; // Req. 3.3, 1.4
            } else {
              cursor = null;
              gProcessados.push(nicheId);
              st.googleDone = true;
            }
          } else {
            // QUOTA/FATAL/UNAVAILABLE: Google indisponível no restante (Req. 3.8, 4.6);
            // RETRYABLE_EXHAUSTED: só este Nicho (Req. 3.7).
            const reason = googleReasonFor(r.kind);
            if (reason) {
              googleMotivo = reason;
              st.googleAvailable = false;
            }
            cursor = null;
            gFalhos.push(nicheId);
            st.googleFailed = true;
          }
          await saveState();
          continue;
        }

        if (step === 'OSM') {
          if (deps.now() >= deadline) {
            paused = true; // o estado do Google deste Nicho já está gravado
            break;
          }
          if (await isRunCancelled(db, runId)) {
            cancelled = true;
            paused = true;
            break;
          }
          const result = niche ? await searchNiche(niche, area, osm) : ({ ok: false } as const);
          if (signal.aborted || (await isRunCancelled(db, runId))) {
            cancelled = true;
            paused = true;
            break;
          }
          if (result.ok) {
            const ids = await linkedIds();
            const found = run.excluirRedes ? excludeChains(result.companies) : result.companies;
            const fresh = mergeByOsmId([found.filter((c) => !ids.osm.has(c.osmId))]);
            for (const company of fresh) {
              // Transação própria por empresa; o vínculo único (runId, companyId) mantém a 1ª ocorrência.
              await upsertFoundCompany(db, runId, company, deps.google.now());
              ids.osm.add(company.osmId);
            }
            st.osm = 'OK';
          } else {
            st.osm = 'FAILED';
          }
          continue;
        }

        // DONE / FAILED (Req. 4.8: falho só se nenhuma fonte atendeu).
        (step === 'DONE' ? processados : falhos).push(nicheId);
        if (usesGoogle && !st.googleDone && !afetados.includes(nicheId)) afetados.push(nicheId);
        await saveState();
        break;
      }
      if (paused) break;
    }

    // Cancelada: não finaliza a descoberta (o `updateMany` final só vale em PENDENTE de qualquer forma).
    if (cancelled) return getRunProgress(runId, db);

    // 4) Fim da descoberta quando todos os nichos foram tratados.
    const treated = new Set([...processados, ...falhos]);
    if (selecionados.every((id) => treated.has(id))) {
      await db.$transaction(async (tx) => {
        // Redes do Google precisam enxergar todos os Nichos: poda antes da contagem (Req. 3.9).
        if (run.excluirRedes && usesGoogle) await pruneGoogleChains(tx, runId);
        const total = await tx.miningRunCompany.count({ where: { runId } });
        const origens = await tx.miningRunCompany.findMany({
          where: { runId },
          distinct: ['origem'],
          select: { origem: true },
        });
        const fonte = finalSource(
          origens.map((o) => o.origem),
          { googleUsed: gProcessados.length > 0, requested: mode },
        );
        const outcome = finalizeDiscovery(selecionados, falhos, total);
        await tx.miningRun.updateMany({
          where: { id: runId, status: 'PENDENTE' },
          data: {
            status: outcome.status,
            errorMessage: outcome.errorMessage,
            total,
            fonte,
            googleMotivo,
            googleNichosAfetados: afetados,
            googleCursor: Prisma.DbNull,
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
  } finally {
    stopWatching();
    dispose();
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

/** Opções de análise gravadas na Mineracao. */
type RunAnalysisOptions = Pick<MiningRun, 'iaEnabled' | 'pagespeedEnabled' | 'cnpjEnabled'>;

/**
 * Analisa uma empresa (`analyzeCompany`, Versao_Score 2) e grava o resultado (ou a falha).
 * Lança `BatchDbError` em falha de banco.
 */
async function processItem(
  run: RunAnalysisOptions,
  item: ClaimedItemV2,
  token: string,
  deps: PipelineDeps,
  deadline: number,
  signal?: AbortSignal,
): Promise<'DONE' | 'ABORTED'> {
  let data: Parameters<typeof persistAnalysis>[3] | null = null;
  let failure: string | null = null;
  try {
    data = await analyzeCompany(
      item,
      {
        iaEnabled: run.iaEnabled === true,
        pagespeedEnabled: run.pagespeedEnabled === true,
        cnpjEnabled: run.cnpjEnabled === true,
        deadline,
        signal,
      },
      deps,
    );
  } catch (e) {
    // Cancelada no meio da análise: o resultado seria parcial. Não grava nada (nem falha):
    // a empresa volta ao pool e, se a mineração for cancelada, simplesmente fica sem análise.
    if (e instanceof AnalysisAbortedError || signal?.aborted) return 'ABORTED';
    failure = errorText(e);
  }

  try {
    // 'LOST_CLAIM' (claim expirado e retomado por outro lote) é ignorado.
    if (data) await persistAnalysis(deps.db, item, token, data);
    else await persistFailure(deps.db, item, token, failure ?? 'Falha desconhecida');
  } catch (e) {
    throw new BatchDbError(e);
  }
  return 'DONE';
}

/**
 * Um lote. Fora de `EM_ANDAMENTO` é no-op. Reserva até `BATCH_SIZE` itens, processa com
 * concorrência 3 e só inicia uma empresa se `now + perCompanyMarginMs(run) <= deadline`
 * (Req. 10.8). Itens não iniciados são devolvidos ao pool. Falha de banco → mineração em ERRO,
 * mantendo o já gravado.
 */
export async function runBatch(runId: string, deps: PipelineDeps, deadline: number): Promise<RunProgress> {
  const { db } = deps;
  const run = await db.miningRun.findUnique({ where: { id: runId } });
  if (!run) throw notFound(MSG_PIPELINE.mineracaoNaoEncontrada);
  if (run.status !== 'EM_ANDAMENTO') return getRunProgress(runId, db);

  const token = deps.newToken();
  const margin = perCompanyMarginMs({
    iaEnabled: run.iaEnabled === true,
    pagespeedEnabled: run.pagespeedEnabled === true,
    cnpjEnabled: run.cnpjEnabled === true,
  });
  let items: ClaimedItemV2[];
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
  /** Itens cuja análise foi interrompida pelo cancelamento: nada foi gravado, voltam ao pool. */
  const aborted = new Set<string>();

  // Cancelamento (T1): o controlador é abortado na hora pelo pedido de cancelamento que chegar a
  // esta instância (`abortRunLocally`) ou, se vier de outra instância, pelo vigia do banco.
  const { controller, dispose } = registerRunAbort(runId);
  const stopWatching = watchRunCancellation(db, runId, controller);
  const signal = controller.signal;

  const worker = async () => {
    while (!stop && next < items.length) {
      if (deps.now() + margin > deadline) {
        stop = true;
        return;
      }
      // Entre itens: cancelada → não inicia mais nada (o vigia pode demorar até um ciclo).
      if (signal.aborted || (await isRunCancelled(db, runId))) {
        controller.abort();
        stop = true;
        return;
      }
      const item = items[next++];
      started.add(item.id);
      try {
        const outcome = await processItem(run, item, token, deps, deadline, signal);
        if (outcome === 'ABORTED') aborted.add(item.id);
      } catch (e) {
        dbError ??= e instanceof BatchDbError ? e.cause : e;
        stop = true;
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, items.length) }, worker));
  } finally {
    stopWatching();
    dispose();
  }

  const notStarted = items.filter((i) => !started.has(i.id) || aborted.has(i.id)).map((i) => i.id);
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
