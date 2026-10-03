/**
 * Temporizador falso para o Analisador_de_Site: nada dispara sozinho; o teste
 * decide quando cada limite (6 s, 10 s) expira com `fire(ms)`.
 */
import type { SetTimer } from '@/lib/leads/site-analyzer';
import type { TransportRequest, TransportResponse } from '@/lib/leads/net/http-transport';

export interface FakeTimers {
  setTimer: SetTimer;
  /** Durações dos temporizadores ainda ativos. */
  active: () => number[];
  /** Dispara todos os temporizadores ativos com a duração `ms`; devolve quantos disparou. */
  fire: (ms: number) => number;
}

export function fakeTimers(): FakeTimers {
  const timers: { ms: number; cb: () => void; active: boolean }[] = [];
  return {
    setTimer(cb, ms) {
      const t = { ms, cb, active: true };
      timers.push(t);
      return () => {
        t.active = false;
      };
    },
    active: () => timers.filter((t) => t.active).map((t) => t.ms),
    fire(ms) {
      const due = timers.filter((t) => t.active && t.ms === ms);
      for (const t of due) {
        t.active = false;
        t.cb();
      }
      return due.length;
    },
  };
}

/** Resposta que só termina quando o sinal da requisição aborta (como o transporte real). */
export function hangUntilAbort(r: TransportRequest): Promise<TransportResponse> {
  return new Promise((_resolve, reject) => {
    const abortErr = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (r.signal.aborted) {
      reject(abortErr());
      return;
    }
    r.signal.addEventListener('abort', () => reject(abortErr()), { once: true });
  });
}
