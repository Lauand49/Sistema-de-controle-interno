/**
 * Cliente Gemini falso por roteiro (Analisador_IA e Gerador_Abordagem). Cada chamada a
 * `generate` consome o próximo passo:
 * - `{ text, delayMs? }` → resolve o texto (após o atraso, se o sinal não abortar antes);
 * - `{ error }`          → rejeita;
 * - `{ hang: true }`     → só termina quando o sinal é abortado (timeout do chamador);
 * - `{ throw: true }`    → lança de forma síncrona.
 * Roteiro esgotado → rejeita com erro explícito.
 */
import type { GeminiClient } from '@/lib/leads/ai';
import { noSleep, type Sleep } from './scripted';

export type GeminiStep =
  | { text: string; delayMs?: number }
  | { error: Error | string; delayMs?: number }
  | { hang: true }
  | { throw: true };

export interface FakeGemini extends GeminiClient {
  prompts: string[];
  signals: AbortSignal[];
  remaining(): number;
}

function abortError(): Error {
  return Object.assign(new Error('abortado'), { name: 'AbortError' });
}

/** @param log recebe `generate` a cada chamada (ordem reserva → chamada). */
export function fakeGemini(
  script: ReadonlyArray<GeminiStep>,
  opts: { sleep?: Sleep; log?: string[] } = {},
): FakeGemini {
  const steps = [...script];
  const sleep = opts.sleep ?? noSleep;
  const client: FakeGemini = {
    prompts: [],
    signals: [],
    remaining: () => steps.length,
    generate(prompt, { signal }) {
      client.prompts.push(prompt);
      client.signals.push(signal);
      opts.log?.push('generate');
      const step = steps.shift();
      if (step === undefined) return Promise.reject(new Error('fakeGemini: roteiro esgotado'));
      if ('throw' in step) throw new Error('falha síncrona');
      if ('hang' in step) {
        return new Promise<string>((_, reject) => {
          if (signal.aborted) return reject(abortError());
          signal.addEventListener('abort', () => reject(abortError()), { once: true });
        });
      }
      return (async () => {
        if (step.delayMs) {
          await Promise.race([
            sleep(step.delayMs),
            new Promise<never>((_, reject) => {
              if (signal.aborted) reject(abortError());
              signal.addEventListener('abort', () => reject(abortError()), { once: true });
            }),
          ]);
        }
        if (signal.aborted) throw abortError();
        if ('error' in step) throw typeof step.error === 'string' ? new Error(step.error) : step.error;
        return step.text;
      })();
    },
  };
  return client;
}

/** Atalho: resposta JSON serializada. */
export const geminiJson = (value: unknown): GeminiStep => ({ text: JSON.stringify(value) });
