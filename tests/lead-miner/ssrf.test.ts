import { describe, expect, it } from 'vitest';
import {
  BLOCKED_HOSTNAMES,
  isBlockedAddress,
  resolveAndValidate,
  validateUrlShape,
} from '@/lib/leads/net/ssrf';
import { addr, fakeResolver } from './support/fake-net';

/** Um endereço de cada faixa de Endereco_Bloqueado (Req. 4.3, 20.4). */
const BLOCKED_SAMPLES = [
  '0.0.0.0', // não especificado
  '10.0.0.1', // RFC 1918
  '172.16.0.1', // RFC 1918
  '172.31.255.254', // RFC 1918 (fim da faixa)
  '192.168.1.1', // RFC 1918
  '127.0.0.1', // loopback
  '169.254.10.20', // link-local
  '169.254.169.254', // metadata de nuvem
  '100.64.0.1', // CGNAT
  '224.0.0.1', // multicast
  '240.0.0.1', // reservado
  '255.255.255.255', // broadcast
  '192.0.2.1', // documentação
  '198.18.0.1', // benchmarking
  '::', // IPv6 não especificado
  '::1', // IPv6 loopback
  'fe80::1', // IPv6 link-local
  'fc00::1', // ULA
  'fd12:3456::1', // ULA
  'ff02::1', // IPv6 multicast
  '::ffff:127.0.0.1', // IPv4 mapeado (loopback)
  '::ffff:10.0.0.1', // IPv4 mapeado (privado)
  '::ffff:169.254.169.254', // IPv4 mapeado (metadata)
  '64:ff9b::7f00:1', // NAT64 → 127.0.0.1
  '2002:c000:0204::1', // 6to4
  '2001:0:4136:e378::1', // teredo
  '2001:db8::1', // documentação
];

describe('validateUrlShape', () => {
  it.each(['ftp://exemplo.com.br/', 'file:///etc/passwd', 'gopher://exemplo.com.br/', 'javascript:alert(1)'])(
    'rejeita esquema não http/https: %s',
    (u) => {
      expect(validateUrlShape(u)).toBe('ESQUEMA');
    },
  );

  it.each(['http://exemplo.com.br:8080/', 'https://exemplo.com.br:8443/', 'http://exemplo.com.br:22/', 'http://exemplo.com.br:0/'])(
    'rejeita porta diferente de 80/443: %s',
    (u) => {
      expect(validateUrlShape(u)).toBe('PORTA');
    },
  );

  it.each([
    'http://user@exemplo.com.br/',
    'http://user:pass@exemplo.com.br/',
    'http://:pass@exemplo.com.br/',
    'http://:@exemplo.com.br/',
    'http://@exemplo.com.br/',
    'https://user:@exemplo.com.br/',
  ])('rejeita credenciais embutidas: %s', (u) => {
    expect(validateUrlShape(u)).toBe('CREDENCIAIS');
    // Também quando recebe o URL parseado mais a string original.
    expect(validateUrlShape(new URL(u), u)).toBe('CREDENCIAIS');
  });

  it.each(['https://exemplo.com.br', 'http://exemplo.com.br/', 'http://exemplo.com.br:80/a?b=1', 'https://exemplo.com.br:443/#x'])(
    'aceita http/https com porta ausente, 80 ou 443: %s',
    (u) => {
      expect(validateUrlShape(u)).toBeNull();
      expect(validateUrlShape(new URL(u), u)).toBeNull();
    },
  );

  it('URL não parseável → URL_INVALIDA', () => {
    expect(validateUrlShape('não é url')).toBe('URL_INVALIDA');
  });
});

describe('isBlockedAddress', () => {
  it.each(BLOCKED_SAMPLES)('bloqueia %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['200.147.67.142', '8.8.8.8', '2804:14c::1', '2a00:1450:4001::1', '::ffff:8.8.8.8'])('libera público %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it('bloqueia texto que não é IP (falha fechada)', () => {
    expect(isBlockedAddress('exemplo.com.br')).toBe(true);
    expect(isBlockedAddress('fe80::1%eth0')).toBe(true);
  });
});

describe('resolveAndValidate', () => {
  it('aceita https://exemplo.com.br resolvendo para IP público e devolve o IP validado', async () => {
    const resolver = fakeResolver({ 'exemplo.com.br': [addr('200.147.67.142'), addr('2804:14c::1')] });
    const r = await resolveAndValidate(new URL('https://exemplo.com.br'), resolver);
    expect(r).toEqual({ ok: true, address: '200.147.67.142', family: 4 });
    expect(resolver.calls).toEqual(['exemplo.com.br']);
  });

  it.each(BLOCKED_SAMPLES)('rejeita host que resolve para %s', async (ip) => {
    const resolver = fakeResolver({ 'exemplo.com.br': [addr(ip)] });
    const r = await resolveAndValidate(new URL('https://exemplo.com.br/'), resolver);
    expect(r).toEqual({ ok: false, reason: 'DESTINO_BLOQUEADO' });
  });

  it('rejeita host com um IP privado entre públicos', async () => {
    const resolver = fakeResolver({
      'exemplo.com.br': [addr('200.147.67.142'), addr('10.0.0.5'), addr('8.8.8.8')],
    });
    const r = await resolveAndValidate(new URL('https://exemplo.com.br/'), resolver);
    expect(r).toEqual({ ok: false, reason: 'DESTINO_BLOQUEADO' });
  });

  it.each([
    'http://2130706433/', // decimal inteiro
    'http://0x7f.1/', // hexadecimal curto
    'http://0177.0.0.1/', // octal
    'http://0x7f000001/', // hexadecimal inteiro
    'http://127.1/', // forma curta
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data/',
  ])('rejeita IP literal bloqueado sem consultar DNS: %s', async (u) => {
    const resolver = fakeResolver();
    const r = await resolveAndValidate(new URL(u), resolver);
    expect(r).toEqual({ ok: false, reason: 'DESTINO_BLOQUEADO' });
    expect(resolver.calls).toEqual([]);
  });

  it('aceita IP literal público sem consultar DNS', async () => {
    const resolver = fakeResolver();
    expect(await resolveAndValidate(new URL('https://8.8.8.8/'), resolver)).toEqual({
      ok: true,
      address: '8.8.8.8',
      family: 4,
    });
    expect(await resolveAndValidate(new URL('https://[2a00:1450:4001::1]/'), resolver)).toEqual({
      ok: true,
      address: '2a00:1450:4001::1',
      family: 6,
    });
    expect(resolver.calls).toEqual([]);
  });

  it.each([...BLOCKED_HOSTNAMES, 'METADATA.GOOGLE.INTERNAL', 'metadata.google.internal.', 'app.localhost'])(
    'rejeita nome de host bloqueado sem consultar DNS: %s',
    async (host) => {
      const resolver = fakeResolver(() => [addr('8.8.8.8')]);
      const r = await resolveAndValidate(new URL(`http://${host}/`), resolver);
      expect(r).toEqual({ ok: false, reason: 'DESTINO_BLOQUEADO' });
      expect(resolver.calls).toEqual([]);
    },
  );

  it('DNS vazio → DNS', async () => {
    const resolver = fakeResolver({ 'exemplo.com.br': [] });
    expect(await resolveAndValidate(new URL('https://exemplo.com.br/'), resolver)).toEqual({ ok: false, reason: 'DNS' });
  });

  it('falha de DNS → DNS', async () => {
    const resolver = fakeResolver();
    expect(await resolveAndValidate(new URL('https://nao-existe.com.br/'), resolver)).toEqual({ ok: false, reason: 'DNS' });
    expect(resolver.calls).toEqual(['nao-existe.com.br']);
  });

  it('forma inválida → URL_INVALIDA sem consultar DNS', async () => {
    const resolver = fakeResolver(() => [addr('8.8.8.8')]);
    for (const u of ['ftp://exemplo.com.br/', 'http://exemplo.com.br:8080/', 'http://user:pass@exemplo.com.br/']) {
      expect(await resolveAndValidate(new URL(u), resolver)).toEqual({ ok: false, reason: 'URL_INVALIDA' });
    }
    expect(resolver.calls).toEqual([]);
  });
});
