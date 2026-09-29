/**
 * Resolver e transporte falsos para testes sem rede (Guarda_SSRF, Analisador_de_Site).
 * Os tipos de transporte espelham `net/http-transport.ts` do design; são
 * declarados aqui para não depender da ordem de criação dos módulos.
 */
import type { Resolver } from '@/lib/leads/net/ssrf';

export type ResolvedAddress = { address: string; family: 4 | 6 };

export interface FakeResolver extends Resolver {
  /** Hosts consultados, na ordem das chamadas. */
  calls: string[];
}

/** Resposta configurada por host: lista de endereços ou erro (falha de DNS). */
export type ResolverAnswer = ResolvedAddress[] | Error;

/** Infere a família a partir do texto do endereço. */
export function addr(address: string): ResolvedAddress {
  return { address, family: address.includes(':') ? 6 : 4 };
}

/**
 * Resolver falso. Host ausente do mapa → erro de DNS (ENOTFOUND).
 * Aceita também uma função, para respostas dinâmicas.
 */
export function fakeResolver(
  answers: Record<string, ResolverAnswer> | ((host: string) => ResolverAnswer) = {},
): FakeResolver {
  const calls: string[] = [];
  return {
    calls,
    async resolveAll(host: string) {
      calls.push(host);
      const answer =
        typeof answers === 'function'
          ? answers(host)
          : Object.prototype.hasOwnProperty.call(answers, host)
            ? answers[host]
            : Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
      if (answer instanceof Error) throw answer;
      return answer.map((a) => ({ ...a }));
    },
  };
}

// --- Transporte (compatível com net/http-transport.ts do design) ---

export interface TransportRequest {
  url: URL;
  address: string;
  family: 4 | 6;
  method: 'GET' | 'HEAD';
  signal: AbortSignal;
  maxBodyBytes: number;
}

export interface TransportResponse {
  status: number;
  location: string | null;
  headersAt: number;
  bodyBytes: number;
}

export interface Transport {
  request(r: TransportRequest): Promise<TransportResponse>;
}

/** Resposta configurada: objeto, erro lançado ou função da requisição. */
export type TransportAnswer =
  | TransportResponse
  | Error
  | ((r: TransportRequest) => TransportResponse | Promise<TransportResponse>);

export interface FakeTransport extends Transport {
  /** Requisições recebidas, na ordem. */
  requests: TransportRequest[];
}

/**
 * Transporte falso que grava toda requisição. `answers` pode ser:
 * - um mapa `href → resposta` (href ausente → erro "sem resposta configurada");
 * - uma função da requisição.
 */
export function fakeTransport(
  answers: Record<string, TransportAnswer> | ((r: TransportRequest) => TransportResponse | Promise<TransportResponse>) = {},
): FakeTransport {
  const requests: TransportRequest[] = [];
  return {
    requests,
    async request(r: TransportRequest) {
      requests.push(r);
      if (r.signal.aborted) {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
      let answer: TransportAnswer | undefined;
      if (typeof answers === 'function') answer = answers;
      else answer = answers[r.url.href];
      if (answer === undefined) throw new Error(`fakeTransport: sem resposta para ${r.url.href}`);
      if (answer instanceof Error) throw answer;
      if (typeof answer === 'function') return answer(r);
      return { ...answer };
    },
  };
}
