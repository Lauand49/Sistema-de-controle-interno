/**
 * Testes de integração da Reanalise (Tarefa 11.13) contra Postgres real.
 * Pulados sem `RUN_DB_TESTS=1`. Fakes para toda a I/O externa (site, PageSpeed, BrasilAPI, IA,
 * Google Places), banco real para exercitar o lease atômico (`UPDATE … RETURNING`).
 *
 * Cenários (Req. 16.4, 16.5, 16.6, 21.9):
 * - duas Reanalises simultâneas: uma `{ ok: true }`, a outra `{ ok: false, reason: 'EM_CURSO' }`;
 * - Analise com menos de 10 minutos → `{ ok: false, status: 409, reason: 'RECENTE' }`
 *   (uma `CompanyAnalysis` recente de verdade, sem usar `lastAnalyzedAt`);
 * - falha na gravação (`persistReanalysis` rejeita) → mantém a Analise e o snapshot anteriores
 *   e libera o lease (`reanaliseAte` nulo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { reanalyzeCompany } from '@/lib/leads/reanalysis';
import * as repository from '@/lib/leads/repository';
import type { PipelineDeps } from '@/lib/leads/pipeline';
import { fakeResolver, addr } from '../../lead-miner/support/fake-net';
import { fakeBodyTransport } from '../support/fake-transport-body';
import { fakePageSpeed, lighthouseJson } from '../support/fake-pagespeed';
import { fakeBrasilApi, brasilApiJson } from '../support/fake-brasilapi';
import { fakeGemini } from '../support/fake-gemini';
import { memoryUsageGate } from '../support/fake-usage';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import { realSleep } from '../support/scripted';

const db = new PrismaClient();
const skipDb = !process.env.RUN_DB_TESTS;
const NICHE = 'clinica_odontologica';

/** Dependências do pipeline com toda a I/O externa simulada e o banco real. */
function getDeps(): PipelineDeps {
  const sleep = realSleep;
  const nowMs = () => Date.now();
  const nowDate = () => new Date();
  return {
    db,
    now: nowMs,
    newToken: () => 'tok',
    osm: {} as PipelineDeps['osm'],
    google: {
      http: null,
      usage: memoryUsageGate(),
      limit: 1000,
      now: nowDate,
    } as unknown as PipelineDeps['google'],
    site: {
      resolver: fakeResolver({ 'clinica.com': [addr('1.2.3.4')] }),
      transport: fakeBodyTransport(() =>
        Promise.resolve({ status: 200, contentType: 'text/html', body: '<html></html>' }),
      ) as unknown as PipelineDeps['site']['transport'],
      now: nowMs,
    } as unknown as PipelineDeps['site'],
    pagespeed: {
      http: fakePageSpeed([{ status: 200, delayMs: 0, json: lighthouseJson() }], { sleep }),
      usage: memoryUsageGate(),
      limit: 1000,
      now: nowDate,
      hasKey: false,
    } as unknown as PipelineDeps['pagespeed'],
    cnpj: {
      http: fakeBrasilApi([{ status: 200, delayMs: 0, json: brasilApiJson('12345678000199') }], { sleep }),
      limiter: intervalLimiter(100, { now: nowMs, sleep }),
      sleep,
      now: nowDate,
    } as unknown as PipelineDeps['cnpj'],
    ai: {
      client: fakeGemini([{ text: '{}', delayMs: 0 }], { sleep }),
      usage: memoryUsageGate(),
      limit: 1000,
      now: nowDate,
    } as unknown as PipelineDeps['ai'],
  };
}

const deadline = () => Date.now() + 60_000;

/** Cria uma CompanyAnalysis mínima para a Empresa, com `createdAt` do banco (now()). */
async function createRecentAnalysis(companyId: string): Promise<string> {
  const a = await db.companyAnalysis.create({
    data: {
      companyId,
      hasSite: true,
      online: true,
      isHttps: true,
      sslValid: true,
      categoria: 'CRIAR_SITE',
      motivos: [],
      scoreDigital: 0,
      scoreIcp: 0,
      scoreObjetivo: 0,
      scoreFinal: 50,
      prioridade: 'MEDIA',
      detalhamento: {},
      versaoScore: 2,
    },
    select: { id: true },
  });
  return a.id;
}

describe.skipIf(skipDb)('Integration 11.13: Reanálise de Empresa', () => {
  beforeEach(async () => {
    await db.companyAnalysis.deleteMany();
    await db.miningRunCompany.deleteMany();
    await db.companyAlias.deleteMany();
    await db.googlePlaceCache.deleteMany();
    await db.prospectLead.deleteMany();
    await db.miningRun.deleteMany();
    await db.company.deleteMany();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('duas Reanalises simultâneas: uma conclui (ok), a outra retorna EM_CURSO', async () => {
    const company = await db.company.create({
      data: {
        nome: 'Clinica A',
        nomeNormalizado: 'clinica a',
        nicho: NICHE,
        website: 'https://clinica.com',
      },
      select: { id: true },
    });

    const deps = getDeps();
    const [r1, r2] = await Promise.all([
      reanalyzeCompany(company.id, deps, deadline()),
      reanalyzeCompany(company.id, deps, deadline()),
    ]);

    const sucessos = [r1, r2].filter((r) => r.ok);
    const recusados = [r1, r2].filter((r) => !r.ok);
    expect(sucessos).toHaveLength(1);
    expect(recusados).toHaveLength(1);
    expect(recusados[0]).toMatchObject({ ok: false, status: 409, reason: 'EM_CURSO' });

    // Exatamente uma Analise gravada.
    const analyses = await db.companyAnalysis.findMany({ where: { companyId: company.id } });
    expect(analyses).toHaveLength(1);

    // Lease liberado no finally.
    const c = await db.company.findUnique({ where: { id: company.id }, select: { reanaliseAte: true } });
    expect(c!.reanaliseAte).toBeNull();
  });

  it('Analise com menos de 10 minutos retorna 409 RECENTE', async () => {
    const company = await db.company.create({
      data: {
        nome: 'Clinica B',
        nomeNormalizado: 'clinica b',
        nicho: NICHE,
        website: 'https://clinica.com',
      },
      select: { id: true },
    });
    // Analise recente de verdade (createdAt = now() do banco), não via lastAnalyzedAt.
    await createRecentAnalysis(company.id);

    const r = await reanalyzeCompany(company.id, getDeps(), deadline());

    expect(r).toMatchObject({ ok: false, status: 409, reason: 'RECENTE' });

    // Nenhuma nova Analise foi gravada e o lease não ficou preso.
    const count = await db.companyAnalysis.count({ where: { companyId: company.id } });
    expect(count).toBe(1);
    const c = await db.company.findUnique({ where: { id: company.id }, select: { reanaliseAte: true } });
    expect(c!.reanaliseAte).toBeNull();
  });

  it('falha na gravação mantém a Analise e o snapshot anteriores e libera o lease', async () => {
    const company = await db.company.create({
      data: {
        nome: 'Clinica C',
        nomeNormalizado: 'clinica c',
        nicho: NICHE,
        website: 'https://clinica.com',
        scoreFinal: 50,
        categoria: 'CRIAR_SITE',
      },
      select: { id: true },
    });
    // Analise anterior criada há mais de 10 minutos para não barrar a Reanalise.
    const previousId = (
      await db.companyAnalysis.create({
        data: {
          companyId: company.id,
          hasSite: true,
          online: true,
          isHttps: true,
          sslValid: true,
          categoria: 'CRIAR_SITE',
          motivos: [],
          scoreDigital: 0,
          scoreIcp: 0,
          scoreObjetivo: 0,
          scoreFinal: 50,
          prioridade: 'MEDIA',
          detalhamento: {},
          versaoScore: 2,
          createdAt: new Date(Date.now() - 20 * 60_000),
        },
        select: { id: true },
      })
    ).id;

    vi.spyOn(repository, 'persistReanalysis').mockRejectedValueOnce(new Error('Simulated DB error'));

    await expect(reanalyzeCompany(company.id, getDeps(), deadline())).rejects.toThrow('Simulated DB error');

    // Nada gravado: continua só a Analise anterior.
    const analyses = await db.companyAnalysis.findMany({ where: { companyId: company.id } });
    expect(analyses).toHaveLength(1);
    expect(analyses[0]!.id).toBe(previousId);

    // Snapshot preservado e lease liberado.
    const c = await db.company.findUnique({
      where: { id: company.id },
      select: { scoreFinal: true, categoria: true, reanaliseAte: true },
    });
    expect(c!.scoreFinal).toBe(50);
    expect(c!.categoria).toBe('CRIAR_SITE');
    expect(c!.reanaliseAte).toBeNull();
  });
});
