/**
 * Gancho de inicialização do Next.js (Etapa 4, D2): valida as variáveis de produção uma vez, quando
 * o servidor sobe. Não roda no `next build` nem fora do runtime Node.js.
 * Next 14: exige `experimental.instrumentationHook` em next.config.js.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // O build também avalia módulos com NODE_ENV=production, mas sem as variáveis de produção.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { enforceProductionEnv } = await import('./instrumentation-node');
  enforceProductionEnv();
}
