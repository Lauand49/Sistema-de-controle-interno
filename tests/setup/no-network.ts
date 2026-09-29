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

// Nenhum teste pode depender de uma chave real do Gemini.
delete process.env.GEMINI_API_KEY;
