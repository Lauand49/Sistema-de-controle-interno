/**
 * Testes de integração do repositório da Etapa 3 contra Postgres real (Tarefa 10.9).
 * Pulados sem `RUN_DB_TESTS=1` + `TEST_DATABASE_URL` (banco `*_test`; `npm run test:int`); as migrações
 * pendentes são aplicadas com `prisma migrate deploy` antes dos testes.
 *
 * - `prismaUsageGate`: 50 reservas concorrentes por provedor com limite 10 (Req. 19.3).
 * - `applyCnpjInTx` concorrente do mesmo CNPJ em Empresas diferentes (Req. 11.8).
 * - Google + OSM no mesmo Nicho → uma Empresa `MISTA` (Req. 5.4, 21.9).
 * - Reingestão idempotente (Req. 5.6).
 *
 * Todas as linhas usam um prefixo/mês únicos e são removidas no `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertTestDatabase } from '../../support/assert-test-db';
import type { PrismaClient } from '@prisma/client';
import { cnpjCheckDigits, parseCandidates } from '@/lib/leads/cnpj';
import { applyCnpjInTx, upsertFoundCompany, upsertGooglePlace } from '@/lib/leads/repository';
import type { FoundCompany, GooglePlace } from '@/lib/leads/types';
import { prismaUsageGate, type UsageProvider } from '@/lib/leads/usage';
import {
  createTestUser,
  migrateDeploy,
  newPrisma,
  nextOsmNumber,
  RUN_DB_TESTS,
  testDatabaseUrl,
  uniquePrefix,
} from '../../lead-miner/integration/db-helpers-repo';

const NICHE = 'clinica_odontologica';
const NOW = new Date('2030-01-15T12:00:00Z');

describe.skipIf(!RUN_DB_TESTS)('lead-miner-enrichment — repositório (Postgres)', () => {
  let db: PrismaClient;
  let userId: string | null = null;
  const prefix = uniquePrefix('E');
  // Mês fictício e único: não colide com contadores reais de "AAAA-MM".
  const month = `T-${prefix}`;
  const runIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    const url = assertTestDatabase(testDatabaseUrl(), 'teste de integração'); // trava: só *_test
    migrateDeploy(url);
    db = newPrisma(url);
    userId = await createTestUser(db, prefix);
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await db.apiUsage.deleteMany({ where: { month } });
    // Empresas só do Google têm `nome = ''`: remove também as vinculadas às minerações do teste.
    await db.company.deleteMany({
      where: { OR: [{ nome: { startsWith: prefix } }, { runs: { some: { runId: { in: runIds } } } }] },
    });
    if (userId) {
      await db.miningRun.deleteMany({ where: { createdById: userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    await db.$disconnect();
  }, 60_000);

  async function newRun(fonte: 'OSM' | 'GOOGLE' | 'MISTA' = 'MISTA'): Promise<string> {
    const bairro = `${prefix} B${++seq}`;
    const run = await db.miningRun.create({
      data: {
        bairro,
        cidade: 'Santos',
        uf: 'SP',
        bairroNorm: bairro.toLowerCase(),
        cidadeNorm: 'santos',
        nichos: [NICHE],
        paramsKey: `${prefix}-${seq}`,
        fonte,
        fonteSolicitada: fonte,
        status: 'EM_ANDAMENTO',
        createdById: userId!,
      },
      select: { id: true },
    });
    runIds.push(run.id);
    return run.id;
  }

  /** Coordenadas únicas por chamada (evita casar com Empresas de outros testes). */
  function coords(): { latitude: number; longitude: number } {
    const n = ++seq;
    return { latitude: -23.9 - n * 0.01, longitude: -46.3 - n * 0.01 };
  }

  function osmFound(nome: string, at: { latitude: number; longitude: number }): FoundCompany {
    return {
      osmId: `node/${nextOsmNumber()}`,
      nome,
      nicho: NICHE,
      endereco: null,
      bairro: null,
      cidade: 'Santos',
      uf: 'SP',
      telefone: null,
      website: null,
      latitude: at.latitude,
      longitude: at.longitude,
      marcaRede: null,
    };
  }

  function googlePlace(nome: string, at: { latitude: number; longitude: number }): GooglePlace {
    return {
      placeId: `${prefix}-place-${++seq}`,
      nome,
      nicho: NICHE,
      endereco: null,
      bairro: null,
      cidade: 'Santos',
      uf: 'SP',
      telefone: null,
      website: null,
      latitude: at.latitude,
      longitude: at.longitude,
      mapsUri: null,
      businessStatus: 'OPERATIONAL',
      tipos: ['dentist'],
    };
  }

  /** CNPJ alfanumérico válido iniciado por "ZZ" (não colide com CNPJs numéricos reais). */
  function uniqueCnpj(): string {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let base = 'ZZ';
    while (base.length < 12) base += alphabet[Math.floor(Math.random() * alphabet.length)];
    return base + cnpjCheckDigits(base);
  }

  it('prismaUsageGate: 50 reservas concorrentes com limite 10 → exatamente 10 por provedor (independentes)', async () => {
    const gate = prismaUsageGate(db);
    const providers: UsageProvider[] = ['places', 'pagespeed'];
    const attempts = providers.flatMap((p) => Array.from({ length: 50 }, () => ({ p })));
    const results = await Promise.all(attempts.map(({ p }) => gate.reserve(p, month, 10).then((ok) => ({ p, ok }))));

    for (const p of providers) {
      expect(results.filter((r) => r.p === p && r.ok)).toHaveLength(10);
      expect(await gate.count(p, month)).toBe(10);
    }
    // Esgotado: nova reserva falha e não incrementa; o outro provedor/mês não é afetado.
    expect(await gate.reserve('places', month, 10)).toBe(false);
    expect(await gate.count('places', month)).toBe(10);
    expect(await gate.count('gemini', month)).toBe(0);
  }, 60_000);

  it('applyCnpjInTx concorrente do mesmo CNPJ em Empresas diferentes: uma aplica, a outra vira CONFLITO', async () => {
    const cnpj = uniqueCnpj();
    const [a, b] = await Promise.all(
      ['A', 'B'].map((s) =>
        db.company.create({
          data: { nome: `${prefix} Cnpj ${s}`, nomeNormalizado: `${prefix.toLowerCase()} cnpj ${s}`, nicho: NICHE },
          select: { id: true },
        }),
      ),
    );

    const results = await Promise.all(
      [a.id, b.id].map((id) => db.$transaction((tx) => applyCnpjInTx(tx, id, cnpj, 'MANUAL', NOW))),
    );

    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const rows = await db.company.findMany({
      where: { id: { in: [a.id, b.id] } },
      select: { id: true, cnpj: true, cnpjOrigem: true, cnpjCandidatos: true },
    });
    const winner = rows.find((r) => r.cnpj === cnpj)!;
    const loser = rows.find((r) => r.id !== winner.id)!;
    expect(winner.cnpjOrigem).toBe('MANUAL');
    expect(parseCandidates(winner.cnpjCandidatos).some((c) => c.cnpj === cnpj)).toBe(false);
    expect(loser.cnpj).toBeNull();
    expect(losers[0]).toEqual({ ok: false, conflitoCompanyId: winner.id });
    expect(parseCandidates(loser.cnpjCandidatos)).toEqual([
      expect.objectContaining({ cnpj, motivo: 'CONFLITO', conflitoCompanyId: winner.id }),
    ]);
  }, 60_000);

  it.each([
    ['OSM → Google', 'osm-first'],
    ['Google → OSM', 'google-first'],
  ] as const)('Google + OSM no mesmo Nicho de uma Mineracao MISTA resultam numa Empresa MISTA (%s)', async (_l, order) => {
    const runId = await newRun('MISTA');
    const at = coords();
    const nome = `${prefix} Odonto ${order}`;
    const found = osmFound(nome, at);
    // Mesmo nome, ~30 m de distância: casa por nome + proximidade.
    const place = googlePlace(nome, { latitude: at.latitude + 0.0002, longitude: at.longitude + 0.0002 });

    const first = order === 'osm-first' ? await upsertFoundCompany(db, runId, found, NOW) : await upsertGooglePlace(db, runId, place, NOW);
    const second = order === 'osm-first' ? await upsertGooglePlace(db, runId, place, NOW) : await upsertFoundCompany(db, runId, found, NOW);

    expect(first.isNew).toBe(true);
    expect(second).toEqual({ companyId: first.companyId, isNew: false, linked: false });

    const company = await db.company.findUniqueOrThrow({
      where: { id: first.companyId },
      select: { fonte: true, osmId: true, googlePlaceId: true, googleCache: { select: { placeId: true } } },
    });
    expect(company.fonte).toBe('MISTA');
    expect(company.osmId).toBe(found.osmId);
    expect(company.googlePlaceId).toBe(place.placeId);
    expect(company.googleCache?.placeId).toBe(place.placeId);

    const links = await db.miningRunCompany.findMany({ where: { runId }, select: { companyId: true, origem: true, nicho: true } });
    expect(links).toEqual([{ companyId: first.companyId, origem: 'MISTA', nicho: NICHE }]);
  }, 60_000);

  it('reingestão idempotente: mesmos lugares na mesma e em outra Mineracao não duplicam Empresas, aliases nem vínculos', async () => {
    const run1 = await newRun('MISTA');
    const run2 = await newRun('MISTA');
    const at = coords();
    const nome = `${prefix} Reingestao`;
    const found = osmFound(nome, at);
    const place = googlePlace(nome, { latitude: at.latitude + 0.0001, longitude: at.longitude });

    const a = await upsertFoundCompany(db, run1, found, NOW);
    await upsertGooglePlace(db, run1, place, NOW);
    const snapshot = async () =>
      db.company.findUniqueOrThrow({
        where: { id: a.companyId },
        select: {
          nome: true,
          nomeNormalizado: true,
          nomeExibicao: true,
          fonte: true,
          osmId: true,
          googlePlaceId: true,
          aliases: { select: { source: true, externalId: true } },
        },
      });
    const before = await snapshot();

    // Mesma Mineracao: nenhuma alteração, vínculo mantido.
    expect(await upsertFoundCompany(db, run1, found, NOW)).toEqual({ companyId: a.companyId, isNew: false, linked: false });
    expect(await upsertGooglePlace(db, run1, place, NOW)).toEqual({ companyId: a.companyId, isNew: false, linked: false });
    // Outra Mineracao: mesma Empresa, novo vínculo não-novo.
    expect(await upsertGooglePlace(db, run2, place, NOW)).toEqual({ companyId: a.companyId, isNew: false, linked: true });
    expect(await upsertFoundCompany(db, run2, found, NOW)).toEqual({ companyId: a.companyId, isNew: false, linked: false });

    expect(await snapshot()).toEqual(before);
    expect(before.aliases).toEqual([]);
    expect(await db.company.count({ where: { OR: [{ osmId: found.osmId }, { googlePlaceId: place.placeId }] } })).toBe(1);
    expect(await db.googlePlaceCache.count({ where: { companyId: a.companyId } })).toBe(1);

    const links = await db.miningRunCompany.findMany({
      where: { runId: { in: [run1, run2] } },
      select: { runId: true, isNew: true, origem: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(links).toHaveLength(2);
    expect(links.find((l) => l.runId === run1)).toMatchObject({ isNew: true, origem: 'MISTA' });
    expect(links.find((l) => l.runId === run2)).toMatchObject({ isNew: false, origem: 'MISTA' });
  }, 60_000);
});
