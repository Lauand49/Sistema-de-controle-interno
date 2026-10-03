/**
 * Sanidade do bloqueio de rede do setup global (tests/setup/no-network.ts).
 * **Validates: Requirements 20.6, 20.7, 21.1, 21.10**
 */
import dns from 'node:dns';
import net from 'node:net';
import { describe, expect, it } from 'vitest';

const NETWORK_ERROR_MESSAGE = 'Acesso à rede proibido em testes';

/** Aceita tanto o lançamento síncrono quanto uma Promise rejeitada. */
async function expectNetworkForbidden(action: () => unknown): Promise<void> {
  await expect(
    (async () => {
      await action();
    })(),
  ).rejects.toThrow(NETWORK_ERROR_MESSAGE);
}

describe('bloqueio de rede nos testes', () => {
  it('fetch lança o erro de rede proibida', async () => {
    await expectNetworkForbidden(() => fetch('https://example.com'));
  });

  it('dns.promises.lookup lança o erro de rede proibida', async () => {
    await expectNetworkForbidden(() => dns.promises.lookup('example.com'));
  });

  it('net.connect lança o erro de rede proibida', async () => {
    await expectNetworkForbidden(() => net.connect({ host: '127.0.0.1', port: 80 }));
  });

  it('GEMINI_API_KEY não está definida', () => {
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
  });

  it.each(['GOOGLE_PLACES_API_KEY', 'PAGESPEED_API_KEY', 'PLACES_MONTHLY_LIMIT', 'PAGESPEED_MONTHLY_LIMIT'])(
    '%s não está definida',
    (name) => {
      expect(process.env[name]).toBeUndefined();
    },
  );
});
