/**
 * Cookie de sessão do Auth.js para testes do middleware real (sem rede e sem banco).
 * A chave vem de AUTH_SECRET, definida ANTES de importar `@/middleware` (ver `definirSegredoDeTeste`).
 */
import { encode } from 'next-auth/jwt';

export const COOKIE_DE_SESSAO = 'authjs.session-token'; // http (sem prefixo __Secure-)
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';

export function definirSegredoDeTeste(): void {
  process.env.AUTH_SECRET = SEGREDO;
}

/** JWT de sessão válido para o usuário `uid` (maxAge negativo gera um token já expirado). */
export async function jwtDeSessao(uid: string, maxAgeSegundos = 3600): Promise<string> {
  return encode({
    token: { uid, sub: uid, email: `${uid}@scitecjr.com` },
    secret: SEGREDO,
    salt: COOKIE_DE_SESSAO,
    maxAge: maxAgeSegundos,
  });
}

/**
 * Cabeçalhos mínimos de uma requisição real do Next (o Auth.js monta a URL da sessão a partir de `host`).
 * Sem `host`, o middleware trata qualquer cookie como inválido e o teste passaria por engano.
 */
export function cabecalhos(cookieJwt?: string | null): Record<string, string> {
  const h: Record<string, string> = { host: 'localhost:3000', 'x-forwarded-proto': 'http' };
  if (cookieJwt) h.cookie = `${COOKIE_DE_SESSAO}=${cookieJwt}`;
  return h;
}
