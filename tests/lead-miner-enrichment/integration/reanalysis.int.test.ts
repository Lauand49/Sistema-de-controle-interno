import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { reanalyzeCompany } from '@/lib/leads/reanalysis';
import { fakeResolver, addr } from '../../lead-miner/support/fake-net';
import { fakeBodyTransport } from '../support/fake-transport-body';
import { fakePageSpeed, lighthouseJson } from '../support/fake-pagespeed';
import { fakeBrasilApi, brasilApiJson } from '../support/fake-brasilapi';
import { fakeGemini } from '../support/fake-gemini';
import { memoryUsageGate } from '../support/fake-usage';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import { realSleep } from '../support/scripted';
import * as repository from '@/lib/leads/repository';
import * as googleCache from '@/lib/leads/google-cache';

const db = new PrismaClient();
const skipDb = !process.env.RUN_DB_TESTS;

describe.runIf(!skipDb)('Integration 11.13: Reanálise de Empresa', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    await db.miningRunCompany.deleteMany();
    await db.miningRun.deleteMany();
    await db.companyAnalysis.deleteMany();
    await db.companyAlias.deleteMany();
    await db.googlePlaceCache.deleteMany();
    await db.prospectLead.deleteMany();
    await db.company.deleteMany();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function getDeps() {
    const sleep = realSleep;
    const now = () => Date.now();
    return {
      db,
      now: () => new Date(),
      google: {
        http: { get: vi.fn() },
        now: () => new Date(),
      } as any,
      analysis: {
        site: {
          resolver: fakeResolver({ 'clinica.com': [addr('1.2.3.4')] }),
          transport: fakeBodyTransport(() =>
            Promise.resolve({ status: 200, contentType: 'text/html', body: '<html></html>' })
          ) as any,
          now,
        },
        pagespeed: {
          http: fakePageSpeed([{ status: 200, delayMs: 0, json: lighthouseJson() }], { sleep }),
          usage: memoryUsageGate(),
          limit: 1000,
          now: () => new Date(),
          hasKey: false,
        },
        cnpj: {
          http: fakeBrasilApi([{ status: 200, delayMs: 0, json: brasilApiJson('12345678000199') }], { sleep }),
          limiter: intervalLimiter(100, { now, sleep }),
          sleep,
          now: () => new Date(),
        },
        ai: {
          client: fakeGemini([{ text: '{}', delayMs: 0 }], { sleep }),
          usage: memoryUsageGate(),
          limit: 1000,
          now: () => new Date(),
        },
        now,
      },
    };
  }

  it('duas Reanalises simultâneas: uma conclui, a outra retorna EM_CURSO', async () => {
    const company = await db.company.create({
      data: {
        nome: 'Clinica A',
        nomeNormalizado: 'clinica a',
        nicho: 'clinica_odontologica',
        website: 'https://clinica.com',
      },
    });

    const deps = getDeps();
    const p1 = reanalyzeCompany(
      company.id,
      { iaEnabled: true, pagespeedEnabled: true, cnpjEnabled: true, deadline: Date.now() + 60000 },
      deps
    );
    const p2 = reanalyzeCompany(
      company.id,
      { iaEnabled: true, pagespeedEnabled: true, cnpjEnabled: true, deadline: Date.now() + 60000 },
      deps
    );

    const [r1, r2] = await Promise.all([p1, p2]);

    const results = [r1.status, r2.status];
    expect(results).toContain('OK');
    expect(results).toContain('EM_CURSO');

    const analyses = await db.companyAnalysis.findMany({ where: { companyId: company.id } });
    expect(analyses).toHaveLength(1);
    
    // O lease deve ter sido liberado
    const c = await db.company.findUnique({ where: { id: company.id } });
    expect(c!.reanaliseAte).toBeNull();
  });

  it('Analise com menos de 10 minutos retorna RECENTE', async () => {
    const company = await db.company.create({
      data: {
        nome: 'Clinica B',
        nomeNormalizado: 'clinica b',
        nicho: 'clinica_odontologica',
        website: 'https://clinica.com',
        lastAnalyzedAt: new Date(Date.now() - 5 * 60_000), // 5 min atrás
      },
    });

    const r = await reanalyzeCompany(
      company.id,
      { iaEnabled: true, pagespeedEnabled: true, cnpjEnabled: true, deadline: Date.now() + 60000 },
      getDeps()
    );

    expect(r.status).toBe('RECENTE');
  });

  it('falha na gravação ou durante a análise preserva os dados originais', async () => {
    const company = await db.company.create({
      data: {
        nome: 'Clinica C',
        nomeNormalizado: 'clinica c',
        nicho: 'clinica_odontologica',
        website: 'https://clinica.com',
        scoreFinal: 50,
        categoria: 'CRIAR_SITE',
        lastAnalyzedAt: new Date(Date.now() - 20 * 60_000),
      },
    });

    const deps = getDeps();
    vi.spyOn(repository, 'persistReanalysis').mockRejectedValueOnce(new Error('Simulated DB error'));

    await expect(
      reanalyzeCompany(
        company.id,
        { iaEnabled: true, pagespeedEnabled: true, cnpjEnabled: true, deadline: Date.now() + 60000 },
        deps
      )
    ).rejects.toThrow('Simulated DB error');

    // Verifica se os dados originais foram mantidos e o lease liberado
    const c = await db.company.findUnique({ where: { id: company.id } });
    expect(c!.scoreFinal).toBe(50);
    expect(c!.categoria).toBe('CRIAR_SITE');
    expect(c!.reanaliseAte).toBeNull();
  });

  it('refreshGoogleCache é chamado quando cache expirado ou ausente', async () => {
    const company = await db.company.create({
      data: {
        nome: 'Clinica D',
        nomeNormalizado: 'clinica d',
        nicho: 'clinica_odontologica',
        googlePlaceId: 'ChIJ123',
        lastAnalyzedAt: new Date(Date.now() - 20 * 60_000),
      },
    });

    const deps = getDeps();
    vi.spyOn(googleCache, 'refreshGoogleCache').mockResolvedValueOnce('UPDATED');

    const r = await reanalyzeCompany(
      company.id,
      { iaEnabled: true, pagespeedEnabled: true, cnpjEnabled: true, deadline: Date.now() + 60000 },
      deps
    );

    expect(googleCache.refreshGoogleCache).toHaveBeenCalledTimes(1);
    expect(r.status).toBe('OK');
  });
});
