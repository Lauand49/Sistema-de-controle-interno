// Feature: lead-miner, Property 3: For any seleção de nichos e for any padrão de falhas por nicho (0 a 3 falhas consecutivas, erro ou timeout), a busca faz exatamente min(falhas + 1, 3) requisições por nicho, aguarda [2000, 4000] na ordem antes das retentativas, marca o nicho como falho somente quando as 3 tentativas falham, continua com os demais nichos, e toda requisição (Nominatim e Overpass, inclusive retentativas) leva o User-Agent OSM_USER_AGENT e as tags OSM do nicho na consulta.
/**
 * **Validates: Requirements 2.3, 2.4, 2.8**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NICHES, OSM_USER_AGENT, RETRY_DELAYS_MS } from '@/lib/leads/config';
import { OVERPASS_URL, geocode, searchNiche, type OsmDeps } from '@/lib/leads/sources/osm';
import { countingLimiter, fakeHttpJson, fakeSleep, timeoutError, type RecordedCall } from './support/fake-osm';

type FailureKind = 'erro' | 'timeout';
const arbFailures = fc.array(fc.constantFrom<FailureKind>('erro', 'timeout'), { maxLength: 3 });

const arbScenario = fc.record({
  geoFailures: arbFailures,
  niches: fc
    .uniqueArray(fc.constantFrom(...NICHES), { minLength: 1, maxLength: 6, selector: (n) => n.id })
    .chain((ns) => fc.tuple(fc.constant(ns), fc.array(arbFailures, { minLength: ns.length, maxLength: ns.length }))),
});

const failure = (k: FailureKind): Error => (k === 'timeout' ? timeoutError() : new Error('HTTP 504'));
const expectedSleeps = (failures: number): number[] => RETRY_DELAYS_MS.slice(0, Math.min(failures, 2));

describe('Property 3: Consultas Overpass, retentativas e User-Agent', () => {
  it('conta requisições, esperas, falhas e cabeçalhos por nicho', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async ({ geoFailures, niches: [niches, failuresPerNiche] }) => {
        // Roteiro: falhas consecutivas da tentativa atual, por alvo.
        let pending: FailureKind[] = [...geoFailures];
        let attempt = 0;
        const http = fakeHttpJson((_call: RecordedCall) => {
          const i = attempt++;
          if (i < pending.length) return failure(pending[i]);
          return _call.url === OVERPASS_URL
            ? { elements: [] }
            : [{ osm_type: 'relation', osm_id: 1 }];
        });
        const limiter = countingLimiter();
        const s = fakeSleep();
        const deps: OsmDeps = { http, limiter, sleep: s.sleep };

        // Geocodificação
        const geo = await geocode('Bairro', 'Cidade', 'SP', deps);
        const geoCalls = Math.min(geoFailures.length + 1, 3);
        expect(http.calls).toHaveLength(geoCalls);
        expect(limiter.count).toBe(geoCalls);
        expect(s.sleeps).toEqual(expectedSleeps(geoFailures.length));
        expect(geo.ok).toBe(geoFailures.length < 3);
        for (const c of http.calls) expect(c.init.headers['User-Agent']).toBe(OSM_USER_AGENT);
        if (!geo.ok) return;

        // Um nicho por vez; a falha de um não impede os demais.
        for (let n = 0; n < niches.length; n++) {
          const niche = niches[n];
          const failures = failuresPerNiche[n];
          pending = [...failures];
          attempt = 0;
          const callsBefore = http.calls.length;
          const sleepsBefore = s.sleeps.length;

          const r = await searchNiche(niche, geo.area, deps);

          const calls = http.calls.slice(callsBefore);
          expect(calls).toHaveLength(Math.min(failures.length + 1, 3));
          expect(s.sleeps.slice(sleepsBefore)).toEqual(expectedSleeps(failures.length));
          expect(r.ok).toBe(failures.length < 3);
          for (const c of calls) {
            expect(c.url).toBe(OVERPASS_URL);
            expect(c.init.headers['User-Agent']).toBe(OSM_USER_AGENT);
            const query = new URLSearchParams(c.init.body).get('data') ?? '';
            for (const t of niche.tags) expect(query).toContain(`nwr["${t.key}"="${t.value}"]`);
          }
        }
        // Nominatim só passa pelo limitador; o Overpass não.
        expect(limiter.count).toBe(geoCalls);
      }),
      { numRuns: 100 },
    );
  });
});
