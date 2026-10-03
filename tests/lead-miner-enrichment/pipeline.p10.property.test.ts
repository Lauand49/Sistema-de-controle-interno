// Feature: lead-miner-enrichment, Property 10: Decisão de fontes por Mineracao e por Nicho
/**
 * **Validates: Requirements 4.3, 4.4, 4.5, 4.8**
 *
 * - `resolveRunSources`: `fonteSolicitada` = pedido; com pedido `GOOGLE`/`MISTA` e Google
 *   indisponível → `fonte = OSM` e `googleMotivo` = motivo; caso contrário `fonte` = pedido e
 *   sem motivo.
 * - `nichePlan` dirigido como máquina de estados com desfechos arbitrários do Google (indisponível,
 *   N páginas e sucesso, N páginas e falha) e do OSM (ok/falha): o OSM é consultado sempre em
 *   `OSM` e `MISTA` e, em `GOOGLE`, só quando o Google falhou ou não foi consultado; o Nicho termina
 *   `FAILED` exatamente quando nenhuma fonte consultada teve sucesso.
 *
 * Funções puras; nada sai para a rede.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nichePlan, resolveRunSources, type NichePlanState, type ServiceAvailability } from '@/lib/leads/pipeline';
import type { SourceMode } from '@/lib/leads/types';

const modeArb = fc.constantFrom<SourceMode>('OSM', 'GOOGLE', 'MISTA');

const availArb: fc.Arbitrary<ServiceAvailability> = fc.oneof(
  fc.constant<ServiceAvailability>({ available: true, motivo: null }),
  fc.constantFrom<ServiceAvailability>(
    { available: false, motivo: 'SEM_CHAVE' },
    { available: false, motivo: 'COTA_ESGOTADA' },
    { available: false, motivo: null },
  ),
);

/** Roteiro do Google no Nicho: indisponível desde o início, ou páginas e então sucesso/falha. */
type GoogleScript = { kind: 'UNAVAILABLE' } | { kind: 'PAGES'; pages: number; ok: boolean };
const googleScriptArb: fc.Arbitrary<GoogleScript> = fc.oneof(
  fc.constant<GoogleScript>({ kind: 'UNAVAILABLE' }),
  fc.record({ kind: fc.constant('PAGES' as const), pages: fc.integer({ min: 1, max: 3 }), ok: fc.boolean() }),
);

/** Executa o plano de um Nicho até `DONE`/`FAILED`, registrando as fontes consultadas. */
function runNiche(mode: SourceMode, g: GoogleScript, osmOk: boolean) {
  const st: NichePlanState = {
    googleAvailable: g.kind !== 'UNAVAILABLE',
    googleDone: false,
    googleFailed: false,
    osm: 'PENDING',
  };
  let googlePages = 0;
  let osmCalls = 0;
  for (let i = 0; i < 20; i++) {
    const step = nichePlan(mode, st);
    if (step === 'DONE' || step === 'FAILED') return { step, googlePages, osmCalls, st };
    if (step === 'GOOGLE_PAGE') {
      googlePages++;
      if (g.kind === 'PAGES' && googlePages >= g.pages) {
        if (g.ok) st.googleDone = true;
        else st.googleFailed = true;
      }
    } else {
      osmCalls++;
      st.osm = osmOk ? 'OK' : 'FAILED';
    }
  }
  throw new Error('nichePlan não terminou');
}

describe('Property 10: decisão de fontes por Mineracao e por Nicho', () => {
  it('resolveRunSources grava pedido, fonte provisória e motivo do Google', () => {
    fc.assert(
      fc.property(modeArb, availArb, availArb, fc.boolean(), fc.boolean(), (fonte, google, pagespeed, ps, cnpj) => {
        const r = resolveRunSources({ fonte, pagespeedEnabled: ps, cnpjEnabled: cnpj }, { google, pagespeed });
        expect(r.fonteSolicitada).toBe(fonte);
        if (fonte !== 'OSM' && !google.available) {
          expect(r.fonte).toBe('OSM');
          expect(r.googleMotivo).toBe(google.motivo ?? 'ERRO');
        } else {
          expect(r.fonte).toBe(fonte);
          expect(r.googleMotivo).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('nichePlan consulta o OSM conforme o modo e falha só sem nenhuma fonte com sucesso', () => {
    fc.assert(
      fc.property(modeArb, googleScriptArb, fc.boolean(), (mode, g, osmOk) => {
        const { step, googlePages, osmCalls } = runNiche(mode, g, osmOk);

        // Google só é consultado em GOOGLE/MISTA e quando disponível, com o número de páginas do roteiro.
        const googleConsulted = mode !== 'OSM' && g.kind === 'PAGES';
        expect(googlePages).toBe(googleConsulted && g.kind === 'PAGES' ? g.pages : 0);
        const googleOk = googleConsulted && g.kind === 'PAGES' && g.ok;

        // OSM: sempre em OSM/MISTA; em GOOGLE só se o Google falhou ou não foi consultado. No máximo 1 vez.
        const osmExpected = mode !== 'GOOGLE' || !googleOk;
        expect(osmCalls).toBe(osmExpected ? 1 : 0);

        // FAILED ⇔ nenhuma das fontes consultadas teve sucesso.
        const anyOk = googleOk || (osmExpected && osmOk);
        expect(step).toBe(anyOk ? 'DONE' : 'FAILED');
      }),
      { numRuns: 300 },
    );
  });
});
