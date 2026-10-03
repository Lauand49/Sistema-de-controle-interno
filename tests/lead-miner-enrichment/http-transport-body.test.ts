/**
 * Captura do Corpo_HTML (Req. 7.2, 7.3, 21.8): `collectBody` com fluxos falsos e
 * `analyzeSiteWithBody` com resolver/transporte falsos (sem rede).
 */
import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES } from '@/lib/leads/config';
import { collectBody } from '@/lib/leads/net/http-transport';
import { analyzeSiteWithBody } from '@/lib/leads/site-analyzer';
import { addr, fakeResolver } from '../lead-miner/support/fake-net';
import type { ResolverAnswer } from '../lead-miner/support/fake-net';
import { fakeClock } from '../lead-miner/support/fake-clock';
import { fakeTimers } from '../lead-miner/support/fake-timers';
import { fakeBodyTransport, htmlAnswer } from './support/fake-transport-body';
import type { BodyAnswer, BodyTransportAnswer } from './support/fake-transport-body';

const PUBLIC = '93.184.216.34';
const PUBLIC_2 = '93.184.216.35';

/** Alimenta o coletor com os chunks, parando no primeiro `FULL` (como o transporte). */
function feed(maxBytes: number, chunks: Uint8Array[]) {
  const c = collectBody(maxBytes);
  const results: ('MORE' | 'FULL')[] = [];
  for (const chunk of chunks) {
    const r = c.push(chunk);
    results.push(r);
    if (r === 'FULL') break;
  }
  return { bytes: c.bytes(), results };
}

function filled(length: number, value: number): Uint8Array {
  return new Uint8Array(length).fill(value);
}

describe('collectBody — fluxos falsos', () => {
  it('corta em 1.048.576 bytes quando o fluxo é maior', () => {
    const chunk = filled(300_000, 7);
    const { bytes, results } = feed(MAX_BODY_BYTES, [chunk, chunk, chunk, chunk, chunk]);
    expect(MAX_BODY_BYTES).toBe(1_048_576);
    expect(bytes.length).toBe(1_048_576);
    expect(results).toEqual(['MORE', 'MORE', 'MORE', 'FULL']);
    expect(bytes.every((b) => b === 7)).toBe(true);
  });

  it('chunks parciais são concatenados na ordem, sem perda', () => {
    const text = 'Olá, <html>mundo</html>';
    const all = new TextEncoder().encode(text);
    const parts = [all.subarray(0, 1), all.subarray(1, 3), all.subarray(3, 3), all.subarray(3, 10), all.subarray(10)];
    const { bytes, results } = feed(MAX_BODY_BYTES, parts);
    expect(results.every((r) => r === 'MORE')).toBe(true);
    expect(new TextDecoder().decode(bytes)).toBe(text);
  });

  it('o chunk que cruza o limite é cortado exatamente no limite', () => {
    const { bytes, results } = feed(10, [filled(4, 1), filled(4, 2), filled(4, 3)]);
    expect(results).toEqual(['MORE', 'MORE', 'FULL']);
    expect(Array.from(bytes)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
  });

  it('chunk exatamente no limite → FULL; pushes posteriores não acrescentam bytes', () => {
    const c = collectBody(5);
    expect(c.push(filled(5, 9))).toBe('FULL');
    expect(c.push(filled(3, 1))).toBe('FULL');
    expect(c.bytes().length).toBe(5);
  });

  it('copia os chunks: reutilização do buffer de origem não altera o corpo', () => {
    const c = collectBody(100);
    const buf = filled(4, 1);
    c.push(buf);
    buf.fill(0);
    expect(Array.from(c.bytes())).toEqual([1, 1, 1, 1]);
  });

  it('fluxo vazio → corpo vazio', () => {
    expect(collectBody(MAX_BODY_BYTES).bytes().length).toBe(0);
  });
});

function setup(
  dns: Record<string, ResolverAnswer>,
  answers: Record<string, BodyTransportAnswer> | ((r: Parameters<ReturnType<typeof fakeBodyTransport>['request']>[0]) => BodyAnswer),
) {
  const clock = fakeClock(1_000);
  const timers = fakeTimers();
  const resolver = fakeResolver(dns);
  const transport = fakeBodyTransport(answers);
  return { resolver, transport, deps: { resolver, transport, now: clock.now, setTimer: timers.setTimer } };
}

describe('analyzeSiteWithBody — Guarda_SSRF e corpo', () => {
  it('HTML online: requisição passa pelo resolver, usa o IP validado e pede o corpo com o limite', async () => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, { 'https://loja.com.br/': htmlAnswer('<html>Oi</html>') });
    const r = await analyzeSiteWithBody('https://loja.com.br/', s.deps);
    expect(r.analysis.online).toBe(true);
    expect(r.html).toBe('<html>Oi</html>');
    expect(s.resolver.calls).toEqual(['loja.com.br']);
    expect(s.transport.requests).toHaveLength(1);
    expect(s.transport.requests[0]).toMatchObject({
      address: PUBLIC,
      family: 4,
      method: 'GET',
      captureBody: true,
      maxBodyBytes: MAX_BODY_BYTES,
    });
  });

  it('todo salto de redirecionamento passa pelo resolver; redirect sem corpo, HTML só da resposta final', async () => {
    const s = setup(
      { 'loja.com.br': [addr(PUBLIC)], 'www.loja.com.br': [addr(PUBLIC_2)] },
      {
        'https://loja.com.br/': { status: 301, location: 'https://www.loja.com.br/', contentType: 'text/html', body: '<html>redirect</html>' },
        'https://www.loja.com.br/': htmlAnswer('<html>final</html>'),
      },
    );
    const r = await analyzeSiteWithBody('https://loja.com.br/', s.deps);
    expect(r.html).toBe('<html>final</html>');
    expect(r.analysis.finalUrl).toBe('https://www.loja.com.br/');
    expect(s.resolver.calls).toEqual(['loja.com.br', 'www.loja.com.br']);
    expect(s.transport.requests.map((q) => [q.url.href, q.address])).toEqual([
      ['https://loja.com.br/', PUBLIC],
      ['https://www.loja.com.br/', PUBLIC_2],
    ]);
  });

  it('redirecionamento para IP privado → destino bloqueado, sem requisição ao destino e sem HTML', async () => {
    const s = setup(
      { 'loja.com.br': [addr(PUBLIC)] },
      {
        'https://loja.com.br/': { status: 302, location: 'http://10.0.0.1/', contentType: 'text/html', body: '<html>x</html>' },
        'http://10.0.0.1/': htmlAnswer('<html>interno</html>'),
      },
    );
    const r = await analyzeSiteWithBody('https://loja.com.br/', s.deps);
    expect(r.analysis).toMatchObject({ online: false, failure: 'DESTINO_BLOQUEADO' });
    expect(r.html).toBeNull();
    expect(s.transport.requests.map((q) => q.url.href)).toEqual(['https://loja.com.br/']);
  });

  it.each([
    ['loopback', [addr('127.0.0.1')]],
    ['misto público + privado', [addr(PUBLIC), addr('192.168.0.10')]],
  ])('host resolvido para endereço bloqueado (%s) → sem requisição e sem HTML', async (_n, answer) => {
    const s = setup({ 'loja.com.br': answer }, { 'https://loja.com.br/': htmlAnswer('<html>x</html>') });
    const r = await analyzeSiteWithBody('https://loja.com.br/', s.deps);
    expect(r.analysis).toMatchObject({ online: false, failure: 'DESTINO_BLOQUEADO' });
    expect(r.html).toBeNull();
    expect(s.resolver.calls).toEqual(['loja.com.br']);
    expect(s.transport.requests).toHaveLength(0);
  });

  it.each([
    ['application/json', '{"a":1}'],
    ['image/png', 'PNG'],
    [null, '<html>sem content-type</html>'],
  ])('Content-Type não HTML (%s) → online, mas sem HTML', async (contentType, body) => {
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, { 'https://loja.com.br/': { status: 200, contentType, body } });
    const r = await analyzeSiteWithBody('https://loja.com.br/', s.deps);
    expect(r.analysis.online).toBe(true);
    expect(r.html).toBeNull();
  });

  it('resposta HTML offline (HTTP 500) → sem HTML', async () => {
    const s = setup(
      { 'loja.com.br': [addr(PUBLIC)] },
      { 'https://loja.com.br/': { status: 500, contentType: 'text/html', body: '<html>erro</html>' } },
    );
    const r = await analyzeSiteWithBody('https://loja.com.br/', s.deps);
    expect(r.analysis).toMatchObject({ online: false, failure: 'HTTP_ERRO' });
    expect(r.html).toBeNull();
  });

  it('corpo maior que o limite chega cortado em 1.048.576 bytes', async () => {
    const big = '<html>' + 'a'.repeat(MAX_BODY_BYTES + 5_000);
    const s = setup({ 'loja.com.br': [addr(PUBLIC)] }, { 'https://loja.com.br/': htmlAnswer(big) });
    const r = await analyzeSiteWithBody('https://loja.com.br/', s.deps);
    expect(r.html).not.toBeNull();
    expect(new TextEncoder().encode(r.html ?? '').length).toBe(MAX_BODY_BYTES);
  });

  it('sem site → sem resolver, sem transporte, sem HTML', async () => {
    const s = setup({}, {});
    const r = await analyzeSiteWithBody(null, s.deps);
    expect(r.html).toBeNull();
    expect(s.resolver.calls).toHaveLength(0);
    expect(s.transport.requests).toHaveLength(0);
  });
});
