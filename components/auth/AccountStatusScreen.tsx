'use client';

import React from 'react';
import { Clock, LogOut, RefreshCw, ShieldOff } from 'lucide-react';
import type { User } from '@/types';
import { Button } from '@/components/ui/Button';

interface Props {
  user: User;
  onLogout: () => void;
  onRefresh: () => void;
}

/** Tela exibida para contas PENDENTE (aguardando aprovação) ou INATIVO. */
export const AccountStatusScreen: React.FC<Props> = ({ user, onLogout, onRefresh }) => {
  const pending = user.status === 'PENDENTE';

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center space-y-5 shadow-xl">
        <div
          className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center border ${
            pending
              ? 'bg-purple-950/60 border-purple-700/50 text-purple-300'
              : 'bg-rose-950/60 border-rose-700/50 text-rose-300'
          }`}
          aria-hidden="true"
        >
          {pending ? <Clock className="w-7 h-7" /> : <ShieldOff className="w-7 h-7" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">
            {pending ? 'Aguardando aprovação' : 'Conta desativada'}
          </h1>
          <p className="text-sm text-slate-400">
            {pending
              ? 'Seu acesso foi registrado. Um Gerente de Departamento ou a Presidência precisa aprovar sua conta e definir seu departamento.'
              : 'Sua conta foi desativada. Fale com o gerente do seu departamento ou com a Presidência.'}
          </p>
          <p className="text-xs text-slate-400">
            Conectado como <span className="font-semibold text-slate-300">{user.email}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {pending && (
            <Button size="sm" type="button" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" /> Verificar novamente
            </Button>
          )}
          <Button variant="secondary" size="sm" type="button" onClick={onLogout}>
            <LogOut className="w-4 h-4" aria-hidden="true" /> Sair
          </Button>
        </div>
      </div>
    </main>
  );
};
