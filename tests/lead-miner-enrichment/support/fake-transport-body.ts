/**
 * Transporte falso com `contentType`/`body` — contrato estendido de `net/http-transport.ts`
 * do design (Req. 7.1–7.3): o corpo só é devolvido quando `captureBody` é verdadeiro e a
 * resposta não é redirecionamento, cortado em `maxBodyBytes`; `bodyBytes` nunca passa do limite.
 * Tipos locais até o módulo de produção ganhar os campos novos.
 */

export interface BodyTransportRequest {
  url: URL;
  address: string;
  family: 4 | 6;
  method: 'GET' | 'HEAD';
  signal: AbortSignal;
  maxBodyBytes: number;
  captureBody?: boolean;
}

export interface BodyTransportResponse {
  status: number;
  location: string | null;
  headersAt: number;
  bodyBytes: number;
  contentType: string | null;
  body: Uint8Array | null;
}

/** Resposta configurada; `body` como texto (UTF-8) ou bytes crus (para testar charset). */
export interface BodyAnswer {
  status: number;
  location?: string | null;
  headersAt?: number;
  contentType?: string | null;
  body?: string | Uint8Array | null;
}

export type BodyTransportAnswer =
  | BodyAnswer
  | Error
  | ((r: BodyTransportRequest) => BodyAnswer | Promise<BodyAnswer>);

export interface FakeBodyTransport {
  requests: BodyTransportRequest[];
  request(r: BodyTransportRequest): Promise<BodyTransportResponse>;
}

const isRedirect = (status: number) => status >= 300 && status < 400;

function toResponse(a: BodyAnswer, r: BodyTransportRequest): BodyTransportResponse {
  const raw = a.body == null ? new Uint8Array(0) : typeof a.body === 'string' ? new TextEncoder().encode(a.body) : a.body;
  const max = Math.max(0, r.maxBodyBytes);
  const read = r.method === 'HEAD' ? new Uint8Array(0) : raw.subarray(0, Math.min(raw.length, max));
  const capture = r.captureBody === true && r.method !== 'HEAD' && !isRedirect(a.status) && a.body != null;
  return {
    status: a.status,
    location: a.location ?? null,
    headersAt: a.headersAt ?? 0,
    bodyBytes: read.length,
    contentType: a.contentType ?? null,
    body: capture ? read.slice() : null,
  };
}

/**
 * @param answers mapa `href → resposta` (href ausente → erro "sem resposta configurada")
 *                ou função da requisição.
 */
export function fakeBodyTransport(
  answers: Record<string, BodyTransportAnswer> | ((r: BodyTransportRequest) => BodyAnswer | Promise<BodyAnswer>) = {},
): FakeBodyTransport {
  const requests: BodyTransportRequest[] = [];
  return {
    requests,
    async request(r) {
      requests.push(r);
      if (r.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const answer = typeof answers === 'function' ? answers : answers[r.url.href];
      if (answer === undefined) throw new Error(`fakeBodyTransport: sem resposta para ${r.url.href}`);
      if (answer instanceof Error) throw answer;
      const resolved = typeof answer === 'function' ? await answer(r) : answer;
      return toResponse(resolved, r);
    },
  };
}

/** Atalho: 200 com HTML. */
export function htmlAnswer(html: string | Uint8Array, contentType = 'text/html; charset=utf-8'): BodyAnswer {
  return { status: 200, contentType, body: html };
}
