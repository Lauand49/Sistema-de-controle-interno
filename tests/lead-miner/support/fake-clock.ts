/**
 * Relógio falso para testes: `sleep` não espera de verdade, apenas avança o tempo.
 */
export interface FakeClock {
  /** Instante atual em milissegundos. */
  now: () => number;
  /** Avança o relógio em `ms` e resolve imediatamente. */
  sleep: (ms: number) => Promise<void>;
  /** Total de chamadas a `sleep`, com as durações pedidas. */
  sleeps: number[];
}

export function fakeClock(start = 0): FakeClock {
  let current = start;
  const sleeps: number[] = [];
  return {
    now: () => current,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      current += Math.max(0, ms);
    },
    sleeps,
  };
}
