// Feature: lead-miner, Property 10: Bloqueio por endereço resolvido
/**
 * **Validates: Requirements 4.3, 4.8**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveAndValidate } from '@/lib/leads/net/ssrf';
import { arbIpv4Blocked, arbIpv4Public, arbIpv6Blocked, arbIpv6Public, ipv4ToOctets } from './support/arb-ip';
import { addr, fakeResolver } from './support/fake-net';

const arbTaggedAddress = fc.oneof(
  arbIpv4Public.map((ip) => ({ ip, blocked: false })),
  arbIpv6Public.map((ip) => ({ ip, blocked: false })),
  arbIpv4Blocked.map((ip) => ({ ip, blocked: true })),
  arbIpv6Blocked.map((ip) => ({ ip, blocked: true })),
);

type Notation = 'pontuada' | 'inteiro' | 'octal' | 'hex-inteiro' | 'hex-octetos' | 'mapeado';

/** Escreve um IPv4 como host literal na notação pedida. */
function writeLiteral(ip: string, notation: Notation): string {
  const o = ipv4ToOctets(ip);
  const n = ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
  switch (notation) {
    case 'pontuada':
      return ip;
    case 'inteiro':
      return String(n);
    case 'octal':
      return o.map((x) => `0${x.toString(8)}`).join('.');
    case 'hex-inteiro':
      return `0x${n.toString(16)}`;
    case 'hex-octetos':
      return o.map((x) => `0x${x.toString(16)}`).join('.');
    case 'mapeado':
      return `[::ffff:${ip}]`;
  }
}

describe('Property 10: Bloqueio por endereço resolvido', () => {
  it('aceita o host sse nenhum endereço resolvido é bloqueado', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbTaggedAddress, { minLength: 1, maxLength: 6 }), async (list) => {
        const resolver = fakeResolver({ 'exemplo.com.br': list.map((a) => addr(a.ip)) });
        const r = await resolveAndValidate(new URL('https://exemplo.com.br/'), resolver);
        const anyBlocked = list.some((a) => a.blocked);
        if (anyBlocked) {
          expect(r).toEqual({ ok: false, reason: 'DESTINO_BLOQUEADO' });
        } else {
          // Conecta a um endereço validado (o primeiro).
          expect(r).toEqual({ ok: true, ...addr(list[0].ip) });
        }
        expect(resolver.calls).toEqual(['exemplo.com.br']);
      }),
      { numRuns: 100 },
    );
  });

  it('IPv4 bloqueado como literal em qualquer notação → DESTINO_BLOQUEADO sem DNS', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIpv4Blocked,
        fc.constantFrom<Notation>('pontuada', 'inteiro', 'octal', 'hex-inteiro', 'hex-octetos', 'mapeado'),
        fc.constantFrom('http', 'https'),
        async (ip, notation, scheme) => {
          const resolver = fakeResolver(() => [addr('200.147.67.142')]);
          const url = new URL(`${scheme}://${writeLiteral(ip, notation)}/`);
          const r = await resolveAndValidate(url, resolver);
          expect(r).toEqual({ ok: false, reason: 'DESTINO_BLOQUEADO' });
          expect(resolver.calls).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
