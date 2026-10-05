/**
 * Middleware REAL (next-auth + JWT assinado) para páginas e APIs, sem sessão / sessão inválida / expirada / válida.
 * O middleware só olha o cookie: não consulta o banco (status e permissões ficam nas rotas, via withAuth).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { cabecalhos, definirSegredoDeTeste, jwtDeSessao } from './support/session-cookie';

definirSegredoDeTeste();

type Mw = (req: NextRequest, ev: unknown) => Promise<Response>;
let mw: Mw;

async function chamar(path: string, cookieJwt?: string | null) {
  const res = await mw(new NextRequest(`http://localhost:3000${path}`, { headers: cabecalhos(cookieJwt) }), {});
  return {
    status: res.status,
    location: res.headers.get('location'),
    passa: res.headers.get('x-middleware-next') === '1',
    corpo: res.status === 401 ? await res.json() : null,
  };
}

beforeAll(async () => {
  // O Auth.js registra no console o cookie lixo/expirado (comportamento esperado aqui).
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mw = (await import('@/middleware')).default as unknown as Mw;
});

afterAll(() => vi.restoreAllMocks());

describe('middleware real', () => {
  it('sem cookie: páginas redirecionam para /login (com callbackUrl fora da raiz); APIs respondem 401 JSON', async () => {
    const raiz = await chamar('/');
    expect(raiz.status).toBe(307);
    expect(raiz.location).toBe('http://localhost:3000/login');

    const pipe = await chamar('/pipe?x=1');
    expect(pipe.location).toBe('http://localhost:3000/login?callbackUrl=%2Fpipe%3Fx%3D1');

    const api = await chamar('/api/me');
    expect(api.status).toBe(401);
    expect(api.location).toBeNull();
    expect(api.corpo).toEqual({ error: 'Não autenticado.' });
  });

  it.each([
    ['/login'],
    ['/login?callbackUrl=%2Fpipe'],
    ['/api/auth/session'],
    ['/api/auth/signout'],
    ['/api/dev/users'],
  ])('rota pública %s passa sem sessão (e não redireciona para si mesma)', async (path) => {
    const r = await chamar(path);
    expect(r.passa).toBe(true);
    expect(r.location).toBeNull();
  });

  it('cookie lixo ou expirado equivale a não autenticado (nunca gera laço)', async () => {
    const expirado = await jwtDeSessao('u1', -60);
    for (const cookie of ['lixo', expirado]) {
      const pagina = await chamar('/', cookie);
      expect(pagina.location).toBe('http://localhost:3000/login');
      expect((await chamar('/api/me', cookie)).status).toBe(401);
    }
  });

  it('cookie válido passa em páginas e APIs (o status PENDENTE/INATIVO é tratado nas rotas, não aqui)', async () => {
    const valido = await jwtDeSessao('u1');
    for (const path of ['/', '/pipe', '/api/me', '/api/users']) {
      const r = await chamar(path, valido);
      expect(r.passa, path).toBe(true);
    }
  });

  it('cookie válido em /login passa: quem decide o redirecionamento é a página /login (servidor)', async () => {
    const r = await chamar('/login', await jwtDeSessao('u1'));
    expect(r.passa).toBe(true);
    expect(r.location).toBeNull();
  });
});
