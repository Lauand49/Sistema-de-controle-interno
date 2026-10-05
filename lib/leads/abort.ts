/**
 * Utilitários de cancelamento (P2): a descoberta propaga o `AbortSignal` da mineração até as
 * requisições HTTP de Nominatim, Overpass e Google Places. Tudo aqui remove seus listeners ao
 * terminar, para não acumular `abort` handlers em sinais de longa duração.
 */

/** A mineração foi cancelada enquanto a operação estava em curso. */
export class RunAbortedError extends Error {
  constructor() {
    super('Operação interrompida: mineração cancelada.');
    this.name = 'AbortError';
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RunAbortedError();
}

/**
 * `sleep(ms)` que é interrompido pelo `signal` (rejeita com `RunAbortedError`). O listener é
 * removido no fim, com ou sem abort.
 */
export function sleepOrAbort(sleep: (ms: number) => Promise<void>, ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.reject(new RunAbortedError());
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(new RunAbortedError());
    signal.addEventListener('abort', onAbort, { once: true });
    sleep(ms).then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** Sinal que dispara no timeout OU no abort externo (o que vier primeiro). */
export function timeoutSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external ? AbortSignal.any([timeout, external]) : timeout;
}
