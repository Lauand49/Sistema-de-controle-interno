import NextAuth from 'next-auth';
import { prisma } from '@/lib/prisma';
import { isAdminEmail, syncUserOnLogin } from '@/lib/users';
import {
  ALLOWED_EMAIL_DOMAIN,
  DEV_LOGIN_ENABLED,
  DEV_LOGIN_PROVIDER_ID,
  authConfig,
  isAllowedEmail,
} from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account, profile }) {
      const email = user.email?.trim().toLowerCase();
      if (!email || !isAllowedEmail(email)) return '/login?error=Dominio';

      if (account?.provider === 'google') {
        // Verificação no servidor: e-mail verificado + conta do Workspace do domínio.
        if (profile?.email_verified !== true) return '/login?error=EmailNaoVerificado';
        if (String(profile?.hd || '').toLowerCase() !== ALLOWED_EMAIL_DOMAIN) {
          return '/login?error=Dominio';
        }
      } else if (account?.provider === DEV_LOGIN_PROVIDER_ID) {
        if (!DEV_LOGIN_ENABLED) return false;
      } else {
        return false;
      }

      const existing = await prisma.user.findUnique({ where: { email }, select: { status: true } });
      if (existing?.status === 'INATIVO' && !isAdminEmail(email)) {
        return '/login?error=ContaDesativada';
      }
      return true;
    },

    async jwt({ token, user, trigger }) {
      if (trigger === 'signIn' && user?.email) {
        const dbUser = await syncUserOnLogin({
          email: user.email,
          name: user.name,
          image: user.image,
        });
        token.uid = dbUser.id;
      }
      return token;
    },
  },
});
