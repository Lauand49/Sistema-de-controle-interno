/**
 * Trava do seed (`npm run db:seed` / `db:setup`), que APAGA usuários, funis, tarefas, leads etc.
 *
 * O seed existe para popular o banco de desenvolvimento, então aqui a regra é: banco `*_test`
 * passa direto; qualquer outro exige `SEED_CONFIRM_DB=<nome exato do banco>`. Nunca em produção.
 * Lê a URL de `DATABASE_URL` (ambiente ou `.env`, carregado só para obter o nome do banco).
 */
import path from 'node:path';

export function databaseName(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const name = decodeURIComponent(new URL(url.trim()).pathname.replace(/^\/+/, ''));
    return name === '' ? null : name;
  } catch {
    return null;
  }
}

/** Decisão pura (testável): devolve `null` se pode rodar, ou o motivo da recusa. */
export function seedRefusal(input: { url: string | undefined; confirm: string | undefined; nodeEnv: string | undefined }): string | null {
  if (input.nodeEnv === 'production') return 'o seed apaga dados e não pode rodar com NODE_ENV=production.';
  const name = databaseName(input.url);
  if (name === null) return 'não foi possível identificar o nome do banco em DATABASE_URL.';
  if (name.endsWith('_test')) return null;
  if (input.confirm === name) return null;
  return `o banco "${name}" não termina em "_test". O seed APAGA dados; para confirmar que é este banco, rode com SEED_CONFIRM_DB=${name}.`;
}

export function assertSeedTarget(): void {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(path.join(process.cwd(), '.env'));
    } catch {
      /* sem .env */
    }
  }
  const refusal = seedRefusal({
    url: process.env.DATABASE_URL,
    confirm: process.env.SEED_CONFIRM_DB,
    nodeEnv: process.env.NODE_ENV,
  });
  if (refusal) {
    console.error(`[seed] Recusado: ${refusal}`);
    process.exit(1);
  }
}
