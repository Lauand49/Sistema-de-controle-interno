/**
 * Testes de integração do repositório e do pipeline contra Postgres real (Tarefa 11.4).
 * Pulados sem `RUN_DB_TESTS=1`. Banco: `DATABASE_URL_TEST` (ou `DATABASE_URL`); as migrações
 * pendentes são aplicadas com `prisma migrate deploy` antes dos testes.
 * Requisitos: 8.3, 8.5, 8.7, 8.13, 8.14, 9.5, 9.6, 9.8, 9.9, 9.11, 9.12, 9.13, 9.14, 9.15, 2.13.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '@/lib/api-error';
import { classify } from '@/lib/leads/classifier';
import { createRun, discoverStep, MSG_PIPELINE, runBatch, type PipelineDeps } from '@/lib/leads/pipeline';
import {
  claimBatch,
  persistAnalysis,
  upsertFoundCompany,
  type AnalysisData,
} from '@/lib/leads/repository';
import { score } from '@/lib/leads/scorer';
import { analyzeSite } from '@/lib/leads/site-analyzer';
import type { FoundCompany } from '@/lib/leads/types';
import {
  cleanup,
  createTestUser,
  elements,
  makeDeps,
  migrateDeploy,
  newPrisma,
  nextOsmNumber,
  RUN_DB_TESTS,
  testDatabaseUrl,
  uniquePrefix,
  type NicheScript,
} from './db-helpers-repo';

const DISCOVERY_DEADLINE = 50_000; // deps.now() = 0
const BATCH_DEADLINE = 10 * 60_000;
const DENTIST = 'clinica_odontologica';
const LAWYER = 'advocacia';

describe.skipIf(!RUN_DB_TESTS)('lead-miner — repositório/pipeline (Postgres)', () => {
  let db: PrismaClient;
  let userId: string | null = null;
  const prefix = uniquePrefix('P');
  let runSeq = 0;

  beforeAll(async () => {
    const url = testDatabaseUrl();
    migrateDeploy(url);
    db = newPrisma(url);
    userId = await createTestUser(db, prefix);
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await cleanup(db, prefix, userId);
    await db.$disconnect();
  }, 60_000);

  /** Cria a mineração (bairro único → paramsKey único) e roda a descoberta até o fim. */
  async function discoveredRun(script: NicheScript, nichos = Object.keys(script), dbOverride?: PrismaClient) {
    const deps = makeDeps(dbOverride ?? db, script);
    const input = {
      bairro: `${prefix} B${++runSeq}`,
      cidade: 'Santos',
      uf: 'SP',
      nichos,
      excluirRedes: false,
      iaEnabled: false,
    };
    const created = await createRun(userId!, input, deps);
    const progress = await discoverStep(created.id, deps, DISCOVERY_DEADLINE);
    return { runId: created.id, deps, progress, input };
  }

  async function analysisData(): Promise<AnalysisData> {
    const site = await analyzeSite(null, makeDeps(db, {}).site);
    return {
      site,
      classification: classify(site),
      breakdown: score({ analysis: site, tier: 1, iaEnabled: false, ai: null }),
      ai: null,
    };
  }

  it('5 lotes simultâneos com 37 empresas → 37 análises, cada empresa uma vez, CONCLUIDA', async () => {
    const { runId, deps, progress } = await discoveredRun({ [DENTIST]: elements(prefix, 'Conc', 37) });
    expect(progress).toMatchObject({ status: 'EM_ANDAMENTO', total: 37, processados: 0, novos: 37 });

    const results = await Promise.all(Array.from({ length: 5 }, () => runBatch(runId, deps, BATCH_DEADLINE)));
    expect(results.every((r) => r.status !== 'ERRO')).toBe(true);

    const run = await db.miningRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run).toMatchObject({ status: 'CONCLUIDA', processados: 37, total: 37 });
    expect(run.finishedAt).not.toBeNull();

    const analyses = await db.companyAnalysis.findMany({ where: { runId }, select: { companyId: true } });
    expect(analyses).toHaveLength(37);
    expect(new Set(analyses.map((a) => a.companyId)).size).toBe(37);

    const links = await db.miningRunCompany.findMany({ where: { runId } });
    expect(links.every((l) => l.processedAt !== null && l.analysisId !== null && !l.failed)).toBe(true);
  }, 60_000);

  it('lote não processa itens com claim vigente de outro lote', async () => {
    const { runId, deps } = await discoveredRun({ [DENTIST]: elements(prefix, 'Claim', 3) });
    const claimed = await claimBatch(db, runId, 'outro-lote', 10);
    expect(claimed).toHaveLength(3);

    const progress = await runBatch(runId, deps, BATCH_DEADLINE);

    expect(progress).toMatchObject({ status: 'EM_ANDAMENTO', processados: 0 });
    expect(await db.companyAnalysis.count({ where: { runId } })).toBe(0);
    const links = await db.miningRunCompany.findMany({ where: { runId } });
    expect(links.every((l) => l.claimToken === 'outro-lote' && l.processedAt === null)).toBe(true);
  });

  it('claim expirado (> 90 s) é retomado; gravação com o token antigo → LOST_CLAIM', async () => {
    const { runId } = await discoveredRun({ [DENTIST]: elements(prefix, 'Exp', 1) });
    const [itemA] = await claimBatch(db, runId, 'token-a', 10);
    expect(itemA).toBeDefined();

    // Ainda vigente: outro lote não recebe o item.
    expect(await claimBatch(db, runId, 'token-b', 10)).toHaveLength(0);

    await db.$executeRaw`UPDATE "MiningRunCompany" SET "claimedAt" = now() - interval '91 seconds' WHERE id = ${itemA.id}`;
    const [itemB] = await claimBatch(db, runId, 'token-b', 10);
    expect(itemB?.id).toBe(itemA.id);

    const data = await analysisData();
    expect(await persistAnalysis(db, itemA, 'token-a', data)).toBe('LOST_CLAIM');
    expect(await db.companyAnalysis.count({ where: { runId } })).toBe(0);

    expect(await persistAnalysis(db, itemB, 'token-b', data)).toBe('OK');
    expect(await db.companyAnalysis.count({ where: { runId } })).toBe(1);
    const run = await db.miningRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run).toMatchObject({ status: 'CONCLUIDA', processados: 1 });
  });

  it('corrida de osmId entre minerações → 1 Company e o outro vínculo com isNew=false', async () => {
    const a = await discoveredRun({ [DENTIST]: [] });
    const b = await discoveredRun({ [DENTIST]: [] });

    for (let i = 0; i < 5; i++) {
      const found: FoundCompany = {
        osmId: `node/${nextOsmNumber()}`,
        nome: `${prefix} Corrida ${i}`,
        nicho: DENTIST,
        endereco: null,
        bairro: null,
        cidade: null,
        uf: null,
        telefone: null,
        website: null,
        latitude: null,
        longitude: null,
        marcaRede: null,
      };
      const [ra, rb] = await Promise.all([
        upsertFoundCompany(db, a.runId, found),
        upsertFoundCompany(db, b.runId, found),
      ]);

      expect(ra.companyId).toBe(rb.companyId);
      expect([ra.isNew, rb.isNew].filter(Boolean)).toHaveLength(1);
      expect(await db.company.count({ where: { osmId: found.osmId } })).toBe(1);

      const links = await db.miningRunCompany.findMany({
        where: { companyId: ra.companyId },
        select: { runId: true, isNew: true },
      });
      expect(links).toHaveLength(2);
      expect(links.filter((l) => l.isNew)).toHaveLength(1);
    }
  });

  it('nicho parcialmente falho → segue e termina CONCLUIDA mantendo nichosFalhos', async () => {
    const { runId, deps, progress } = await discoveredRun({
      [DENTIST]: elements(prefix, 'Parcial', 2),
      [LAWYER]: new Error('Overpass indisponível'),
    });
    expect(progress).toMatchObject({ status: 'EM_ANDAMENTO', total: 2, nichosFalhos: [LAWYER] });

    const done = await runBatch(runId, deps, BATCH_DEADLINE);

    expect(done).toMatchObject({ status: 'CONCLUIDA', processados: 2, total: 2, nichosFalhos: [LAWYER] });
  });

  it('descoberta sem empresas (total = 0) → CONCLUIDA direto', async () => {
    const { runId, progress } = await discoveredRun({ [DENTIST]: [] });

    expect(progress).toMatchObject({ status: 'CONCLUIDA', total: 0, processados: 0 });
    const run = await db.miningRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.finishedAt).not.toBeNull();
    expect(run.lockedUntil).toBeNull();
  });

  it('falha no meio da gravação desfaz análise + snapshot; no lote leva a mineração a ERRO', async () => {
    const { runId, deps } = await discoveredRun({ [DENTIST]: elements(prefix, 'Rollback', 3) });
    // Injeta falha na atualização do snapshot (depois de criar a análise, dentro da transação).
    const faulty = db.$extends({
      query: {
        company: {
          async update() {
            throw new Error('falha simulada no snapshot');
          },
        },
      },
    }) as unknown as PrismaClient;

    const [item] = await claimBatch(db, runId, 'token-rb', 1);
    await expect(persistAnalysis(faulty, item, 'token-rb', await analysisData())).rejects.toThrow(
      'falha simulada no snapshot',
    );
    expect(await db.companyAnalysis.count({ where: { runId } })).toBe(0);
    const link = await db.miningRunCompany.findUniqueOrThrow({ where: { id: item.id } });
    expect(link).toMatchObject({ processedAt: null, analysisId: null, failed: false });
    const company = await db.company.findUniqueOrThrow({ where: { id: item.companyId } });
    expect(company).toMatchObject({ scoreFinal: null, categoria: null, lastAnalyzedAt: null });

    // Mesmo defeito via runBatch: mineração vai para ERRO sem gravar nada parcial.
    await db.$executeRaw`UPDATE "MiningRunCompany" SET "claimedAt" = now() - interval '91 seconds' WHERE id = ${item.id}`;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const progress = await runBatch(runId, { ...deps, db: faulty } as PipelineDeps, BATCH_DEADLINE);
      expect(progress).toMatchObject({ status: 'ERRO', errorMessage: MSG_PIPELINE.falhaBanco, processados: 0 });
    } finally {
      errSpy.mockRestore();
    }
    expect(await db.companyAnalysis.count({ where: { runId } })).toBe(0);
  });

  it('índice parcial: createRun concorrente com mesmos parâmetros → um 201 e um 409 com o runId', async () => {
    const deps = makeDeps(db, {});
    const input = { bairro: `${prefix} Dup`, cidade: 'Santos', uf: 'SP', nichos: [DENTIST], excluirRedes: false, iaEnabled: false };

    const settled = await Promise.allSettled([createRun(userId!, input, deps), createRun(userId!, input, deps)]);
    const ok = settled.filter((s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof createRun>>> => s.status === 'fulfilled');
    const bad = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBeInstanceOf(ApiError);
    expect((bad[0].reason as ApiError).status).toBe(409);
    expect((bad[0].reason as ApiError).extra).toEqual({ runId: ok[0].value.id });

    // Terminada a mineração, os mesmos parâmetros voltam a ser aceitos.
    await db.miningRun.update({ where: { id: ok[0].value.id }, data: { status: 'CONCLUIDA' } });
    const again = await createRun(userId!, input, deps);
    expect(again.status).toBe('PENDENTE');
  });

  it('migração preserva índices parciais/CHECKs e ProspectLead.companyId é nulo', async () => {
    const indexes = await db.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN ('User_one_manager_per_department', 'SectorMember_one_manager_per_sector',
                          'MiningRun_one_active_per_author_params')`;
    expect(indexes.map((i) => i.indexname).sort()).toEqual([
      'MiningRun_one_active_per_author_params',
      'SectorMember_one_manager_per_sector',
      'User_one_manager_per_department',
    ]);
    expect(indexes.every((i) => /UNIQUE/.test(i.indexdef) && /WHERE/.test(i.indexdef))).toBe(true);

    const checks = await db.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE contype = 'c' AND conname IN ('User_global_without_department', 'User_department_role_requires_department')`;
    expect(checks).toHaveLength(2);

    const cols = await db.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'ProspectLead' AND column_name = 'companyId'`;
    expect(cols).toEqual([{ is_nullable: 'YES' }]);
  });
});
