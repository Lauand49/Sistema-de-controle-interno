import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

/** Rotas acessíveis sem sessão. */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/dev/users' // responde 404 fora do modo de desenvolvimento
  );
}

/**
 * Primeira barreira: exige sessão válida em todas as páginas e APIs.
 * Status (PENDENTE/INATIVO) e permissões são verificados no servidor em cada rota,
 * consultando o banco a cada requisição (lib/api.ts → withAuth).
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (!req.auth?.user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.nextUrl.origin);
    if (pathname !== '/') loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)'],
};
