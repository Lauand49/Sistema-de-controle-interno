// Feature: lead-miner-enrichment, Property 3: For any limite L por provedor e qualquer sequência intercalada de chamadas da Fonte_Google (páginas, retentativas, Place Details), do Analisador_PageSpeed e do Gerador_Abordagem contra clientes falsos que respondem com sucesso, 429, 5xx ou timeout, o número de requisições efetivamente enviadas a cada provedor é igual ao número de reservas aceitas desse provedor e nunca maior que L; toda chamada cuja reserva foi recusada termina com motivo COTA_ESGOTADA sem tocar o cliente; e os contadores de provedores diferentes são independentes.
/**
 * **Validates: Requirements 2.4, 2.5, 3.3, 3.7, 15.2, 19.3**
 *
 * Os consumidores reais (`searchGooglePage`, `fetchPlaceDetails`, `runPageSpeed`,
 * `generateApproach`) rodam concorrentemente sobre um único `memoryUsageGate`. Cada chamada
 * recebe um invólucro do portão (com pausas aleatórias para intercalar) e o próprio cliente
 * falso, de modo que a ordem reserva → envio é conferida por chamada e globalmente.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateApproach, type ApproachInput } from '@/lib/leads/approach';
import { NICHES } from '@/lib/leads/config';
import { runPageSpeed } from '@/lib/leads/pagespeed';
import { fetchPlaceDetails, searchGooglePage, type Rect, type RunPlace } from '@/lib/leads/sources/google-places';
import { monthKey, type UsageGate, type UsageProvider } from '@/lib/leads/usage';
import { immediateTimer } from '../lead-miner/support/fake-ai';
import { fakeGemini, type GeminiStep } from './support/fake-gemini';
import { fakePageSpeed, lighthouseJson } from './support/fake-pagespeed';
import { fakePlaces, rawPlace, searchPage } from './support/fake-places';
import { memoryUsageGate } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';

const NOW = new Date('2026-05-15T12:00:00.000Z');
const MONTH = monthKey(NOW);
const PROVIDERS: readonly UsageProvider[] = ['places', 'pagespeed', 'gemini'];

const niche = NICHES[0];
const run: RunPlace = { bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP' };
const rect: Rect = { low: { latitude: -23.6, longitude: -46.7 }, high: { latitude: -23.5, longitude: -46.6 } };
const approachInput: ApproachInput = {
  nomeExibicao: 'Clínica Sorriso',
  nicho: 'clinica',
  bairro: 'Vila Mariana',
  cidade: 'São Paulo',
  categoria: 'CRIAR_SITE',
  motivos: ['Sem site'],
  pagespeed: null,
  sinais: null,
  cnpj: null,
  oportunidadeIa: null,
  canal: 'WHATSAPP',
  remetente: 'João',
};

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

type HttpOutcome = 'ok' | '429' | '500' | '503' | '400' | 'timeout' | 'network';
type AiOutcome = 'ok' | 'invalid' | 'error' | 'hang';
const httpOutcome = fc.constantFrom<HttpOutcome>('ok', '429', '500', '503', '400', 'timeout', 'network');
const aiOutcome = fc.constantFrom<AiOutcome>('ok', 'invalid', 'error', 'hang');

type Op =
  | { kind: 'page'; outcomes: HttpOutcome[]; yields: number }
  | { kind: 'details'; outcome: HttpOutcome; yields: number }
  | { kind: 'pagespeed'; outcome: HttpOutcome; yields: number }
  | { kind: 'approach'; outcome: AiOutcome; yields: number };

const yields = fc.integer({ min: 0, max: 4 });
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant('page' as const), outcomes: fc.array(httpOutcome, { minLength: 3, maxLength: 3 }), yields }),
  fc.record({ kind: fc.constant('details' as const), outcome: httpOutcome, yields }),
  fc.record({ kind: fc.constant('pagespeed' as const), outcome: httpOutcome, yields }),
  fc.record({ kind: fc.constant('approach' as const), outcome: aiOutcome, yields }),
);

const perProvider = (arb: fc.Arbitrary<number>) =>
  fc.record({ places: arb, pagespeed: arb, gemini: arb }) as fc.Arbitrary<Record<UsageProvider, number>>;

const arbScenario = fc.record({
  limits: perProvider(fc.integer({ min: 0, max: 8 })),
  initial: perProvider(fc.integer({ min: 0, max: 10 })),
  ops: fc.array(arbOp, { minLength: 1, maxLength: 16 }),
});

// ---------------------------------------------------------------------------
// Roteiros dos clientes falsos
// ---------------------------------------------------------------------------

function httpStep<Req>(o: HttpOutcome, okJson: unknown): ScriptStep<Req> {
  switch (o) {
    case 'ok':
      return { status: 200, json: okJson };
    case 'timeout':
    case 'network':
      return { error: o };
    default:
      return { status: Number(o), json: {} };
  }
}

function aiStep(o: AiOutcome): GeminiStep {
  switch (o) {
    case 'ok':
      return { text: JSON.stringify({ texto: 'Olá! Somos da SciTec jr. Podemos conversar?', assunto: null }) };
    case 'invalid':
      return { text: 'não é JSON' };
    case 'error':
      return { error: 'falha 500' };
    case 'hang':
      return { hang: true };
  }
}

const providerOf = (op: Op): UsageProvider =>
  op.kind === 'page' || op.kind === 'details' ? 'places' : op.kind === 'pagespeed' ? 'pagespeed' : 'gemini';

async function pause(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

/** Invólucro do portão compartilhado: registra reservas da chamada e intercala com pausas. */
function callGate(shared: UsageGate, events: string[], n: number): UsageGate {
  return {
    count: (p, m) => shared.count(p, m),
    async reserve(p, m, l) {
      await pause(n);
      const ok = await shared.reserve(p, m, l);
      events.push(ok ? `reserve:${p}:ok` : `reserve:${p}:negada`);
      return ok;
    },
  };
}

interface CallResult {
  provider: UsageProvider;
  events: string[];
  quota: boolean;
}

async function execute(op: Op, shared: UsageGate, limits: Record<UsageProvider, number>, globalLog: string[]) {
  const events: string[] = [];
  const usage = callGate(shared, events, op.yields);
  const provider = providerOf(op);
  // O cliente falso registra o envio na chamada e no log global.
  const sendLog = { push: (s: string) => (events.push(`send:${provider}`), globalLog.push(`send:${provider}:${s}`)) } as unknown as string[];
  const sleep = (ms: number) => pause(ms % 3);

  switch (op.kind) {
    case 'page': {
      const http = fakePlaces(op.outcomes.map((o) => httpStep(o, searchPage([rawPlace()]).json)), { log: sendLog });
      const out = await searchGooglePage(niche, run, rect, null, { http, usage, limit: limits.places, now: () => NOW, sleep });
      return { provider, events, quota: !out.ok && out.kind === 'QUOTA' } satisfies CallResult;
    }
    case 'details': {
      const http = fakePlaces([httpStep(op.outcome, rawPlace())], { log: sendLog });
      const out = await fetchPlaceDetails('ChIJ-teste-1', { http, usage, limit: limits.places, now: () => NOW, sleep });
      return { provider, events, quota: !out.ok && out.kind === 'QUOTA' } satisfies CallResult;
    }
    case 'pagespeed': {
      const http = fakePageSpeed([httpStep(op.outcome, lighthouseJson())], { log: sendLog });
      const out = await runPageSpeed('https://exemplo.com.br/', { http, usage, limit: limits.pagespeed, now: () => NOW, hasKey: true });
      return { provider, events, quota: !out.ok && out.reason === 'COTA_ESGOTADA' } satisfies CallResult;
    }
    case 'approach': {
      const client = fakeGemini([aiStep(op.outcome)], { log: sendLog });
      const out = await generateApproach(approachInput, {
        client, usage, limit: limits.gemini, now: () => NOW, setTimer: immediateTimer,
      });
      return { provider, events, quota: out.fallback === 'IA_COTA_ESGOTADA' } satisfies CallResult;
    }
  }
}

// ---------------------------------------------------------------------------
// Propriedade
// ---------------------------------------------------------------------------

describe('Property 3: O Portão_Uso nunca excede o limite', () => {
  it('envios = reservas aceitas ≤ limite, por provedor; recusa → COTA_ESGOTADA sem tocar o cliente', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async ({ limits, initial, ops }) => {
        const globalLog: string[] = [];
        const gate = memoryUsageGate({
          [`places:${MONTH}`]: initial.places,
          [`pagespeed:${MONTH}`]: initial.pagespeed,
          [`gemini:${MONTH}`]: initial.gemini,
        }, globalLog);

        const results = await Promise.all(ops.map((op) => execute(op, gate, limits, globalLog)));

        // Por chamada: todo envio vem logo após uma reserva aceita; recusa encerra sem envio.
        for (const r of results) {
          let pending = 0;
          let refused = false;
          for (const e of r.events) {
            expect(refused).toBe(false); // nada depois de uma recusa
            if (e === `reserve:${r.provider}:ok`) pending++;
            else if (e === `reserve:${r.provider}:negada`) refused = true;
            else if (e === `send:${r.provider}`) {
              expect(pending).toBe(1);
              pending--;
            } else throw new Error(`evento inesperado: ${e}`);
          }
          expect(pending).toBe(0); // reserva aceita sempre seguida do envio
          if (refused) expect(r.quota).toBe(true);
          // 429 do PageSpeed também é COTA_ESGOTADA, mas só depois de enviar.
          if (r.quota && !refused) expect(r.provider).toBe('pagespeed');
        }

        for (const p of PROVIDERS) {
          // Global: em todo prefixo do log, envios ≤ reservas aceitas do provedor.
          let granted = 0;
          let sent = 0;
          for (const e of globalLog) {
            if (e === `reserve:${p}:ok`) granted++;
            else if (e.startsWith(`send:${p}:`)) {
              sent++;
              expect(sent).toBeLessThanOrEqual(granted);
            }
          }
          expect(sent).toBe(granted);

          // Contador: inicial + aceitas; nunca passa do limite quando começou abaixo dele.
          const max = Math.max(0, limits[p] - initial[p]);
          expect(granted).toBeLessThanOrEqual(max);
          expect(gate.peek(p, MONTH)).toBe(initial[p] + granted);
          if (initial[p] <= limits[p]) expect(gate.peek(p, MONTH)).toBeLessThanOrEqual(limits[p]);

          // Recusas só com o contador do próprio provedor no limite (independência).
          const calls = gate.reserveCalls.filter((c) => c.provider === p);
          const refusedCount = calls.filter((c) => !c.granted).length;
          expect(calls.length - refusedCount).toBe(granted);
          if (refusedCount > 0) expect(gate.peek(p, MONTH)).toBeGreaterThanOrEqual(limits[p]);
          // Com cota sobrando, nenhuma recusa: aceitas = min(tentativas, folga).
          expect(granted).toBe(Math.min(calls.length, max));
        }
      }),
      { numRuns: 200 },
    );
  });
});
