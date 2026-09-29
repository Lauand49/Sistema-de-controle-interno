/**
 * Configuração do Auth.js compatível com o Edge Runtime (usada pelo middleware).
 * Não importe Prisma aqui. A lógica com banco fica em `auth.ts`.
 */
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

export const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'scitecjr.com')
  .trim()
  .toLowerCase();

/** Login de desenvolvimento: exige NODE_ENV=development E DEV_LOGIN=true. */
export const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV === 'development' && process.env.DEV_LOGIN === 'true';

export const DEV_LOGIN_PROVIDER_ID = 'dev-login';

/** Aceita somente `algo@<domínio permitido>` (sem subdomínios nem sufixos parecidos). */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[1] === ALLOWED_EMAIL_DOMAIN;
}

const providers: NextAuthConfig['providers'] = [
  Google({
    // AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET são lidos automaticamente do ambiente.
    authorization: {
      params: {
        // Dica para o Google mostrar apenas contas do Workspace. NÃO é segurança:
        // a verificação real acontece no callback signIn (auth.ts).
        hd: ALLOWED_EMAIL_DOMAIN,
        prompt: 'select_account',
      },
    },
  }),
];

if (DEV_LOGIN_ENABLED) {
  providers.push(
    Credentials({
      id: DEV_LOGIN_PROVIDER_ID,
      name: 'Login de desenvolvimento',
      credentials: { email: { label: 'E-mail', type: 'email' } },
      authorize(credentials) {
        const email = String(credentials?.email || '').trim().toLowerCase();
        if (!DEV_LOGIN_ENABLED || !isAllowedEmail(email)) return null;
        return { id: email, email, name: email.split('@')[0] };
      },
    })
  );
}

export const authConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/login', error: '/login' },
  providers,
  callbacks: {
    session({ session, token }) {
      if (session.user && typeof token.uid === 'string') {
        session.user.id = token.uid;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
