/**
 * `fetch` programável por roteiro, para testar os clientes reais de `deps.ts`
 * (chave só no cabeçalho, nunca na URL — Req. 2.2, 20.4) sem rede.
 *
 * Registra URL, método, cabeçalhos (nomes em minúsculas) e corpo de cada chamada.
 * Cada chamada consome o próximo passo; roteiro esgotado → erro explícito.
 * Respeita `init.signal`: sinal já abortado, ou abortado durante o atraso, rejeita com AbortError.
 */
import { noSleep, type Sleep } from './scripted';

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export type FetchStep =
  | { status: number; json?: unknown; text?: string; headers?: Record<string, string>; delayMs?: number }
  | { error: 'network' | Error; delayMs?: number }
  /** Só termina quando o sinal é abortado (timeout do cliente). */
  | { hang: true }
  | ((call: FetchCall) => Response | Promise<Response>);

export interface FakeFetch {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
  calls: FetchCall[];
  remaining(): number;
}

function abortError(): Error {
  return Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
}

function headersToRecord(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(h).forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

function bodyToString(body: BodyInit | null | undefined): string | null {
  if (body == null) return null;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
  return String(body);
}

function waitOrAbort(ms: number, signal: AbortSignal | null | undefined, sleep: Sleep): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!signal) return sleep(ms);
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    sleep(ms).then(
      () => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) reject(abortError());
        else resolve();
      },
      reject,
    );
  });
}

export function fakeFetch(script: ReadonlyArray<FetchStep>, sleep: Sleep = noSleep): FakeFetch {
  const steps = [...script];
  const calls: FetchCall[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const call: FetchCall = {
      url,
      method: (init.method ?? 'GET').toUpperCase(),
      headers: headersToRecord(init.headers),
      body: bodyToString(init.body),
    };
    calls.push(call);
    const signal = init.signal;
    if (signal?.aborted) throw abortError();
    const step = steps.shift();
    if (step === undefined) throw new Error(`fakeFetch: roteiro esgotado (chamada ${calls.length}: ${url})`);
    if (typeof step === 'function') return step(call);
    if ('hang' in step) {
      return new Promise<Response>((_, reject) => {
        if (!signal) return; // sem sinal: nunca termina, como uma conexão travada
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
      });
    }
    if (step.delayMs) await waitOrAbort(step.delayMs, signal, sleep);
    if ('error' in step) {
      throw step.error === 'network'
        ? Object.assign(new Error('fetch failed'), { name: 'TypeError' })
        : step.error;
    }
    const headers = new Headers(step.headers);
    let body: string | null = null;
    if (step.text !== undefined) body = step.text;
    else if (step.json !== undefined) {
      body = JSON.stringify(step.json);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
    }
    return new Response(body, { status: step.status, headers });
  }) as FakeFetch;
  fn.calls = calls;
  fn.remaining = () => steps.length;
  return fn;
}
