import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // O tsconfig do Next usa `jsx: preserve`; nos testes de componentes o JSX é transformado aqui.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    // Padrão `node`; testes de componentes declaram `// @vitest-environment jsdom` no arquivo.
    environment: 'node',
    // Apenas arquivos *.test.ts(x): os scripts antigos (tests/lead-tools-test.ts,
    // tests/phase-gate-test.ts) ficam de fora.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup/no-network.ts'],
  },
});
