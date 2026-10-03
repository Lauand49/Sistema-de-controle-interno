/**
 * Transporte HTTP do Analisador_de_Site (Req. 3.3, 3.4, 4.4, 4.6, 4.9).
 *
 * - Conecta somente no IP já validado pela Guarda_SSRF (`lookup` fixado, sem nova resolução DNS).
 * - Mantém o hostname original no cabeçalho `Host` e no SNI/verificação do certificado.
 * - Envia apenas `Host`, `User-Agent` e `Accept`; sem corpo, cookies ou autenticação.
 * - Lê no máximo `maxBodyBytes` do corpo e encerra a conexão ao atingir o limite, sem falha.
 * - Com `captureBody`, devolve os bytes lidos da resposta final (não redirecionamento) e o
 *   `Content-Type` bruto (Req. 7.1, 7.2); a leitura e o limite são os mesmos.
 *
 * Sem `server-only`: o módulo é importado em testes (apenas `mapNodeError` é exercitado lá).
 * Usa só `node:http`, `node:https` e `node:net`.
 */
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { OSM_USER_AGENT } from '../config';
import type { SslProblem } from '../types';

export interface TransportRequest {
  url: URL;
  /** Endereço IP validado pela Guarda_SSRF. */
  address: string;
  family: 4 | 6;
  method: 'GET' | 'HEAD';
  signal: AbortSignal;
  maxBodyBytes: number;
  /** Guarda os bytes do corpo (≤ `maxBodyBytes`) quando a resposta não é redirecionamento (Req. 7.1). */
  captureBody?: boolean;
}

export interface TransportResponse {
  status: number;
  location: string | null;
  /** Instante (no relógio `now` do transporte) em que os cabeçalhos chegaram. */
  headersAt: number;
  /** Bytes do corpo lidos (nunca maior que `maxBodyBytes`). */
  bodyBytes: number;
  /** Valor bruto do cabeçalho `Content-Type` (ou null). */
  contentType: string | null;
  /** Corpo lido (≤ `maxBodyBytes`) quando `captureBody` e a resposta não é redirecionamento; senão null. */
  body: Uint8Array | null;
}

/** Status tratados como redirecionamento quando acompanhados de `Location` (iguais aos do Analisador_de_Site). */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface BodyCollector {
  /** Acrescenta um chunk; o último é cortado no limite. `'FULL'` quando o limite foi atingido. */
  push(chunk: Uint8Array): 'MORE' | 'FULL';
  /** Bytes acumulados até agora (cópia contígua, ≤ `maxBytes`). */
  bytes(): Uint8Array;
}

/** Acumulador puro de chunks do corpo até `maxBytes` (Req. 7.2). */
export function collectBody(maxBytes: number): BodyCollector {
  const limit = Math.max(0, Math.floor(maxBytes));
  const chunks: Uint8Array[] = [];
  let total = 0;
  return {
    push(chunk) {
      if (total >= limit) return 'FULL';
      const room = limit - total;
      const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
      if (part.length > 0) {
        // Copia: o Node pode reutilizar o buffer do chunk.
        chunks.push(new Uint8Array(part));
        total += part.length;
      }
      return total >= limit ? 'FULL' : 'MORE';
    },
    bytes() {
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out;
    },
  };
}

export type TransportErrorKind =
  | 'TIMEOUT'
  | 'DNS'
  | 'CONEXAO_RECUSADA'
  | 'CONEXAO_ENCERRADA'
  | 'SSL';

export class TransportError extends Error {
  constructor(
    public readonly kind: TransportErrorKind,
    public readonly ssl?: SslProblem,
  ) {
    super(ssl ? `${kind}:${ssl}` : kind);
    this.name = 'TransportError';
  }
}

export interface Transport {
  request(r: TransportRequest): Promise<TransportResponse>;
}

const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const EXPIRED_CODES = new Set(['CERT_HAS_EXPIRED']);
const ALTNAME_CODES = new Set(['ERR_TLS_CERT_ALTNAME_INVALID']);
const UNTRUSTED_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function field(err: unknown, key: 'code' | 'name' | 'message'): string {
  if (err && typeof err === 'object' && key in err) {
    const v = (err as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : '';
  }
  return '';
}

/**
 * Converte um erro do Node (`http`/`https`/`tls`/`dns`) em `TransportError`. Função pura.
 * Erros desconhecidos viram `CONEXAO_ENCERRADA` (falha de conexão antes da resposta).
 */
export function mapNodeError(err: unknown): TransportError {
  if (err instanceof TransportError) return err;
  const code = field(err, 'code');
  const name = field(err, 'name');
  const message = field(err, 'message');

  if (name === 'AbortError' || name === 'TimeoutError' || code === 'ABORT_ERR') {
    return new TransportError('TIMEOUT');
  }
  if (EXPIRED_CODES.has(code)) return new TransportError('SSL', 'EXPIRADO');
  if (ALTNAME_CODES.has(code)) return new TransportError('SSL', 'DOMINIO_DIVERGENTE');
  if (UNTRUSTED_CODES.has(code) || code.startsWith('UNABLE_TO_GET_ISSUER_CERT')) {
    return new TransportError('SSL', 'NAO_CONFIAVEL');
  }
  // Demais problemas de certificado/handshake TLS: cadeia não confiável.
  if (code.startsWith('CERT_') || code.startsWith('ERR_SSL_') || code.startsWith('UNABLE_TO_')) {
    return new TransportError('SSL', 'NAO_CONFIAVEL');
  }
  if (code === 'ECONNREFUSED') return new TransportError('CONEXAO_RECUSADA');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new TransportError('DNS');
  if (code === 'ETIMEDOUT') return new TransportError('TIMEOUT');
  if (code === 'ECONNRESET' || /socket hang up/i.test(message)) {
    return new TransportError('CONEXAO_ENCERRADA');
  }
  return new TransportError('CONEXAO_ENCERRADA');
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function doRequest(r: TransportRequest, now: () => number): Promise<TransportResponse> {
  return new Promise<TransportResponse>((resolve, reject) => {
    if (r.signal.aborted) {
      reject(new TransportError('TIMEOUT'));
      return;
    }

    const isHttps = r.url.protocol === 'https:';
    const hostname = stripBrackets(r.url.hostname);
    const isIpLiteral = isIP(hostname) !== 0;
    const { address, family } = r;

    // Conexão apenas no IP validado; nunca resolve o nome de novo (Req. 4.4).
    const lookup: LookupFunction = (_host, opts, cb) => {
      if (opts && opts.all) {
        (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
          { address, family },
        ]);
      } else {
        cb(null, address, family);
      }
    };

    const options: https.RequestOptions = {
      protocol: r.url.protocol,
      hostname,
      port: r.url.port || (isHttps ? 443 : 80),
      path: `${r.url.pathname}${r.url.search}`,
      method: r.method,
      family,
      lookup,
      agent: false,
      headers: {
        Host: r.url.host,
        'User-Agent': OSM_USER_AGENT,
        Accept: ACCEPT,
      },
    };
    if (isHttps) {
      options.rejectUnauthorized = true;
      // SNI não aceita IP literal; nesse caso o Node verifica o IP contra o certificado.
      if (!isIpLiteral) options.servername = hostname;
    }

    let settled = false;
    let status = 0;
    let location: string | null = null;
    let headersAt = 0;
    let bodyBytes = 0;
    let contentType: string | null = null;
    let collector: BodyCollector | null = null;
    let gotResponse = false;

    const cleanup = () => r.signal.removeEventListener('abort', onAbort);
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status, location, headersAt, bodyBytes, contentType, body: collector ? collector.bytes() : null });
    };
    const fail = (e: TransportError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e);
    };

    const req = (isHttps ? https : http).request(options);

    function onAbort() {
      fail(new TransportError('TIMEOUT'));
      req.destroy();
    }
    r.signal.addEventListener('abort', onAbort, { once: true });

    req.on('response', (res) => {
      gotResponse = true;
      headersAt = now();
      status = res.statusCode ?? 0;
      const loc = res.headers.location;
      location = typeof loc === 'string' ? loc : null;
      const ct = res.headers['content-type'];
      contentType = typeof ct === 'string' ? ct : null;
      // Corpo só da resposta final (não redirecionamento) e só quando pedido (Req. 7.1).
      const isRedirect = REDIRECT_STATUSES.has(status) && location !== null;
      if (r.captureBody === true && !isRedirect) collector = collectBody(r.maxBodyBytes);

      res.on('data', (chunk: Buffer) => {
        if (settled) return;
        if (collector) collector.push(chunk);
        bodyBytes += chunk.length;
        if (bodyBytes >= r.maxBodyBytes) {
          // Limite atingido: encerra a conexão e registra os dados obtidos (Req. 4.6).
          bodyBytes = r.maxBodyBytes;
          succeed();
          req.destroy();
        }
      });
      res.on('end', succeed);
      // Falha no meio do corpo, com cabeçalhos já recebidos: mantém os dados obtidos.
      res.on('error', succeed);
      res.on('aborted', succeed);
      res.on('close', succeed);
    });

    req.on('error', (err) => {
      if (gotResponse) succeed();
      else fail(mapNodeError(err));
    });

    req.end();
  });
}

export function createNodeTransport(options: { now?: () => number } = {}): Transport {
  const now = options.now ?? Date.now;
  return { request: (r) => doRequest(r, now) };
}

export const nodeTransport: Transport = createNodeTransport();
