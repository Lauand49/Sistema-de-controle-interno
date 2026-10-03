/**
 * **Validates: Requirements 6.3, 6.4, 6.11**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GOOGLE_EXPIRED_NAME } from '@/lib/leads/config';
import { displayCompany, type DisplaySource, type GoogleCacheRow, type GoogleField } from '@/lib/leads/display';

// Feature: lead-miner-enrichment, Property 16: For any Empresa com ou sem Cache_Google e qualquer instante now, se now ≥ expiraEm (ou o cache não existe) displayCompany não contém nenhum valor exclusivo do cache, googleFields é vazio e nome segue a ordem nome fantasia → nome próprio → "Empresa do Google (dados expirados)"; se now < expiraEm (incluindo 29 dias e 23 h após a obtenção), cada campo exibido é o do cache quando presente, senão o próprio, e googleFields lista exatamente os campos vindos do cache.

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const TTL = 30 * DAY;
/** Marcador presente só em valores do cache; valores próprios nunca o contêm. */
const MARK = '§G§';
const TEXT_FIELDS = ['endereco', 'bairro', 'cidade', 'uf', 'telefone', 'website'] as const;

const ownText = fc.oneof(
  fc.constant(null),
  fc.constant(''),
  fc.constant('   '),
  fc.stringMatching(/^[A-Za-z0-9 ]{1,12}$/),
);
const cacheText = fc.oneof(
  fc.constant(null),
  fc.constant(''),
  fc.constant('  '),
  fc.stringMatching(/^[A-Za-z0-9 ]{0,10}$/).map((s) => `${s}${MARK}`),
);
const ownCoord = fc.oneof(fc.constant(null), fc.double({ min: -89, max: 89, noNaN: true }), fc.constant(Number.NaN));
// Coordenadas do cache em faixa disjunta das próprias, para serem "exclusivas do cache".
const cacheCoord = fc.oneof(fc.constant(null), fc.double({ min: 100, max: 179, noNaN: true }));

const baseDate = fc.integer({ min: Date.UTC(2023, 0, 1), max: Date.UTC(2027, 0, 1) });

type Gen = { source: DisplaySource; now: Date; expiraMs: number | null };

const scenario: fc.Arbitrary<Gen> = fc
  .record({
    nome: ownText.map((v) => v ?? ''),
    cnpjNomeFantasia: ownText,
    endereco: ownText,
    bairro: ownText,
    cidade: ownText,
    uf: ownText,
    telefone: ownText,
    website: ownText,
    latitude: ownCoord,
    longitude: ownCoord,
    googlePlaceId: fc.oneof(fc.constant(null), fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/)),
    hasCache: fc.boolean(),
    cache: fc.record({
      nome: cacheText.map((v) => v ?? ''),
      endereco: cacheText,
      bairro: cacheText,
      cidade: cacheText,
      uf: cacheText,
      telefone: cacheText,
      website: cacheText,
      latitude: cacheCoord,
      longitude: cacheCoord,
      mapsUri: fc.constant(`https://maps.example/${MARK}`),
      businessStatus: fc.constant(`OPERATIONAL${MARK}`),
      tipos: fc.constant([`tipo${MARK}`]),
    }),
    obtido: baseDate,
    // Deslocamento de now relativo à obtenção: antes, dentro (inclui 29d23h), na fronteira e depois.
    offset: fc.oneof(
      fc.integer({ min: -DAY, max: 60 * DAY }),
      fc.constantFrom(0, 29 * DAY + 23 * HOUR, TTL - 1, TTL, TTL + 1),
    ),
    asString: fc.boolean(),
  })
  .map((r) => {
    const expiraMs = r.obtido + TTL;
    const googleCache: GoogleCacheRow | null = r.hasCache
      ? {
          ...r.cache,
          obtidoEm: r.asString ? new Date(r.obtido).toISOString() : new Date(r.obtido),
          expiraEm: r.asString ? new Date(expiraMs).toISOString() : new Date(expiraMs),
        }
      : null;
    const source: DisplaySource = {
      nome: r.nome,
      cnpjNomeFantasia: r.cnpjNomeFantasia,
      endereco: r.endereco,
      bairro: r.bairro,
      cidade: r.cidade,
      uf: r.uf,
      telefone: r.telefone,
      website: r.website,
      latitude: r.latitude,
      longitude: r.longitude,
      googlePlaceId: r.googlePlaceId,
      googleCache,
    };
    return { source, now: new Date(r.obtido + r.offset), expiraMs: r.hasCache ? expiraMs : null };
  });

const present = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
const fin = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v);

function expectedOwnName(s: DisplaySource): string {
  if (present(s.cnpjNomeFantasia)) return s.cnpjNomeFantasia;
  if (present(s.nome)) return s.nome;
  return GOOGLE_EXPIRED_NAME;
}

describe('Property 16: Conteúdo do Google expirado nunca é exibido', () => {
  it('cache ausente/expirado → só valores próprios; cache válido → cache quando presente', () => {
    fc.assert(
      fc.property(scenario, ({ source, now, expiraMs }) => {
        const out = displayCompany(source, now);
        const valid = expiraMs !== null && now.getTime() < expiraMs;

        if (!valid) {
          expect(out.googleFields).toEqual([]);
          expect(JSON.stringify(out)).not.toContain(MARK);
          expect(out.nome).toBe(expectedOwnName(source));
          for (const f of TEXT_FIELDS) expect(out[f]).toBe(source[f]);
          expect(out.latitude).toBe(fin(source.latitude) ? source.latitude : null);
          expect(out.longitude).toBe(fin(source.longitude) ? source.longitude : null);
          expect(out.coordsFromGoogle).toBe(false);
          if (out.google) expect(out.google.cacheStatus).toBe('AUSENTE');
          return;
        }

        const cache = source.googleCache!;
        const fields: GoogleField[] = [];
        if (present(cache.nome)) {
          expect(out.nome).toBe(cache.nome);
          fields.push('nome');
        } else {
          expect(out.nome).toBe(expectedOwnName(source));
        }
        for (const f of TEXT_FIELDS) {
          if (present(cache[f])) {
            expect(out[f]).toBe(cache[f]);
            fields.push(f);
          } else {
            expect(out[f]).toBe(source[f]);
          }
        }
        if (fin(cache.latitude) && fin(cache.longitude)) {
          expect(out.latitude).toBe(cache.latitude);
          expect(out.longitude).toBe(cache.longitude);
          expect(out.coordsFromGoogle).toBe(true);
          fields.push('coords');
        } else {
          expect(out.latitude).toBe(fin(source.latitude) ? source.latitude : null);
          expect(out.longitude).toBe(fin(source.longitude) ? source.longitude : null);
          expect(out.coordsFromGoogle).toBe(false);
        }
        expect([...out.googleFields].sort()).toEqual([...fields].sort());
        expect(new Set(out.googleFields).size).toBe(out.googleFields.length);
        if (out.google) expect(out.google.cacheStatus).toBe('VALIDO');
        // Campos do cache nunca exibidos diretamente.
        const s = JSON.stringify(out);
        expect(s).not.toContain('maps.example');
        expect(s).not.toContain('OPERATIONAL');
      }),
      { numRuns: 300 },
    );
  });
});
