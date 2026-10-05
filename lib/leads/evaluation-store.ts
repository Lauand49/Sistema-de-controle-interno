/**
 * T5 — persistência da avaliação básica dos leads "Sem contato".
 *
 * - `evaluateCompanyIds`: pedido manual (botão "Avaliar"): só avalia quem realmente está em
 *   "Sem contato" e ainda não tem avaliação (ou só tem a de regras). Ids inexistentes/que já têm
 *   contato são ignorados; o servidor nunca confia na aba que o cliente diz estar vendo.
 * - `evaluateRunAuto`: ao fim da mineração; respeita o teto de `EVALUATION_AUTO_CAP` leads avaliados
 *   por mineração e é idempotente (chamadas repetidas não passam do teto).
 *
 * Erros de IA viram avaliação por regras (ver `evaluation.ts`); só falhas de banco se propagam.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { contatoWhere } from './contact';
import {
  EVALUATION_AUTO_CAP,
  evaluateMany,
  type EvaluationDeps,
  type EvaluationInput,
  type EvaluationResult,
} from './evaluation';
import { RANKING_ORDER } from './filters';

type Db = Pick<PrismaClient, 'company' | 'miningRun'>;

export interface EvaluationSummary {
  /** Leads que receberam avaliação nesta chamada. */
  avaliados: number;
  porIa: number;
  porRegra: number;
  /** Leads sem contato elegíveis que ficaram de fora (teto ou limite do pedido). */
  restantes: number;
  /** Por que a IA não foi usada em (pelo menos) parte das avaliações, se for o caso. */
  motivoSemIa: string | null;
}

const EMPTY: EvaluationSummary = { avaliados: 0, porIa: 0, porRegra: 0, restantes: 0, motivoSemIa: null };

const SELECT = {
  id: true,
  nome: true,
  nicho: true,
  bairro: true,
  cidade: true,
  website: true,
  hasSite: true,
  isHttps: true,
  analyses: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { pagespeed: true } },
} satisfies Prisma.CompanySelect;

type Row = Prisma.CompanyGetPayload<{ select: typeof SELECT }>;

/** Nota de desempenho (0..100) do último PageSpeed guardado; `null` se não houver/for inválido. */
export function desempenhoFrom(pagespeed: unknown): number | null {
  if (pagespeed === null || typeof pagespeed !== 'object' || Array.isArray(pagespeed)) return null;
  const d = (pagespeed as { desempenho?: unknown }).desempenho;
  return typeof d === 'number' && Number.isFinite(d) && d >= 0 && d <= 100 ? d : null;
}

export function toEvaluationInput(row: Row): EvaluationInput {
  return {
    id: row.id,
    nome: row.nome,
    nicho: row.nicho,
    bairro: row.bairro,
    cidade: row.cidade,
    website: row.website,
    hasSite: row.hasSite,
    isHttps: row.isHttps,
    desempenho: desempenhoFrom(row.analyses[0]?.pagespeed),
  };
}

async function save(db: Db, results: readonly EvaluationResult[], now: Date): Promise<void> {
  for (const r of results) {
    await db.company.update({
      where: { id: r.id },
      data: { avaliacaoResumo: r.resumo, sugestaoAcao: r.sugestao, avaliadoEm: now, fonteAvaliacao: r.fonte },
    });
  }
}

/**
 * Resultados que não podem ser gravados: a IA nem foi tentada por falta de tempo até o prazo da
 * função. Gravá-los como "regras" esconderia o lead do próximo "Avaliar" automático; ficam pendentes.
 */
function splitDeferred(results: readonly EvaluationResult[]): { keep: EvaluationResult[]; deferred: number } {
  const keep = results.filter((r) => !(r.fonte === 'REGRA' && r.motivo === 'IA_SEM_TEMPO'));
  return { keep, deferred: results.length - keep.length };
}

function summarize(results: readonly EvaluationResult[], restantes: number): EvaluationSummary {
  const porIa = results.filter((r) => r.fonte === 'IA').length;
  const semIa = results.find((r) => r.fonte === 'REGRA');
  return {
    avaliados: results.length,
    porIa,
    porRegra: results.length - porIa,
    restantes,
    motivoSemIa: semIa?.motivo ?? null,
  };
}

/** Elegível para o botão: sem contato e (nunca avaliado ou avaliado só por regras). */
function manualWhere(ids: readonly string[], now: Date): Prisma.CompanyWhereInput {
  return {
    AND: [
      { id: { in: [...ids] } },
      contatoWhere('sem', now),
      { OR: [{ avaliadoEm: null }, { fonteAvaliacao: 'REGRA' }] },
    ],
  };
}

export async function evaluateCompanyIds(
  db: Db,
  ids: readonly string[],
  deps: EvaluationDeps,
): Promise<EvaluationSummary> {
  if (ids.length === 0) return EMPTY;
  const now = deps.now();
  const rows = await db.company.findMany({ where: manualWhere(ids, now), select: SELECT, orderBy: RANKING_ORDER });
  if (rows.length === 0) return EMPTY;
  const all = await evaluateMany(rows.map(toEvaluationInput), deps, rows.length);
  const { keep, deferred } = splitDeferred(all);
  await save(db, keep, now);
  return summarize(keep, deferred);
}

export class RunNotFinishedError extends Error {
  constructor() {
    super('A mineração ainda não terminou.');
  }
}

/** Avaliação automática ao fim da mineração (teto `EVALUATION_AUTO_CAP`, idempotente). */
export async function evaluateRunAuto(
  db: Db,
  runId: string,
  deps: EvaluationDeps,
): Promise<EvaluationSummary | null> {
  const run = await db.miningRun.findUnique({ where: { id: runId }, select: { status: true, createdAt: true } });
  if (!run) return null;
  if (run.status !== 'CONCLUIDA') throw new RunNotFinishedError();

  const now = deps.now();
  const linked: Prisma.CompanyWhereInput = { runs: { some: { runId } } };
  const semContato = contatoWhere('sem', now);

  // Já avaliados desde o início desta mineração contam para o teto (chamadas repetidas não o excedem).
  const done = await db.company.count({
    where: { AND: [linked, semContato, { avaliadoEm: { gte: run.createdAt } }] },
  });
  const remaining = Math.max(0, EVALUATION_AUTO_CAP - done);
  // Idempotente: quem já tem avaliação (texto ou data) nunca é reavaliado por este caminho.
  const pendingWhere: Prisma.CompanyWhereInput = {
    AND: [linked, semContato, { avaliadoEm: null }, { avaliacaoResumo: null }],
  };

  if (remaining === 0) {
    return { ...EMPTY, restantes: await db.company.count({ where: pendingWhere }) };
  }
  const rows = await db.company.findMany({
    where: pendingWhere,
    select: SELECT,
    orderBy: RANKING_ORDER,
    take: remaining,
  });
  if (rows.length === 0) return EMPTY;
  const all = await evaluateMany(rows.map(toEvaluationInput), deps, remaining);
  const { keep } = splitDeferred(all);
  await save(db, keep, now);
  const restantes = await db.company.count({ where: pendingWhere });
  return summarize(keep, restantes);
}
