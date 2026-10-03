// Feature: lead-miner, Property 9: Forma da URL na Guarda_SSRF
/**
 * **Validates: Requirements 4.1, 4.2**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveAndValidate, validateUrlShape } from '@/lib/leads/net/ssrf';
import { addr, fakeResolver } from './support/fake-net';

const alnum = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const label = fc.array(fc.constantFrom(...alnum), { minLength: 1, maxLength: 10 }).map((a) => a.join(''));
const arbHost = fc
  .tuple(fc.array(label, { minLength: 1, maxLength: 3 }), fc.constantFrom('com.br', 'com', 'org.br', 'net'))
  .map(([labels, tld]) => [...labels, tld].join('.'));

const arbScheme = fc.constantFrom(
  'http', 'https', 'HTTP', 'Https', 'ftp', 'ws', 'wss', 'gopher', 'file', 'sftp', 'ldap', 'dict',
);

const word = fc.array(fc.constantFrom(...'abcdefxyz'.split('')), { minLength: 1, maxLength: 6 }).map((a) => a.join(''));
/** userinfo: null = sem credenciais; demais variantes incluem usuário/senha vazios. */
const arbUserinfo = fc.oneof(
  { weight: 3, arbitrary: fc.constant(null as string | null) },
  { weight: 1, arbitrary: fc.constantFrom('@', ':@') },
  { weight: 2, arbitrary: word.map((u) => `${u}@`) },
  { weight: 2, arbitrary: word.map((u) => `${u}:@`) },
  { weight: 2, arbitrary: word.map((p) => `:${p}@`) },
  { weight: 2, arbitrary: fc.tuple(word, word).map(([u, p]) => `${u}:${p}@`) },
);

const arbPort = fc.oneof(
  { weight: 3, arbitrary: fc.constant(null as number | null) },
  { weight: 2, arbitrary: fc.constantFrom(80, 443) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 65535 }) },
);

const arbPath = fc.constantFrom('', '/', '/contato', '/a/b?c=1', '/#x');

describe('Property 9: Forma da URL na Guarda_SSRF', () => {
  it('aceita sse esquema http/https, porta ausente/80/443 e sem credenciais; rejeitada não consulta DNS', async () => {
    await fc.assert(
      fc.asyncProperty(arbScheme, arbUserinfo, arbHost, arbPort, arbPath, async (scheme, userinfo, host, port, path) => {
        const raw = `${scheme}://${userinfo ?? ''}${host}${port === null ? '' : `:${port}`}${path}`;

        const expectedOk =
          ['http', 'https'].includes(scheme.toLowerCase()) &&
          (port === null || port === 80 || port === 443) &&
          userinfo === null;

        const shape = validateUrlShape(raw);
        expect(shape === null).toBe(expectedOk);

        // Mesma decisão quando recebe o URL parseado junto da string original.
        let parsed: URL | null = null;
        try {
          parsed = new URL(raw);
        } catch {
          parsed = null;
        }
        if (parsed) expect(validateUrlShape(parsed, raw) === null).toBe(expectedOk);

        // Pipeline da guarda: forma → resolução. Rejeitada ⇒ resolver nunca chamado.
        const resolver = fakeResolver(() => [addr('200.147.67.142')]);
        if (shape === null && parsed) {
          const r = await resolveAndValidate(parsed, resolver);
          expect(r.ok).toBe(true);
        }
        // resolveAndValidate sozinho também não resolve quando o URL parseado já revela o problema.
        if (parsed && validateUrlShape(parsed) !== null) {
          const r = await resolveAndValidate(parsed, resolver);
          expect(r).toEqual({ ok: false, reason: 'URL_INVALIDA' });
        }
        if (!expectedOk) expect(resolver.calls).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
