/**
 * Guarda_SSRF (Req. 4.1, 4.2, 4.3, 4.11).
 *
 * Módulo sem I/O próprio: a resolução DNS é feita por um `Resolver` injetado,
 * o que permite testar tudo sem rede. O resolver real usa
 * `dns.promises.lookup(host, { all: true, verbatim: true })`.
 */
import ipaddr from 'ipaddr.js';

export type UrlShapeError = 'ESQUEMA' | 'PORTA' | 'CREDENCIAIS' | 'URL_INVALIDA';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443']);

/**
 * Extrai a authority (`userinfo@host:porta`) da string original da URL.
 * Necessário porque o parser WHATWG descarta um `@` com usuário e senha vazios
 * (`http://@host/` e `http://:@host/` viram `http://host/`).
 */
function rawAuthority(raw: string): string | null {
  const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:[\\/]{2}([^\\/?#]*)/.exec(raw.trim());
  return m ? m[1] : null;
}

/**
 * Valida esquema, porta e credenciais antes de qualquer DNS ou conexão.
 * Aceita a URL já parseada e/ou a string original; quando só há um `URL`,
 * o `href` é usado como string original.
 */
export function validateUrlShape(u: URL | string, original?: string): UrlShapeError | null {
  let url: URL;
  if (typeof u === 'string') {
    try {
      url = new URL(u);
    } catch {
      return 'URL_INVALIDA';
    }
  } else {
    url = u;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return 'ESQUEMA';
  if (!ALLOWED_PORTS.has(url.port)) return 'PORTA';
  if (url.username !== '' || url.password !== '') return 'CREDENCIAIS';
  const raws = [url.href, typeof u === 'string' ? u : undefined, original];
  for (const raw of raws) {
    if (raw === undefined) continue;
    const authority = rawAuthority(raw);
    if (authority !== null && authority.includes('@')) return 'CREDENCIAIS';
  }
  if (!url.hostname) return 'URL_INVALIDA';
  return null;
}

/** Nomes de host bloqueados sem consulta DNS (metadata de nuvem e loopback). */
export const BLOCKED_HOSTNAMES: readonly string[] = ['metadata.google.internal', 'metadata', 'localhost'];

function normalizeHostname(host: string): string {
  return host.toLowerCase().replace(/\.+$/, '');
}

function isBlockedHostname(host: string): boolean {
  const h = normalizeHostname(host);
  return BLOCKED_HOSTNAMES.includes(h) || h.endsWith('.localhost');
}

function isBlockedIPv4(ip: ipaddr.IPv4): boolean {
  return ip.range() !== 'unicast';
}

function isBlockedIPv6(ip: ipaddr.IPv6): boolean {
  const range = ip.range();
  // ::ffff:a.b.c.d → reavalia o IPv4 embutido.
  if (range === 'ipv4Mapped') return isBlockedIPv4(ip.toIPv4Address());
  // NAT64 64:ff9b::/96 → os últimos 32 bits são o IPv4 de destino.
  if (range === 'rfc6052') {
    const p = ip.parts;
    return isBlockedIPv4(new ipaddr.IPv4([p[6] >> 8, p[6] & 0xff, p[7] >> 8, p[7] & 0xff]));
  }
  // IPv4-compatível obsoleto (::/96): não roteável.
  if (ip.parts.slice(0, 6).every((x) => x === 0)) return true;
  // Qualquer outra faixa especial (6to4, teredo, ULA, link-local, multicast, reservadas...) é bloqueada.
  return range !== 'unicast';
}

/**
 * true se `ip` é Endereco_Bloqueado. Endereços que não são IP válido
 * também são bloqueados (falha fechada).
 */
export function isBlockedAddress(ip: string): boolean {
  let s = ip.trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  // Zone id (fe80::1%eth0) não é aceito para destino público.
  if (s.includes('%')) return true;
  if (!ipaddr.isValid(s)) return true;
  const addr = ipaddr.parse(s);
  return addr.kind() === 'ipv4'
    ? isBlockedIPv4(addr as ipaddr.IPv4)
    : isBlockedIPv6(addr as ipaddr.IPv6);
}

export interface Resolver {
  resolveAll(host: string): Promise<{ address: string; family: 4 | 6 }[]>;
}

export type GuardResult =
  | { ok: true; address: string; family: 4 | 6 }
  | { ok: false; reason: 'DESTINO_BLOQUEADO' | 'DNS' | 'URL_INVALIDA' };

/** Retorna o IP literal do host (já normalizado pelo parser WHATWG) ou null. */
function literalAddress(hostname: string): { address: string; family: 4 | 6 } | null {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const inner = hostname.slice(1, -1);
    return ipaddr.IPv6.isValid(inner) ? { address: inner, family: 6 } : null;
  }
  // O parser WHATWG converte 2130706433, 0x7f.1, 0177.0.0.1 etc. para a forma pontuada.
  if (ipaddr.IPv4.isValidFourPartDecimal(hostname)) return { address: hostname, family: 4 };
  return null;
}

/**
 * Resolve o host e valida todos os endereços. Qualquer endereço bloqueado
 * rejeita a URL inteira; caso contrário devolve o primeiro endereço validado,
 * que deve ser usado na conexão (sem nova resolução).
 */
export async function resolveAndValidate(u: URL, resolver: Resolver): Promise<GuardResult> {
  if (validateUrlShape(u) !== null) return { ok: false, reason: 'URL_INVALIDA' };
  const hostname = u.hostname;

  const literal = literalAddress(hostname);
  if (literal) {
    return isBlockedAddress(literal.address)
      ? { ok: false, reason: 'DESTINO_BLOQUEADO' }
      : { ok: true, ...literal };
  }

  if (isBlockedHostname(hostname)) return { ok: false, reason: 'DESTINO_BLOQUEADO' };

  let addresses: { address: string; family: 4 | 6 }[];
  try {
    addresses = await resolver.resolveAll(hostname);
  } catch {
    return { ok: false, reason: 'DNS' };
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return { ok: false, reason: 'DNS' };

  if (addresses.some((a) => isBlockedAddress(a.address))) {
    return { ok: false, reason: 'DESTINO_BLOQUEADO' };
  }
  const first = addresses[0];
  return { ok: true, address: first.address, family: first.family };
}
