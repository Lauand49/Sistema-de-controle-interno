'use client';

import React, { useEffect } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 text-center">
      <div className="space-y-4 max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-rose-950/80 border border-rose-800/60 text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Ocorreu um erro inesperado</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          {error?.message || 'Houve uma falha temporária ao carregar a página.'}
        </p>
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all inline-flex items-center gap-2 shadow-lg shadow-purple-900/40"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Tentar Novamente
        </button>
      </div>
    </div>
  );
}
