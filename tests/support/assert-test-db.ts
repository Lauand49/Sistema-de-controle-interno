/**
 * Trava de segurança dos testes de integração e dos scripts destrutivos.
 *
 * Regra: operações que apagam dados só podem rodar contra um banco cujo NOME TERMINA EM `_test`
 * (ex.: `scitec_test`). Os testes de integração usam APENAS `TEST_DATABASE_URL`; nunca `DATABASE_URL`.
 *
 * Este arquivo só lê `TEST_DATABASE_URL` (do ambiente ou de `.env.test`). Ele nunca abre o `.env`.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

export const TEST_DB_SUFFIX = '_test';

/** Como configurar; aparece nas mensagens de erro e de "pulado". */
export const TEST_DB_HELP = [
  'Como configurar os testes de integração:',
  '  1. createdb scitec_test                       (um banco descartável; o nome DEVE terminar em "_test")',
  '  2. cp .env.test.example .env.test             (e ajuste TEST_DATABASE_URL)',
  '  3. npm run test:int',
  'Eles nunca usam DATABASE_URL e apagam dados do banco de teste.',
].join('\n');

/** Nome do banco na URL (sem query string), decodificado; `null` se a URL for inválida ou sem banco. */
export function databaseNameFromUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  let name = parsed.pathname.replace(/^\/+/, '');
  try {
    name = decodeURIComponent(name);
  } catch {
    return null;
  }
  return name === '' || name.includes('/') ? null : name;
}

/**
 * Lança um erro claro se a URL não apontar para um banco `*_test`. Devolve a própria URL para
 * facilitar o encadeamento. Use no início de todo teste de integração (`beforeAll`) e de todo
 * script destrutivo.
 */
export function assertTestDatabase(url: string | null | undefined, context = 'operação destrutiva'): string {
  const name = databaseNameFromUrl(url);
  if (name === null) {
    throw new Error(
      `[assertTestDatabase] Recusado (${context}): a URL do banco está ausente ou não contém o nome do banco. ` +
        `Use um banco cujo nome termine em "${TEST_DB_SUFFIX}" (ex.: scitec_test).\n${TEST_DB_HELP}`,
    );
  }
  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `[assertTestDatabase] Recusado (${context}): o banco "${name}" não termina em "${TEST_DB_SUFFIX}". ` +
        `Dados só podem ser apagados em bancos de teste (ex.: scitec_test), nunca em "${name}".\n${TEST_DB_HELP}`,
    );
  }
  return (url as string).trim();
}

/** Carrega SÓ `.env.test` (se existir), sem sobrescrever variáveis já definidas. Nunca lê `.env`. */
export function loadTestEnvFile(): void {
  const file = path.join(ROOT, '.env.test');
  if (!fs.existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch {
    /* arquivo ilegível: segue só com o ambiente */
  }
}

/** `TEST_DATABASE_URL` (ambiente ou `.env.test`), sem validar; `null` se ausente. */
export function rawTestDatabaseUrl(): string | null {
  loadTestEnvFile();
  const url = process.env.TEST_DATABASE_URL;
  return url && url.trim() !== '' ? url.trim() : null;
}

/** Integração habilitada: `RUN_DB_TESTS=1` E `TEST_DATABASE_URL` definida. */
export const RUN_INTEGRATION = process.env.RUN_DB_TESTS === '1' && rawTestDatabaseUrl() !== null;

let warned = false;
/** Explica por que os testes de integração foram pulados (uma vez por processo). */
export function warnIfIntegrationSkipped(): void {
  if (RUN_INTEGRATION || warned || process.env.RUN_DB_TESTS !== '1') return;
  warned = true;
  console.warn(`[integração] PULADOS: RUN_DB_TESTS=1, mas TEST_DATABASE_URL não está definida.\n${TEST_DB_HELP}`);
}
warnIfIntegrationSkipped();

/** URL validada do banco de teste; lança se ausente ou se o banco não terminar em `_test`. */
export function testDatabaseUrl(): string {
  return assertTestDatabase(rawTestDatabaseUrl(), 'teste de integração (TEST_DATABASE_URL)');
}
