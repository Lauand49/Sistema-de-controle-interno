'use client';

import React, { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { AlertTriangle, ArrowRight, Code2, LogIn, ShieldCheck, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface Props {
  callbackUrl: string;
  error: string | null;
  domain: string;
  devLoginEnabled: boolean;
  googleConfigured: boolean;
}

interface DevUser {
  email: string;
  name: string;
  title: string;
  status: string;
  avatar?: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  Dominio: 'Use uma conta Google do Workspace da SciTec jr.',
  EmailNaoVerificado: 'O e-mail da conta Google não está verificado.',
  ContaDesativada: 'Sua conta foi desativada. Fale com o seu gerente ou com a Presidência.',
  AccessDenied: 'Acesso negado para esta conta.',
  CredentialsSignin: 'Não foi possível entrar com este e-mail.',
  Configuration: 'O login não está configurado corretamente no servidor.',
};

export function LoginClient({ callbackUrl, error, domain, devLoginEnabled, googleConfigured }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);

  useEffect(() => {
    if (!devLoginEnabled) return;
    fetch('/api/dev/users')
      .then((r) => (r.ok ? r.json() : []))
      .then(setDevUsers)
      .catch(() => setDevUsers([]));
  }, [devLoginEnabled]);

  const errorMessage = error ? ERROR_MESSAGES[error] || 'Não foi possível entrar. Tente novamente.' : null;

  const handleGoogle = async () => {
    setSubmitting(true);
    await signIn('google', { callbackUrl });
  };

  const handleDevLogin = async (email: string) => {
    if (!email.trim()) return;
    setSubmitting(true);
    await signIn('dev-login', { email: email.trim().toLowerCase(), callbackUrl });
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 relative overflow-hidden selection:bg-purple-500 selection:text-white">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-700/50">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" /> Acesso ao Sistema Interno
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="w-12 h-12 rounded-2xl bg-purple-900/90 border border-purple-500/50 p-2 flex items-center justify-center shadow-lg shadow-purple-900/40">
              <img src="/brand/scitec-icon.png" alt="" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">SciTec jr.</h1>
          </div>
          <p className="text-sm text-slate-400">
            Entre com a sua conta <span className="font-semibold text-slate-200">@{domain}</span>.
          </p>
        </div>

        {errorMessage && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl border border-rose-700/50 bg-rose-950/40 text-rose-200 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4 shadow-xl">
          <Button size="md" type="button" onClick={handleGoogle} disabled={submitting || !googleConfigured} className="w-full">
            <LogIn className="w-4 h-4" aria-hidden="true" /> Entrar com Google
          </Button>
          {!googleConfigured && (
            <p className="text-[11px] text-amber-300/90 text-center">
              Login Google ainda não configurado (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            Novos acessos ficam pendentes até a aprovação de um gerente.
          </p>
        </div>

        {devLoginEnabled && (
          <section
            aria-labelledby="dev-login-title"
            className="rounded-2xl border border-amber-700/40 bg-amber-950/20 p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-amber-300" aria-hidden="true" />
              <h2 id="dev-login-title" className="text-sm font-bold text-amber-200">
                Login de desenvolvimento
              </h2>
            </div>
            <p className="text-[11px] text-amber-200/70">
              Disponível apenas com NODE_ENV=development e DEV_LOGIN=true. Qualquer e-mail @{domain} entra
              sem senha.
            </p>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleDevLogin(devEmail);
              }}
            >
              <label htmlFor="dev-email" className="sr-only">
                E-mail
              </label>
              <Input
                id="dev-email"
                type="email"
                required
                placeholder={`nome@${domain}`}
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                className="flex-1 placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-2 text-xs font-bold rounded-xl min-h-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50"
              >
                Entrar
              </button>
            </form>

            {devUsers.length > 0 && (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {devUsers.map((u) => (
                  <li key={u.email}>
                    <button
                      type="button"
                      onClick={() => handleDevLogin(u.email)}
                      disabled={submitting}
                      className="w-full text-left px-3 py-2 rounded-xl min-h-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 border border-slate-800 bg-slate-900/70 hover:border-amber-600/60 flex items-center justify-between gap-2 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-white truncate">{u.name}</span>
                        <span className="block text-[11px] text-slate-400 truncate">
                          {u.status === 'ATIVO' ? u.title : u.status} • {u.email}
                        </span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
