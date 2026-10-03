/**
 * Setup global do Vitest: nenhum teste pode acessar a rede real (Req. 20.6, 20.7).
 * Qualquer tentativa de conexão TCP, resolução DNS ou fetch lança um erro.
 */
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';

const NETWORK_ERROR_MESSAGE = 'Acesso à rede proibido em testes';

function forbidden(): never {
  throw new Error(NETWORK_ERROR_MESSAGE);
}

net.Socket.prototype.connect = forbidden as unknown as typeof net.Socket.prototype.connect;
dns.lookup = forbidden as unknown as typeof dns.lookup;
dns.promises.lookup = forbidden as unknown as typeof dns.promises.lookup;
globalThis.fetch = forbidden as unknown as typeof globalThis.fetch;

// Propaga as substituições para os imports nomeados ESM (`import { lookup } from 'node:dns'`).
syncBuiltinESMExports();

// Nenhum teste pode depender de chaves reais nem de limites configurados no ambiente
// (Gemini, Places API e PageSpeed — Req. 21.1, 21.10).
for (const name of [
  'GEMINI_API_KEY',
  'GOOGLE_PLACES_API_KEY',
  'PAGESPEED_API_KEY',
  'PLACES_MONTHLY_LIMIT',
  'PAGESPEED_MONTHLY_LIMIT',
]) {
  delete process.env[name];
}
