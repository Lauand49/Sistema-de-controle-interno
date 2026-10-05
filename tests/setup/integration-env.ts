/**
 * Com `RUN_DB_TESTS=1`, fixa `DATABASE_URL` no banco de TESTE antes de qualquer módulo carregar o
 * Prisma (que também lê o `.env`). Assim nenhum teste consegue tocar o banco de desenvolvimento,
 * mesmo que importe `@/lib/prisma` ou faça `new PrismaClient()` sem argumentos.
 *
 * - Com `TEST_DATABASE_URL` válida (`*_test`): `DATABASE_URL` passa a apontar para ela.
 * - Sem ela: `DATABASE_URL` vira um destino inalcançável (os testes de integração são pulados).
 * - Com `TEST_DATABASE_URL` que não termina em `_test`: lança erro e a execução inteira falha.
 * Sem `RUN_DB_TESTS=1` este arquivo não faz nada.
 */
import { assertTestDatabase, rawTestDatabaseUrl } from '../support/assert-test-db';

if (process.env.RUN_DB_TESTS === '1') {
  const url = rawTestDatabaseUrl();
  if (url) {
    assertTestDatabase(url, 'RUN_DB_TESTS=1 (TEST_DATABASE_URL)');
    process.env.DATABASE_URL = url;
  } else {
    process.env.DATABASE_URL = 'postgresql://blocked:blocked@127.0.0.1:1/blocked_sem_test_database_url_test';
  }
  delete process.env.DATABASE_URL_TEST;
}
