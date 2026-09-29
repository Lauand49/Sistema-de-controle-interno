/**
 * Geradores de endereços IP para os testes da Guarda_SSRF.
 * As faixas são definidas aqui de forma independente de `lib/leads/net/ssrf.ts`
 * (modelo de referência), a partir da definição de Endereco_Bloqueado.
 */
import fc from 'fast-check';

const octet = fc.integer({ min: 0, max: 255 });

/** Faixas IPv4 bloqueadas: [primeiros octetos fixos, prefixo em bits]. */
const BLOCKED_V4: readonly [number[], number][] = [
  [[0], 8], // não especificado / "this network"
  [[10], 8], // RFC 1918
  [[100, 64], 10], // CGNAT
  [[127], 8], // loopback
  [[169, 254], 16], // link-local (inclui 169.254.169.254, metadata)
  [[172, 16], 12], // RFC 1918
  [[192, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2], 24], // TEST-NET-1
  [[192, 168], 16], // RFC 1918
  [[198, 18], 15], // benchmarking
  [[198, 51, 100], 24], // TEST-NET-2
  [[203, 0, 113], 24], // TEST-NET-3
  [[224], 4], // multicast
  [[240], 4], // reservado (inclui 255.255.255.255)
];

function toInt(o: number[]): number {
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}

export function ipv4ToOctets(ip: string): [number, number, number, number] {
  const p = ip.split('.').map(Number);
  return [p[0], p[1], p[2], p[3]];
}

/** Um endereço IPv4 dentro de uma faixa bloqueada, em notação decimal pontuada. */
export const arbIpv4Blocked: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...BLOCKED_V4), fc.integer({ min: 0, max: 0xffffffff }))
  .map(([[fixed, prefix], rnd]) => {
    const base = toInt([...fixed, 0, 0, 0, 0].slice(0, 4));
    const hostBits = 32 - prefix;
    const mask = hostBits === 32 ? 0xffffffff : (2 ** hostBits - 1);
    const n = (base + (rnd & mask)) >>> 0;
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  });

/**
 * Primeiros octetos seguramente públicos: exclui 0, 10, 100, 127, 169, 172, 192,
 * 198, 203 e 224–255 por inteiro (as faixas especiais caem todas nesses octetos).
 */
const PUBLIC_FIRST_OCTETS = Array.from({ length: 223 }, (_, i) => i + 1).filter(
  (o) => ![10, 100, 127, 169, 172, 192, 198, 203].includes(o),
);

/** Um endereço IPv4 público (unicast global), em notação decimal pontuada. */
export const arbIpv4Public: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...PUBLIC_FIRST_OCTETS), octet, octet, octet)
  .map((o) => o.join('.'));

const hextet = fc.integer({ min: 0, max: 0xffff });
const hex = (n: number) => n.toString(16);

/** Um endereço IPv6 bloqueado (loopback, ULA, link-local, multicast, mapeado/NAT64 bloqueado, 6to4, teredo, documentação). */
export const arbIpv6Blocked: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('::1', '::'),
  // fe80::/10
  fc.tuple(fc.integer({ min: 0xfe80, max: 0xfebf }), hextet, hextet).map(([a, b, c]) => `${hex(a)}:${hex(b)}::${hex(c)}`),
  // fc00::/7 (ULA)
  fc.tuple(fc.integer({ min: 0xfc00, max: 0xfdff }), hextet, hextet).map(([a, b, c]) => `${hex(a)}:${hex(b)}::${hex(c)}`),
  // ff00::/8 (multicast)
  fc.tuple(fc.integer({ min: 0xff00, max: 0xffff }), hextet).map(([a, c]) => `${hex(a)}::${hex(c)}`),
  // IPv4 mapeado de faixa bloqueada
  arbIpv4Blocked.map((v4) => `::ffff:${v4}`),
  // NAT64 com IPv4 bloqueado
  arbIpv4Blocked.map((v4) => `64:ff9b::${v4}`),
  // 6to4 (2002::/16)
  fc.tuple(hextet, hextet).map(([b, c]) => `2002:${hex(b)}::${hex(c)}`),
  // teredo (2001:0::/32)
  fc.tuple(hextet, hextet).map(([b, c]) => `2001:0:${hex(b)}::${hex(c)}`),
  // documentação (2001:db8::/32)
  fc.tuple(hextet, hextet).map(([b, c]) => `2001:db8:${hex(b)}::${hex(c)}`),
);

/** Um endereço IPv6 unicast global (2400::/12, 2800::/12, 2a00::/12). */
export const arbIpv6Public: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(0x2400, 0x2800, 0x2a00),
    fc.integer({ min: 0, max: 0xf }),
    hextet,
    hextet,
  )
  .map(([p, q, b, c]) => `${hex(p + q)}:${hex(b)}::${hex(c)}`);
