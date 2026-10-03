/**
 * Testes de exemplo do Cache_Google (`lib/leads/google-cache.ts`).
 * Req. 6.1, 6.2, 6.8, 6.9, 6.10, 21.3.
 *
 * Prisma falso em memória (`support/fake-prisma-cache.ts`) e Places API por roteiro
 * (`support/fake-places.ts`).
 */
import { describe, expect, it } from 'vitest';
import { GOOGLE_CACHE_DAYS, GOOGLE_EXPIRED_NAME } from '@/lib/leads/config';
import {
  googleCacheExpiry,
  isCacheValid,
  purgeExpiredGoogleCache,
  refreshGoogleCache,
  writeGoogleCache,
} from '@/lib/leads/google-cache';
import { placeDetailsPath, type GooglePlacesDeps, type PlacesRequest } from '@/lib/leads/sources/google-places';
import { fakePlaces, rawPlace } from './support/fake-places';
import { fakePrismaCache, type FakeCacheRow, type FakeCompany } from './support/fake-prisma-cache';
import { memoryUsageGate } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';

const DAY = 86_400_000;
const NOW = new Date('2025-05-15T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

function company(id: string, over: Partial<FakeCompany> = {}): FakeCompany {
  return { id, nome: `Próprio ${id}`, cnpjNomeFantasia: null, nomeExibicao: `Google ${id}`, googlePlaceId: `pid-${id}`, ...over };
}

/** Linha de cache gravada `obtidoHaDias` atrás (expiraEm = obtidoEm + validade). */
function cache(companyId: string, obtidoHaDias: number, nome = `Google ${companyId}`): FakeCacheRow {
  const obtidoEm = daysAgo(obtidoHaDias);
  return { companyId, placeId: `pid-${companyId}`, nome, obtidoEm, expiraEm: googleCacheExpiry(obtidoEm) };
}

function places(script: ReadonlyArray<ScriptStep<PlacesRequest>>, opts: { limit?: number; noKey?: boolean } = {}) {
  const http = fakePlaces(script);
  const usage = memoryUsageGate();
  const deps: GooglePlacesDeps = {
    http: opts.noKey ? null : http,
    usage,
    limit: opts.limit ?? 1_000,
    now: () => NOW,
    sleep: async () => { },
  };
  return { http, usage, deps };
}

describe('validade do Cache_Google (Req. 6.1)', () => {
  it('expiraEm = obtidoEm + 30 dias', () => {
    expect(GOOGLE_CACHE_DAYS).toBe(30);
    expect(googleCacheExpiry(NOW).getTime() - NOW.getTime()).toBe(30 * DAY);
  });

  it('29 dias: válido; 30 dias completos: expirado', () => {
    expect(isCacheValid(cache('a', 29), NOW)).toBe(true);
    expect(isCacheValid(cache('a', 30), NOW)).toBe(false);
    // Um milissegundo antes dos 30 dias completos ainda é válido.
    expect(isCacheValid({ expiraEm: new Date(NOW.getTime() + 1) }, NOW)).toBe(true);
    expect(isCacheValid(null, NOW)).toBe(false);
  });

  it('writeGoogleCache grava obtidoEm/expiraEm e recalcula nomeExibicao', async () => {
    const fake = fakePrismaCache([company('a', { nomeExibicao: 'Próprio a' })]);
    const place: Parameters<typeof writeGoogleCache>[2] = {
      placeId: 'pid-a',
      nome: 'Nome Google',
      endereco: null,
      bairro: null,
      cidade: null,
      uf: null,
      telefone: null,
      website: null,
      latitude: null,
      longitude: null,
      mapsUri: null,
      businessStatus: null,
      tipos: [],
    };
    await writeGoogleCache(fake.db, 'a', place, NOW);
    expect(fake.caches.get('a')).toMatchObject({ nome: 'Nome Google', obtidoEm: NOW, expiraEm: googleCacheExpiry(NOW) });
    expect(fake.companies.get('a')?.nomeExibicao).toBe('Nome Google');
  });
});

describe('purgeExpiredGoogleCache (Req. 6.2)', () => {
  it('apaga só os expirados e recalcula nomeExibicao das afetadas, numa transação', async () => {
    const fake = fakePrismaCache(
      [
        company('valida'),
        company('fantasia', { cnpjNomeFantasia: 'Fantasia Ltda' }),
        company('propria'),
        company('sem-nome', { nome: '  ' }),
      ],
      [cache('valida', 29), cache('fantasia', 30), cache('propria', 45), cache('sem-nome', 31)],
    );

    expect(await purgeExpiredGoogleCache(fake.db, NOW)).toBe(3);

    expect([...fake.caches.keys()]).toEqual(['valida']);
    expect(fake.companies.get('valida')?.nomeExibicao).toBe('Google valida');
    expect(fake.companies.get('fantasia')?.nomeExibicao).toBe('Fantasia Ltda');
    expect(fake.companies.get('propria')?.nomeExibicao).toBe('Próprio propria');
    expect(fake.companies.get('sem-nome')?.nomeExibicao).toBe(GOOGLE_EXPIRED_NAME);
    // Place_ID é mantido indefinidamente.
    expect(fake.companies.get('propria')?.googlePlaceId).toBe('pid-propria');
    expect(fake.txCount()).toBe(1);
    expect(fake.rawCalls).toHaveLength(1);
    expect(fake.rawCalls[0].values).toEqual([NOW]);
  });

  it('nada expirado: devolve 0 e não altera nada', async () => {
    const fake = fakePrismaCache([company('a')], [cache('a', 1)]);
    expect(await purgeExpiredGoogleCache(fake.db, NOW)).toBe(0);
    expect(fake.caches.has('a')).toBe(true);
    expect(fake.companies.get('a')?.nomeExibicao).toBe('Google a');
  });
});

describe('refreshGoogleCache (Req. 6.8–6.10, 21.3)', () => {
  const expired = () =>
    fakePrismaCache([company('a', { cnpjNomeFantasia: 'Fantasia A', nomeExibicao: 'Fantasia A' })], [cache('a', 30, 'Antigo')]);

  it('Place Details ok: regrava o cache com o Place_ID guardado e recalcula o nome', async () => {
    const fake = expired();
    const { http, deps } = places([{ status: 200, json: rawPlace({ id: 'outro-id' }) }]);

    expect(await refreshGoogleCache(fake.db, 'a', deps)).toBe('UPDATED');
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].path).toBe(placeDetailsPath('pid-a'));
    expect(fake.caches.get('a')).toMatchObject({
      placeId: 'pid-a',
      nome: 'Clínica Sorriso',
      telefone: '(11) 3333-4444',
      obtidoEm: NOW,
      expiraEm: googleCacheExpiry(NOW),
    });
    expect(fake.companies.get('a')?.nomeExibicao).toBe('Clínica Sorriso');
  });

  it('cache válido: FRESH sem chamar o Google', async () => {
    const fake = fakePrismaCache([company('a')], [cache('a', 29)]);
    const { http, usage, deps } = places([]);
    expect(await refreshGoogleCache(fake.db, 'a', deps)).toBe('FRESH');
    expect(http.calls).toHaveLength(0);
    expect(usage.reserveCalls).toHaveLength(0);
  });

  it('sem Place_ID: FRESH; Empresa inexistente: FAILED', async () => {
    const fake = fakePrismaCache([company('a', { googlePlaceId: null })]);
    const { http, deps } = places([]);
    expect(await refreshGoogleCache(fake.db, 'a', deps)).toBe('FRESH');
    expect(await refreshGoogleCache(fake.db, 'x', deps)).toBe('FAILED');
    expect(http.calls).toHaveLength(0);
  });

  it.each<ScriptStep<PlacesRequest>>([{ status: 500 }, { error: 'timeout' }])(
    'falha (%o): FAILED e nada é alterado (Req. 6.9)',
    async (step) => {
      const fake = expired();
      const before = { ...fake.caches.get('a') };
      const { http, deps } = places([step]);
      expect(await refreshGoogleCache(fake.db, 'a', deps)).toBe('FAILED');
      expect(http.calls).toHaveLength(1);
      expect(fake.caches.get('a')).toEqual(before);
      expect(fake.companies.get('a')?.nomeExibicao).toBe('Fantasia A');
    },
  );

  it('indisponível (sem chave): UNAVAILABLE sem requisição nem reserva (Req. 6.9)', async () => {
    const fake = expired();
    const { http, usage, deps } = places([], { noKey: true });
    expect(await refreshGoogleCache(fake.db, 'a', deps)).toBe('UNAVAILABLE');
    expect(http.calls).toHaveLength(0);
    expect(usage.reserveCalls).toHaveLength(0);
    expect(fake.caches.has('a')).toBe(true);
  });

  it('cota esgotada: UNAVAILABLE sem requisição (Req. 6.9)', async () => {
    const fake = expired();
    const { http, deps } = places([], { limit: 0 });
    expect(await refreshGoogleCache(fake.db, 'a', deps)).toBe('UNAVAILABLE');
    expect(http.calls).toHaveLength(0);
  });

  it('404: apaga o cache, mantém o Place_ID e recalcula o nome (Req. 6.10)', async () => {
    const fake = fakePrismaCache([company('a', { nomeExibicao: 'Antigo' })], [cache('a', 31, 'Antigo')]);
    const { deps } = places([{ status: 404 }]);
    expect(await refreshGoogleCache(fake.db, 'a', deps)).toBe('NOT_FOUND');
    expect(fake.caches.has('a')).toBe(false);
    expect(fake.companies.get('a')).toMatchObject({ googlePlaceId: 'pid-a', nomeExibicao: 'Próprio a' });
    expect(fake.txCount()).toBe(1);
  });
});
