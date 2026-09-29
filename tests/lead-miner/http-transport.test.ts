/**
 * Testes unitários de `mapNodeError` (Req. 3.3, 3.4). Sem rede.
 */
import { describe, expect, it } from 'vitest';
import { mapNodeError, TransportError } from '@/lib/leads/net/http-transport';

function nodeErr(code: string, message = code): NodeJS.ErrnoException {
  const e = new Error(message) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

function expectKind(err: unknown, kind: TransportError['kind'], ssl?: TransportError['ssl']) {
  const mapped = mapNodeError(err);
  expect(mapped).toBeInstanceOf(TransportError);
  expect(mapped.kind).toBe(kind);
  expect(mapped.ssl).toBe(ssl);
}

describe('mapNodeError', () => {
  it('certificado expirado → SSL/EXPIRADO', () => {
    expectKind(nodeErr('CERT_HAS_EXPIRED'), 'SSL', 'EXPIRADO');
  });

  it('nome do certificado divergente → SSL/DOMINIO_DIVERGENTE', () => {
    expectKind(nodeErr('ERR_TLS_CERT_ALTNAME_INVALID'), 'SSL', 'DOMINIO_DIVERGENTE');
  });

  it.each([
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  ])('%s → SSL/NAO_CONFIAVEL', (code) => {
    expectKind(nodeErr(code), 'SSL', 'NAO_CONFIAVEL');
  });

  it('conexão recusada → CONEXAO_RECUSADA', () => {
    expectKind(nodeErr('ECONNREFUSED'), 'CONEXAO_RECUSADA');
  });

  it('reset e socket hang up → CONEXAO_ENCERRADA', () => {
    expectKind(nodeErr('ECONNRESET'), 'CONEXAO_ENCERRADA');
    expectKind(new Error('socket hang up'), 'CONEXAO_ENCERRADA');
  });

  it('abort → TIMEOUT', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expectKind(abort, 'TIMEOUT');
    expectKind(nodeErr('ABORT_ERR'), 'TIMEOUT');
  });

  it('falha de DNS → DNS', () => {
    expectKind(nodeErr('ENOTFOUND'), 'DNS');
    expectKind(nodeErr('EAI_AGAIN'), 'DNS');
  });

  it('TransportError é devolvido sem alteração', () => {
    const original = new TransportError('SSL', 'EXPIRADO');
    expect(mapNodeError(original)).toBe(original);
  });
});
