import { EnvConfigError, assertProductionEnv, formatEnvIssues } from './lib/env';

/**
 * Valida o ambiente de produção. Em caso de erro imprime a lista (sem valores) e encerra o processo
 * com código 1: o Cloud Run então mantém a revisão anterior em vez de servir uma versão quebrada.
 * Avisos (não fatais) só são registrados.
 */
export function enforceProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  try {
    const issues = assertProductionEnv(env);
    if (issues.length > 0) console.warn(formatEnvIssues(issues));
  } catch (e) {
    if (e instanceof EnvConfigError) {
      console.error(e.message);
      process.exit(1);
      return; // (só alcançável com process.exit simulado nos testes)
    }
    throw e;
  }
}
