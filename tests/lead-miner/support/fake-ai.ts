/**
 * Dependências falsas do Analisador_IA: gate de cota em memória e cliente Gemini roteirizado.
 * `log` compartilhado permite verificar a ordem reserva → chamada.
 */
import type { GeminiClient, SetTimer } from '@/lib/leads/ai';
import type { UsageGate, UsageProvider } from '@/lib/leads/usage';

export interface MemoryUsageGate extends UsageGate {
  counts: Map<string, number>;
  /** Leitura síncrona para asserções. */
  peek(provider: UsageProvider, month: string): number;
  reserveCalls: number;
}

export function memoryUsageGate(
  initial: Record<string, number> = {},
  log: string[] = [],
): MemoryUsageGate {
  const counts = new Map(Object.entries(initial));
  const gate: MemoryUsageGate = {
    counts,
    reserveCalls: 0,
    peek: (provider, month) => counts.get(`${provider}:${month}`) ?? 0,
    count: async (provider, month) => counts.get(`${provider}:${month}`) ?? 0,
    async reserve(provider, month, limit) {
      gate.reserveCalls += 1;
      const key = `${provider}:${month}`;
      const current = counts.get(key) ?? 0;
      if (current >= limit) {
        log.push('reserve:negada');
        return false;
      }
      counts.set(key, current + 1);
      log.push('reserve:ok');
      return true;
    },
  };
  return gate;
}

/** ok: devolve `text`; error: rejeita; hang: só termina quando abortado; throw: lança síncrono. */
export type FakeGeminiBehavior =
  | { kind: 'ok'; text: string }
  | { kind: 'error' }
  | { kind: 'hang' }
  | { kind: 'throw' };

export interface FakeGemini extends GeminiClient {
  prompts: string[];
  signals: AbortSignal[];
}

export function fakeGemini(behavior: FakeGeminiBehavior, log: string[] = []): FakeGemini {
  const client: FakeGemini = {
    prompts: [],
    signals: [],
    generate(prompt, { signal }) {
      client.prompts.push(prompt);
      client.signals.push(signal);
      log.push('generate');
      switch (behavior.kind) {
        case 'ok':
          return Promise.resolve(behavior.text);
        case 'error':
          return Promise.reject(new Error('Gemini indisponível'));
        case 'throw':
          throw new Error('falha síncrona');
        case 'hang':
          return new Promise<string>((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('abortado')));
          });
      }
    },
  };
  return client;
}

/** Timer que dispara no próximo microtask (timeout sem espera real). */
export const immediateTimer: SetTimer = (cb) => {
  let alive = true;
  queueMicrotask(() => {
    if (alive) cb();
  });
  return () => {
    alive = false;
  };
};
