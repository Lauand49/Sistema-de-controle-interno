import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ALLOWED_EMAIL_DOMAIN, DEV_LOGIN_ENABLED } from '@/auth.config';
import { findUserDTO } from '@/lib/users';
import { LoginClient } from './LoginClient';

export const dynamic = 'force-dynamic';

/** Aceita apenas caminhos internos (evita open redirect). */
function safeCallback(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/';
}

/**
 * O cookie sozinho não prova sessão utilizável: o cliente carrega o usuário via /api/me (banco). Se o usuário
 * não existe (banco recriado) ou o banco falhou, redirecionar para fora do /login faz o cliente voltar para cá
 * e o ciclo "/ → /login → /" nunca termina. Nesses casos mostramos o formulário.
 */
async function sessaoUtilizavel(userId: string): Promise<boolean> {
  try {
    return (await findUserDTO(userId)) !== null;
  } catch {
    return false;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const callbackUrl = safeCallback(searchParams.callbackUrl);
  const session = await auth();
  if (session?.user?.id && (await sessaoUtilizavel(session.user.id))) redirect(callbackUrl);

  const error = Array.isArray(searchParams.error) ? searchParams.error[0] : searchParams.error;

  return (
    <LoginClient
      callbackUrl={callbackUrl}
      error={error ?? null}
      domain={ALLOWED_EMAIL_DOMAIN}
      devLoginEnabled={DEV_LOGIN_ENABLED}
      googleConfigured={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
    />
  );
}
