'use client';

import Link from 'next/link';
import { ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 text-center">
      <div className="space-y-4 max-w-md">
        <div className="text-6xl font-black text-purple-500">404</div>
        <h2 className="text-xl font-bold text-white">Página não encontrada</h2>
        <p className="text-xs text-slate-400">
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="min-h-10 px-4 rounded-control bg-gradient-to-r from-primary-from to-primary-to hover:brightness-110 text-white text-sm font-bold transition-all inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Home className="w-4 h-4" aria-hidden="true" /> Ir para o Início
          </Link>
        </div>
      </div>
    </div>
  );
}
