import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeSite } from '@/lib/leads/site-analyzer';
import { TransportError } from '@/lib/leads/net/http-transport';
import type { TransportRequest, TransportResponse } from '@/lib/leads/net/http-transport';
import { addr, fakeResolver, fakeTransport } from './support/fake-net';
import { fakeClock } from './support/fake-clock';
import { fakeTimers, hangUntilAbort } from './support/fake-timers';

const PUBLIC = '93.184.216.34';

function ok(status: number, headersAt: number, location: string | null = null): TransportResponse {
  return { status, location, headersAt, bodyBytes: 0 };
}

function setup(
  answers: Record<string, ReturnType<typeof addr>[] | Error>,
  handler: (r: TransportRequest, n: number) => TransportResponse | Promise<TransportResponse>,
) {
  const clock = fakeClock(1_000);
  const timers = fakeTimers();
  const resolver = fakeResolver(answers);
  let n = 0;
  const transport = fakeTransport((r) => handler(r, n++));
  return { clock, timers, resolver, transport, deps: { resolver, transport, now: clock.now, setTimer: timers.setTimer } };
}

describe('analyzeSite — entradas sem tráfego', () => {
  it.each([null, '', '   ', '\t\n'])('sem site (%j) → hasSite=false, sem rede', async (w) => {
    const s = setup({}, () => ok(200, 0));
    const r = await analyzeSite(w, s.deps);
    expect(r).toMatchObject({ hasSite: false, isHttps: false, sslValid: false, online: false });
    expect(s.resolver.calls).toHaveLength(0);
    expect(s.transport.requests).toHaveLength(0);
  });

  it.each(['http://', 'exa mple.com.br', 'https://abc<>.com', 'loja.com.br:porta'])(
    'URL inválida (%j) → offline "URL inválida", sem rede',
    async (w) => {
      const s = setup({}, () => ok(200, 0));
      const r = await analyzeSite(w, s.deps);
      expect(r).toMatchObject({ hasSite: true, online: false, failure: 'URL_INVALIDA', failureDetail: 'URL inválida' });
      expect(s.resolver.calls).toHaveLength(0);
      expect(s.transport.requests).toHaveLength(0);
    },
  );
});

describe('analyzeSite — redirecionamentos e SSRF', () => {
  it('redirecionamento para http://10.0.0.1/ → "destino bloqueado" sem requisição ao destino', async () => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, (_r, n) =>
      n === 0 ? ok(302, 1_100, 'http://10.0.0.1/') : ok(200, 1_200),
    );
    const r = await analyzeSite('https://loja.com.br/', s.deps);
    expect(r).toMatchObject({ online: false, failure: 'DESTINO_BLOQUEADO', failureDetail: 'destino bloqueado', statusCode: null });
    expect(s.transport.requests.map((q) => q.url.href)).toEqual(['https://loja.com.br/']);
  });

  it('4º redirecionamento → excesso, sem segui-lo', async () => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, (_r, n) => ok(301, 1_000 + n, `/p${n + 1}`));
    const r = await analyzeSite('https://loja.com.br/', s.deps);
    expect(r).toMatchObject({ online: false, failure: 'EXCESSO_REDIRECIONAMENTOS', statusCode: null });
    expect(s.transport.requests).toHaveLength(4);
    expect(s.transport.requests.every((q) => q.method === 'GET')).toBe(true);
  });

  it('3 redirecionamentos seguidos → resposta final registrada', async () => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, (_r, n) =>
      n < 3 ? ok(308, 1_000, `/p${n + 1}`) : ok(200, 1_800),
    );
    const r = await analyzeSite('https://loja.com.br/', s.deps);
    expect(r).toMatchObject({ online: true, statusCode: 200, finalUrl: 'https://loja.com.br/p3', responseTimeMs: 800 });
  });
});

describe('analyzeSite — orçamento de tempo e fallback', () => {
  it('orçamento total esgotado durante https:// → nenhum http://, motivo TIMEOUT', async () => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, (r) => {
      s.timers.fire(10_000);
      return hangUntilAbort(r);
    });
    const r = await analyzeSite('loja.com.br', s.deps);
    expect(r).toMatchObject({ online: false, failure: 'TIMEOUT', statusCode: null });
    expect(s.transport.requests.map((q) => q.url.protocol)).toEqual(['https:']);
    expect(s.timers.active()).toEqual([]);
  });

  it('sub-limite de 6 s do https:// → tenta http:// com o orçamento restante', async () => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, (r) => {
      if (r.url.protocol === 'https:') {
        s.timers.fire(6_000);
        return hangUntilAbort(r);
      }
      return ok(200, 1_000 + 6_300);
    });
    const r = await analyzeSite('loja.com.br', s.deps);
    expect(r).toMatchObject({ online: true, isHttps: false, sslValid: false, statusCode: 200, responseTimeMs: 6_300, slow: true });
  });

  it('erro de SSL no https:// é preservado quando o http:// responde', async () => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, (r) => {
      if (r.url.protocol === 'https:') throw new TransportError('SSL', 'EXPIRADO');
      return ok(200, 1_300);
    });
    const r = await analyzeSite('loja.com.br', s.deps);
    expect(r).toMatchObject({ online: true, isHttps: false, sslValid: false, sslProblem: 'EXPIRADO', failure: null });
  });

  it('website com esquema explícito não tem fallback', async () => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, () => {
      throw new TransportError('CONEXAO_RECUSADA');
    });
    const r = await analyzeSite('https://loja.com.br', s.deps);
    expect(r).toMatchObject({ online: false, failure: 'CONEXAO_RECUSADA', failureDetail: 'conexão recusada' });
    expect(s.transport.requests).toHaveLength(1);
  });

  describe('temporizador padrão (setTimeout)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('aborta após 10 s sem esperar tempo real', async () => {
      vi.useFakeTimers();
      const resolver = fakeResolver({ 'loja.com.br': [addr(PUBLIC)] });
      const transport = fakeTransport((r) => hangUntilAbort(r));
      const p = analyzeSite('https://loja.com.br', { resolver, transport, now: () => 0 });
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(p).resolves.toMatchObject({ online: false, failure: 'TIMEOUT', failureDetail: 'timeout' });
    });
  });
});

describe('analyzeSite — status final', () => {
  it.each([
    [99, false],
    [100, true],
    [399, true],
    [400, false],
  ])('status %i → online=%s', async (status, online) => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, () => ok(status, 1_250));
    const r = await analyzeSite('https://loja.com.br', s.deps);
    expect(r.online).toBe(online);
    expect(r.statusCode).toBe(status);
    expect(r.failure).toBe(online ? null : 'HTTP_ERRO');
    expect(r.failureDetail).toBe(online ? null : `HTTP ${status}`);
    expect(r).toMatchObject({ isHttps: true, sslValid: true, responseTimeMs: 250, slow: false });
  });

  it('falha de DNS nas duas tentativas → offline DNS', async () => {
    const s = setup({ 'loja.com.br': [] }, () => ok(200, 0));
    const r = await analyzeSite('loja.com.br', s.deps);
    expect(r).toMatchObject({ online: false, failure: 'DNS', statusCode: null });
    expect(s.resolver.calls).toEqual(['loja.com.br', 'loja.com.br']);
    expect(s.transport.requests).toHaveLength(0);
  });
});
