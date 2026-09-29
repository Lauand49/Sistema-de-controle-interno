/**
 * Limitador de taxa por intervalo mínimo entre inícios de execução (Req. 2.2).
 *
 * As chamadas agendadas são executadas em série, na ordem de agendamento. Entre
 * o início de duas execuções consecutivas há pelo menos `minIntervalMs`, inclusive
 * quando a execução anterior falhou.
 */

export interface Clock {
  /** Instante atual em milissegundos. */
  now: () => number;
  /** Aguarda `ms` milissegundos. */
  sleep: (ms: number) => Promise<void>;
}

export interface RateLimiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function intervalLimiter(minIntervalMs: number, clock: Clock = realClock): RateLimiter {
  // Cauda da fila: nunca rejeita, para que uma falha não interrompa as próximas execuções.
  let tail: Promise<void> = Promise.resolve();
  let lastStart: number | null = null;

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      const run = tail.then(async () => {
        if (lastStart !== null) {
          const wait = lastStart + minIntervalMs - clock.now();
          if (wait > 0) await clock.sleep(wait);
        }
        lastStart = clock.now();
        return fn();
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

/** Intervalo mínimo entre requisições ao Nominatim (política de uso: 1 req/s). */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

const globalForLimiter = globalThis as unknown as { __nominatimLimiter?: RateLimiter };

/** Limitador global do processo para o Nominatim (sobrevive ao hot reload). */
export const nominatimLimiter: RateLimiter =
  globalForLimiter.__nominatimLimiter ?? intervalLimiter(NOMINATIM_MIN_INTERVAL_MS);

globalForLimiter.__nominatimLimiter = nominatimLimiter;
