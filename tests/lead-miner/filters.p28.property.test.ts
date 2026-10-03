import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compareRanking, selectMapPoints } from '@/lib/leads/filters';
import { MAP_MAX } from '@/lib/leads/config';
import { arbCoord, arbRankKey } from './support/arb-filters';

const isValid = (lat: number | null, lng: number | null) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/** Empresas com ids únicos; algumas repetidas (mesmo id/nome/score) com outras coordenadas. */
const arbRows = fc
  .uniqueArray(fc.tuple(arbRankKey, arbCoord), { selector: ([k]) => k.id, maxLength: 40 })
  .chain((base) =>
    fc
      .array(fc.tuple(fc.nat(), arbCoord), { maxLength: base.length === 0 ? 0 : 10 })
      .map((dups) => {
        const rows = base.map(([k, [latitude, longitude]]) => ({ ...k, latitude, longitude }));
        for (const [i, [latitude, longitude]] of dups) {
          rows.push({ ...rows[i % base.length], latitude, longitude });
        }
        return rows;
      }),
  )
  .chain((rows) => fc.shuffledSubarray(rows, { minLength: rows.length, maxLength: rows.length }));

// Feature: lead-miner, Property 28: Seleção de pontos do mapa
// **Validates: Requirements 13.1, 13.2**
describe('Property 28: Seleção de pontos do mapa', () => {
  it('retorna as primeiras min(n, max) empresas válidas pelo ranking, sem repetição, e total das válidas', () => {
    expect(MAP_MAX).toBe(2000);
    fc.assert(
      fc.property(arbRows, fc.oneof(fc.constant(MAP_MAX), fc.integer({ min: 0, max: 15 })), (rows, max) => {
        const { points, shown, total } = selectMapPoints(rows, max);

        const validById = new Map<string, (typeof rows)[number]>();
        for (const r of rows) if (isValid(r.latitude, r.longitude) && !validById.has(r.id)) validById.set(r.id, r);
        const expectedIds = [...validById.values()].sort(compareRanking).map((r) => r.id).slice(0, max);

        expect(total).toBe(validById.size);
        expect(shown).toBe(points.length);
        expect(shown).toBe(Math.min(validById.size, max));
        expect(points.map((p) => p.id)).toEqual(expectedIds);
        expect(new Set(points.map((p) => p.id)).size).toBe(points.length);
        for (const p of points) expect(isValid(p.latitude, p.longitude)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
