import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { matchCompany, type CompanyKey } from '@/lib/leads/dedup';
import { haversineMeters } from '@/lib/leads/geo';
import { arbCompanyKey, arbExistingKeys } from './support/arb-company';

/** Modelo de referência do Deduplicador (Req. 9.1–9.3). */
function referenceMatch(found: CompanyKey, existing: CompanyKey[]): CompanyKey | null {
  const filled = (v: string | null) => (v !== null && v.trim() !== '' ? v.trim() : null);
  for (const field of ['googlePlaceId', 'osmId', 'cnpj'] as const) {
    const v = filled(found[field]);
    if (v === null) continue;
    // Aliases contam como osmId da existente (mesma prioridade).
    const ids = (e: CompanyKey) =>
      field === 'osmId' ? [e.osmId, ...(e.aliases ?? [])].map(filled) : [filled(e[field])];
    const hit = existing.find((e) => ids(e).includes(v));
    if (hit) return hit;
  }
  const hasCoords = (k: CompanyKey) =>
    typeof k.latitude === 'number' &&
    typeof k.longitude === 'number' &&
    Number.isFinite(k.latitude) &&
    Number.isFinite(k.longitude) &&
    Math.abs(k.latitude) <= 90 &&
    Math.abs(k.longitude) <= 180;
  if (found.nomeNormalizado === '' || !hasCoords(found)) return null;
  const candidates = existing
    .filter((e) => e.nomeNormalizado === found.nomeNormalizado && hasCoords(e))
    .map((e) => ({
      e,
      d: haversineMeters(
        { lat: found.latitude as number, lng: found.longitude as number },
        { lat: e.latitude as number, lng: e.longitude as number },
      ),
    }))
    .filter(({ d }) => d <= 100);
  if (candidates.length === 0) return null;
  const minD = Math.min(...candidates.map((c) => c.d));
  return candidates.find((c) => c.d === minD)!.e;
}

describe('Deduplicador', () => {
  // Feature: lead-miner, Property 22: Deduplicação segue o modelo de referência
  // **Validates: Requirements 9.1, 9.2, 9.3, 9.16**
  it('matchCompany coincide com o modelo de referência', () => {
    fc.assert(
      fc.property(arbCompanyKey, arbExistingKeys, (found, existing) => {
        const expected = referenceMatch(found, existing);
        const actual = matchCompany(found, existing);
        expect(actual?.id ?? null).toBe(expected?.id ?? null);
      }),
      { numRuns: 100 },
    );
  });
});
