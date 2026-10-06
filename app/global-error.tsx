'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-slate-100 flex items-center justify-center min-h-screen p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <h2 className="text-xl font-bold text-white">Falha Global na Aplicação</h2>
          <p className="text-xs text-slate-400">
            {error?.message || 'Ocorreu um erro crítico ao renderizar o layout.'}
          </p>
          <button
            onClick={() => reset()}
            className="min-h-10 px-5 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            Recarregar Aplicação
          </button>
        </div>
      </body>
    </html>
  );
}
