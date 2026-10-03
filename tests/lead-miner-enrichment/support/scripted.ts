/**
 * Roteiro compartilhado pelos clientes falsos (Places, PageSpeed, BrasilAPI).
 *
 * Cada chamada consome o próximo passo do roteiro, na ordem. Um passo pode:
 * - responder `{ status, json }` (opcionalmente após `delayMs`);
 * - rejeitar com `error` ('timeout', 'network' ou um Error próprio);
 * - ser uma função da requisição, para respostas dinâmicas.
 *
 * Se `delayMs` passar do `timeoutMs` da chamada, a chamada rejeita com "timeout"
 * após `timeoutMs` — como os clientes reais, que abortam no próprio timeout.
 * Roteiro esgotado → erro explícito (o teste chamou mais vezes do que previu).
 */

export type HttpReply = { status: number; json: unknown };

export type ScriptStep<Req> =
  | { status: number; json?: unknown; delayMs?: number }
  | { error: 'timeout' | 'network' | Error; delayMs?: number }
  | ((req: Req) => HttpReply | Promise<HttpReply>);

export type Sleep = (ms: number) => Promise<void>;

/** Espera real (padrão). Testes que não querem esperar injetam `noSleep` ou um relógio falso. */
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Não espera: atrasos só servem para decidir se houve timeout. */
export const noSleep: Sleep = async () => {};

export function timeoutError(): Error {
  return Object.assign(new Error('timeout'), { name: 'TimeoutError' });
}

export function networkError(): Error {
  return Object.assign(new Error('fetch failed'), { name: 'TypeError' });
}

export interface ScriptRunner<Req> {
  /** Requisições recebidas, na ordem. */
  calls: Req[];
  /** Passos ainda não consumidos. */
  remaining(): number;
  run(req: Req, timeoutMs: number): Promise<HttpReply>;
}

export function scriptRunner<Req>(
  label: string,
  script: ReadonlyArray<ScriptStep<Req>>,
  sleep: Sleep = noSleep,
): ScriptRunner<Req> {
  const steps = [...script];
  const calls: Req[] = [];
  return {
    calls,
    remaining: () => steps.length,
    async run(req, timeoutMs) {
      calls.push(req);
      const step = steps.shift();
      if (step === undefined) throw new Error(`${label}: roteiro esgotado (chamada ${calls.length})`);
      if (typeof step === 'function') return step(req);
      const delay = step.delayMs ?? 0;
      if (delay > timeoutMs) {
        await sleep(timeoutMs);
        throw timeoutError();
      }
      if (delay > 0) await sleep(delay);
      if ('error' in step) {
        if (step.error === 'timeout') throw timeoutError();
        if (step.error === 'network') throw networkError();
        throw step.error;
      }
      return { status: step.status, json: step.json ?? null };
    },
  };
}
