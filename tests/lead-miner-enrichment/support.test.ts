/**
 * Sanidade dos fakes de suporte da Etapa 3 (nenhuma rede real).
 * **Validates: Requirements 21.1, 21.10**
 */
import { describe, expect, it } from 'vitest';
import { fakeBrasilApi } from './support/fake-brasilapi';
import { fakeFetch } from './support/fake-fetch';
import { fakeGemini } from './support/fake-gemini';
import { fakePageSpeed } from './support/fake-pagespeed';
import { fakePlaces, rawPlace, searchPage } from './support/fake-places';
import { fakeBodyTransport, htmlAnswer } from './support/fake-transport-body';
import { memoryUsageGate } from './support/fake-usage';

describe('memoryUsageGate', () => {
  it('reserva por provedor e mês até o limite e conta as reservas', async () => {
    const log: string[] = [];
    const gate = memoryUsageGate({ 'places:2025-05': 1 }, log);
    expect(await gate.reserve('places', '2025-05', 2)).toBe(true);
    expect(await gate.reserve('places', '2025-05', 2)).toBe(false);
    expect(await gate.reserve('pagespeed', '2025-05', 2)).toBe(true);
    expect(await gate.reserve('gemini', '2025-05', 0)).toBe(false);
    expect(await gate.count('places', '2025-05')).toBe(2);
    expect(await gate.count('pagespeed', '2025-05')).toBe(1);
    expect(await gate.count('places', '2025-06')).toBe(0);
    expect(log).toEqual(['reserve:places:ok', 'reserve:places:negada', 'reserve:pagespeed:ok', 'reserve:gemini:negada']);
  });
});

describe('fakeFetch', () => {
  it('registra URL, cabeçalhos e corpo e responde pelo roteiro', async () => {
    const f = fakeFetch([{ status: 200, json: { ok: 1 } }, { status: 403, text: 'proibido' }, { error: 'network' }]);
    const r1 = await f('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'X-Goog-Api-Key': 'k', 'Content-Type': 'application/json' },
      body: JSON.stringify({ textQuery: 'x' }),
    });
    expect(await r1.json()).toEqual({ ok: 1 });
    expect((await f('https://a.test/')).status).toBe(403);
    await expect(f('https://a.test/')).rejects.toThrow('fetch failed');
    await expect(f('https://a.test/')).rejects.toThrow('roteiro esgotado');
    expect(f.calls[0]).toEqual({
      url: 'https://places.googleapis.com/v1/places:searchText',
      method: 'POST',
      headers: { 'x-goog-api-key': 'k', 'content-type': 'application/json' },
      body: '{"textQuery":"x"}',
    });
  });

  it('rejeita com AbortError quando o sinal aborta uma chamada travada', async () => {
    const f = fakeFetch([{ hang: true }]);
    const ctrl = new AbortController();
    const p = f('https://a.test/', { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('clientes falsos por roteiro', () => {
  it('Places: status, JSON e timeout por atraso maior que o limite', async () => {
    const places = fakePlaces([searchPage([rawPlace()], 'tok'), { status: 429 }, { status: 200, delayMs: 20_000 }]);
    const req = { method: 'POST' as const, path: '/v1/places:searchText', fieldMask: 'places.id', timeoutMs: 15_000 };
    expect(await places.request(req)).toEqual({ status: 200, json: { places: [rawPlace()], nextPageToken: 'tok' } });
    expect((await places.request(req)).status).toBe(429);
    await expect(places.request(req)).rejects.toThrow('timeout');
    expect(places.calls).toHaveLength(3);
    expect(places.remaining()).toBe(0);
  });

  it('PageSpeed e BrasilAPI registram as chamadas', async () => {
    const ps = fakePageSpeed([{ status: 500 }]);
    expect((await ps.run(new URLSearchParams({ url: 'https://x.test/' }), 30_000)).status).toBe(500);
    expect(ps.calls[0].query.get('url')).toBe('https://x.test/');
    const br = fakeBrasilApi([{ status: 404, json: { message: 'não encontrado' } }, { error: 'timeout' }]);
    expect((await br.getCnpj('11222333000181', 8_000)).status).toBe(404);
    await expect(br.getCnpj('11222333000181', 8_000)).rejects.toThrow('timeout');
    expect(br.calls.map((c) => c.cnpj)).toEqual(['11222333000181', '11222333000181']);
  });

  it('Gemini: texto, erro e hang abortado', async () => {
    const g = fakeGemini([{ text: '{"a":1}' }, { error: 'falhou' }, { hang: true }]);
    const ctrl = new AbortController();
    expect(await g.generate('p1', { signal: ctrl.signal })).toBe('{"a":1}');
    await expect(g.generate('p2', { signal: ctrl.signal })).rejects.toThrow('falhou');
    const hung = g.generate('p3', { signal: ctrl.signal });
    ctrl.abort();
    await expect(hung).rejects.toMatchObject({ name: 'AbortError' });
    expect(g.prompts).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('fakeBodyTransport', () => {
  const base = { address: '93.184.216.34', family: 4 as const, method: 'GET' as const, maxBodyBytes: 4 };

  it('devolve contentType e corpo cortado no limite só com captureBody', async () => {
    const t = fakeBodyTransport({ 'https://x.test/': htmlAnswer('<html>') });
    const signal = new AbortController().signal;
    const withBody = await t.request({ ...base, url: new URL('https://x.test/'), signal, captureBody: true });
    expect(withBody.contentType).toBe('text/html; charset=utf-8');
    expect(new TextDecoder().decode(withBody.body!)).toBe('<htm');
    expect(withBody.bodyBytes).toBe(4);
    const without = await t.request({ ...base, url: new URL('https://x.test/'), signal });
    expect(without.body).toBeNull();
    expect(without.bodyBytes).toBe(4);
  });

  it('não captura corpo em redirecionamento', async () => {
    const t = fakeBodyTransport({ 'https://x.test/': { status: 301, location: '/y', body: 'mov' } });
    const r = await t.request({ ...base, url: new URL('https://x.test/'), signal: new AbortController().signal, captureBody: true });
    expect(r.body).toBeNull();
    expect(r.location).toBe('/y');
  });
});
