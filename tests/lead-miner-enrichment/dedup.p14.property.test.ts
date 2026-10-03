// Feature: lead-miner-enrichment, Property 14: Ingestão do Google só toca Place_ID e cache — para qualquer base e lugar do Google que casa com uma Empresa existente, os campos cadastrais próprios ficam idênticos; o Place_ID é gravado se a Empresa não tinha nenhum ou registrado como alias GOOGLE se tinha outro; os demais valores do lugar ficam só no Cache_Google, com expiraEm = obtidoEm + 30 dias.
/**
 * **Validates: Requirements 5.2, 5.3, 5.5, 6.1**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GOOGLE_CACHE_DAYS } from '@/lib/leads/config';
import { CADASTRAL_FIELDS, ingestSourcesInMemory, type InMemoryBase, type InMemoryCompany } from '@/lib/leads/dedup';
import type { GoogleCacheRow } from '@/lib/leads/display';
import { normalizeCompanyName } from '@/lib/leads/text';
import type { GooglePlace } from '@/lib/leads/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2025-06-01T12:00:00Z');

const arbText = fc.option(fc.string({ minLength: 1, maxLength: 12 }), { nil: null });
const arbWord = fc.stringMatching(/^[a-z]{3,8}$/);

/** Cache_Google pré-existente (válido ou expirado) ou ausente. */
const arbOldCache: fc.Arbitrary<GoogleCacheRow | null> = fc.option(
  fc.record({
    nome: fc.string({ maxLength: 10 }),
    endereco: arbText,
    bairro: arbText,
    cidade: arbText,
    uf: arbText,
    telefone: arbText,
    website: arbText,
    latitude: fc.constant(null),
    longitude: fc.constant(null),
    mapsUri: arbText,
    businessStatus: arbText,
    tipos: fc.array(arbWord, { maxLength: 2 }),
    obtidoEm: fc.constant(new Date(NOW.getTime() - 40 * DAY_MS)),
    expiraEm: fc.constantFrom(new Date(NOW.getTime() - DAY_MS), new Date(NOW.getTime() + DAY_MS)),
  }),
  { nil: null },
);

/**
 * Empresa i: nome único (contém o índice), coordenadas bem separadas (~1,1 km entre si),
 * Place_ID próprio `gp-i` opcional e aliases `ga-i-j` opcionais (identificadores únicos na base).
 */
function arbCompany(i: number): fc.Arbitrary<InMemoryCompany> {
  return fc
    .record({
      word: arbWord,
      hasPid: fc.boolean(),
      nAliases: fc.integer({ min: 0, max: 2 }),
      osmId: fc.option(fc.constant(`node/${i}`), { nil: null }),
      endereco: arbText,
      bairro: arbText,
      cidade: arbText,
      uf: arbText,
      telefone: arbText,
      website: arbText,
      marcaRede: arbText,
      assignedTo: fc.option(fc.constant('user-1'), { nil: null }),
      googleCache: arbOldCache,
    })
    .map((r) => {
      const nome = `Empresa ${i} ${r.word}`;
      const c: InMemoryCompany = {
        id: `c-${i}`,
        googlePlaceId: r.hasPid ? `gp-${i}` : null,
        osmId: r.osmId,
        cnpj: null,
        nome,
        nomeNormalizado: normalizeCompanyName(nome),
        nicho: 'padaria',
        endereco: r.endereco,
        bairro: r.bairro,
        cidade: r.cidade,
        uf: r.uf,
        telefone: r.telefone,
        website: r.website,
        latitude: -23.5 + i * 0.01,
        longitude: -46.6,
        marcaRede: r.marcaRede,
        assignedTo: r.assignedTo,
        googleCache: r.googleCache,
      };
      if (r.nAliases > 0) c.googleAliases = Array.from({ length: r.nAliases }, (_, j) => `ga-${i}-${j}`);
      return c;
    });
}

const arbCompanies = fc
  .integer({ min: 1, max: 5 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => arbCompany(i))));

type Mode = 'own' | 'alias' | 'proximity';

const arbCase = arbCompanies.chain((companies) =>
  fc
    .record({
      targetIdx: fc.nat({ max: companies.length - 1 }),
      mode: fc.constantFrom<Mode>('own', 'alias', 'proximity'),
      nome: fc.string({ maxLength: 12 }),
      endereco: arbText,
      bairro: arbText,
      cidade: arbText,
      uf: arbText,
      telefone: arbText,
      website: arbText,
      mapsUri: arbText,
      businessStatus: fc.option(fc.constantFrom('OPERATIONAL', 'CLOSED_TEMPORARILY'), { nil: null }),
      tipos: fc.array(arbWord, { maxLength: 3 }),
      dLat: fc.double({ min: -0.0003, max: 0.0003, noNaN: true }),
      freshPid: fc.stringMatching(/^[A-Za-z0-9_-]{4,12}$/).map((s) => `new-${s}`),
    })
    .map((r) => {
      const target = companies[r.targetIdx];
      // Modo efetivo conforme os identificadores disponíveis no alvo.
      let mode: Mode = r.mode;
      if (mode === 'own' && target.googlePlaceId === null) mode = 'proximity';
      if (mode === 'alias' && !target.googleAliases?.length) mode = 'proximity';
      const placeId =
        mode === 'own'
          ? (target.googlePlaceId as string)
          : mode === 'alias'
            ? (target.googleAliases as string[])[0]
            : r.freshPid;
      const place: GooglePlace = {
        placeId,
        nome: mode === 'proximity' ? target.nome : r.nome,
        nicho: 'padaria',
        endereco: r.endereco,
        bairro: r.bairro,
        cidade: r.cidade,
        uf: r.uf,
        telefone: r.telefone,
        website: r.website,
        latitude: mode === 'proximity' ? (target.latitude as number) + r.dLat : -10 + r.dLat,
        longitude: mode === 'proximity' ? (target.longitude as number) : -40,
        mapsUri: r.mapsUri,
        businessStatus: r.businessStatus,
        tipos: r.tipos,
      };
      return { companies, target, place };
    }),
);

const clone = <T>(v: T): T => structuredClone(v);

describe('Property 14: Ingestão do Google só toca Place_ID e cache', () => {
  it('preserva campos próprios, grava Place_ID/alias e só o Cache_Google (30 dias)', () => {
    fc.assert(
      fc.property(arbCase, ({ companies, target, place }) => {
        const base: InMemoryBase = { companies: clone(companies), links: [] };
        const snapshot = clone(base);
        const out = ingestSourcesInMemory(base, [{ kind: 'GOOGLE', place }], 'run-1', NOW);

        // Entrada não mutada; nenhuma Empresa criada (o lugar casou).
        expect(base).toEqual(snapshot);
        expect(out.companies).toHaveLength(companies.length);

        const after = out.companies.find((c) => c.id === target.id) as InMemoryCompany;
        expect(after).toBeDefined();

        // Campos cadastrais próprios e demais identificadores idênticos (Req. 5.5).
        for (const f of CADASTRAL_FIELDS) expect(after[f]).toEqual(target[f]);
        expect(after.nomeNormalizado).toBe(target.nomeNormalizado);
        expect(after.osmId).toBe(target.osmId);
        expect(after.cnpj).toBe(target.cnpj);
        expect(after.nicho).toBe(target.nicho);
        expect(after.assignedTo).toBe(target.assignedTo);
        expect(after.aliases).toEqual(target.aliases);

        // Place_ID gravado (Req. 5.2) ou registrado como alias GOOGLE (Req. 5.3).
        const known = target.googlePlaceId === place.placeId || (target.googleAliases ?? []).includes(place.placeId);
        if (target.googlePlaceId === null) {
          expect(after.googlePlaceId).toBe(place.placeId);
          expect(after.googleAliases).toEqual(target.googleAliases);
        } else {
          expect(after.googlePlaceId).toBe(target.googlePlaceId);
          expect(after.googleAliases ?? []).toEqual(
            known ? (target.googleAliases ?? []) : [...(target.googleAliases ?? []), place.placeId],
          );
        }

        // Demais valores do lugar só no Cache_Google, válido por 30 dias (Req. 6.1).
        const { placeId: _pid, nicho: _nicho, ...placeValues } = place;
        const cache = after.googleCache as GoogleCacheRow;
        expect(cache).toBeTruthy();
        const { obtidoEm, expiraEm, ...cacheValues } = cache;
        expect(cacheValues).toEqual(placeValues);
        expect(new Date(obtidoEm).getTime()).toBe(NOW.getTime());
        expect(new Date(expiraEm).getTime() - new Date(obtidoEm).getTime()).toBe(GOOGLE_CACHE_DAYS * DAY_MS);
        expect(GOOGLE_CACHE_DAYS).toBe(30);

        // As outras Empresas ficam intactas.
        for (const c of companies) {
          if (c.id === target.id) continue;
          const other = out.companies.find((o) => o.id === c.id) as InMemoryCompany;
          const { fonte: _fonte, ...rest } = other;
          expect(rest).toEqual(c);
        }
      }),
      { numRuns: 200 },
    );
  });
});
