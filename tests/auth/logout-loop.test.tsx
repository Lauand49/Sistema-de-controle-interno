// @vitest-environment jsdom
/**
 * Laço de recarga ao deslogar: harness de ponta a ponta (sem rede e sem banco).
 *
 * Usa o que roda de verdade: middleware (JWT assinado), página /login (servidor), rota /api/me (withAuth),
 * ProfileProvider e AccountStatusScreen. Simulados: o banco de usuários, o cookie, o router do Next e o
 * `signOut` do next-auth (assíncrono: só apaga o cookie e navega depois de um tempo, como o POST real).
 *
 * Causa-raiz: cliente e servidor discordam sobre "estar logado". O servidor decide pelo COOKIE (middleware
 * e /login); o cliente decide pelo /api/me. Quando o cliente acha que não há sessão e manda para /login
 * enquanto o cookie ainda é válido (logout em andamento, usuário sem registro, banco fora do ar), o /login
 * devolve o usuário para o callbackUrl e o ciclo se repete. Métrica: `bounces` = navegações do cliente
 * para /login que o servidor devolveu para outra página.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { cabecalhos, definirSegredoDeTeste, jwtDeSessao } from './support/session-cookie';

definirSegredoDeTeste();

type Cookie = null | { uid: string } | 'LIXO';
interface Usuario {
  id: string;
  name: string;
  email: string;
  status: 'ATIVO' | 'PENDENTE' | 'INATIVO';
}

const w = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const s = {
    cookie: null as null | { uid: string } | 'LIXO',
    users: {} as Record<string, { id: string; name: string; email: string; status: string }>,
    dbFora: false,
    path: '/',
    bootId: 0,
    /** Redirecionamentos do servidor + navegações `replace` do cliente. */
    hops: 0,
    softNavs: 0,
    bounces: 0,
    overflow: false,
    signOutCalls: [] as unknown[],
    signOutFalha: false,
    fetchLog: [] as string[],
    replaceLog: [] as string[],
    soft: (_url: string): Promise<void> => Promise.resolve(),
    signOut: (_opts: { callbackUrl: string }): Promise<void> => Promise.resolve(),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify: () => listeners.forEach((fn) => fn()),
  };
  return s;
});

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', async () => {
  const React = await import('react');
  // Identidade estável, como no Next (o ProfileProvider usa o router nas dependências do efeito).
  const router = { replace: (url: string) => w.soft(url), push: (url: string) => w.soft(url) };
  return {
    useRouter: () => router,
    usePathname: () => {
      const full = React.useSyncExternalStore(w.subscribe, () => w.path);
      return full.split('?')[0];
    },
    redirect: (url: string) => {
      throw Object.assign(new Error('NEXT_REDIRECT'), { redirectTo: url });
    },
  };
});
vi.mock('next-auth/react', () => ({ signOut: (opts: { callbackUrl: string }) => w.signOut(opts) }));
vi.mock('@/auth', () => ({
  auth: async () => (w.cookie && w.cookie !== 'LIXO' ? { user: { id: w.cookie.uid } } : null),
}));
vi.mock('@/lib/users', () => ({
  findUserDTO: async (id: string) => {
    if (w.dbFora) throw new Error('banco indisponível');
    return w.users[id] ?? null;
  },
}));
vi.mock('@/app/login/LoginClient', () => ({ LoginClient: () => null }));

import { ProfileProvider, useProfile } from '@/contexts/ProfileContext';
import LoginPage from '@/app/login/page';
import { GET as getMe } from '@/app/api/me/route';

type Mw = (req: NextRequest, ev: unknown) => Promise<Response>;
let mw: Mw;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cookieJwt(): Promise<string | null> {
  if (w.cookie === 'LIXO') return 'lixo';
  return w.cookie ? jwtDeSessao(w.cookie.uid) : null;
}

/** Resposta do middleware real para `path`. */
async function middleware(path: string): Promise<Response> {
  const req = new NextRequest(`http://localhost:3000${path}`, { headers: cabecalhos(await cookieJwt()) });
  return mw(req, {});
}

/**
 * Resolve a cadeia de redirecionamentos do servidor para `path` e devolve a URL final.
 * `/login` executa a página REAL (que pode redirecionar para o callbackUrl).
 */
async function resolverNoServidor(path: string): Promise<string> {
  let atual = path;
  for (let i = 0; i < 10; i++) {
    const res = await middleware(atual);
    const loc = res.headers.get('location');
    if (loc) {
      w.hops++;
      const u = new URL(loc);
      atual = `${u.pathname}${u.search}`;
      continue;
    }
    if (atual.split('?')[0] === '/login') {
      const params = Object.fromEntries(new URL(`http://x${atual}`).searchParams);
      try {
        await LoginPage({ searchParams: params });
      } catch (e) {
        const destino = (e as { redirectTo?: string }).redirectTo;
        if (!destino) throw e;
        w.hops++;
        atual = destino;
        continue;
      }
    }
    return atual;
  }
  w.overflow = true;
  return atual;
}

/** router.replace/push do cliente (navegação suave). */
w.soft = async (url: string) => {
  w.softNavs++;
  w.replaceLog.push(url);
  if (w.softNavs > 20) {
    w.overflow = true; // corta o laço para o teste falhar em vez de travar
    return;
  }
  w.hops++;
  const final = await resolverNoServidor(url);
  if (url.split('?')[0] === '/login' && final.split('?')[0] !== '/login') w.bounces++;
  w.path = final;
  w.notify();
};

/** Navegação dura (carregar a URL do zero): remonta a árvore e zera o estado do cliente. */
async function carregar(url: string) {
  w.path = await resolverNoServidor(url);
  w.bootId++;
  w.notify();
}

/** signOut do next-auth: POST demorado, apaga o cookie e navega com window.location (carga dura). */
w.signOut = async (opts) => {
  w.signOutCalls.push(opts);
  await dormir(60);
  if (w.signOutFalha) throw new Error('rede');
  w.cookie = null;
  await carregar(opts.callbackUrl);
};

/** fetch do navegador: passa pelo middleware real e, se permitido, pela rota de verdade. */
async function fetchDoNavegador(url: string): Promise<Response> {
  const path = String(url);
  w.fetchLog.push(path);
  const mwRes = await middleware(path);
  if (mwRes.status === 401) return mwRes;
  if (path === '/api/dev/users') return json(404, {});
  if (path === '/api/me') return getMe(new Request('http://localhost:3000/api/me'), { params: {} as never });
  if (path === '/api/users') {
    const r = await getMe(new Request('http://localhost:3000/api/me'), { params: {} as never });
    const me = await r.json();
    return me.status === 'ATIVO' ? json(200, []) : json(403, { error: 'Conta não ativa.' });
  }
  return json(404, {});
}

function Pagina() {
  const { currentProfile, logout, refreshMe, loading } = useProfile();
  const path = (React.useSyncExternalStore(w.subscribe, () => w.path) as string).split('?')[0];
  if (path === '/login') return <p>tela-de-login</p>;
  return (
    <div>
      <p>{loading ? 'carregando' : `pagina:${path}:${currentProfile?.email ?? 'sem-perfil'}`}</p>
      <button onClick={() => logout()}>sair-do-app</button>
      <button onClick={() => refreshMe()}>atualizar</button>
    </div>
  );
}

function Raiz() {
  const boot = React.useSyncExternalStore(w.subscribe, () => w.bootId);
  return (
    <ProfileProvider key={boot}>
      <Pagina />
    </ProfileProvider>
  );
}

function usuario(id: string, status: Usuario['status']): Usuario {
  return { id, name: id, email: `${id}@scitecjr.com`, status };
}

async function abrir(path: string) {
  await carregar(path);
  render(<Raiz />);
}

beforeAll(async () => {
  mw = (await import('@/middleware')).default as unknown as Mw;
});

beforeEach(() => {
  Object.assign(w, {
    cookie: null,
    users: {},
    dbFora: false,
    path: '/',
    bootId: 0,
    hops: 0,
    softNavs: 0,
    bounces: 0,
    overflow: false,
    signOutCalls: [],
    signOutFalha: false,
    fetchLog: [],
    replaceLog: [],
  });
  vi.stubGlobal('fetch', vi.fn((url: string) => fetchDoNavegador(url)));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const semLaco = () => {
  expect(w.overflow, 'laço de redirecionamentos detectado').toBe(false);
  expect(w.bounces, 'cliente mandou para /login e o servidor devolveu').toBe(0);
  expect(w.hops).toBeLessThanOrEqual(2);
};

describe('sem sessão', () => {
  it.each([
    ['anônimo', null],
    ['cookie lixo/expirado', 'LIXO' as const],
  ])('%s: "/" vai para /login em 1 salto e a tela de login não chama API protegida', async (_n, cookie) => {
    w.cookie = cookie;
    await abrir('/');
    expect(await screen.findByText('tela-de-login')).toBeTruthy();
    expect(w.path).toBe('/login');
    expect(w.hops).toBe(1);
    expect(w.fetchLog).toEqual([]);
    expect(w.signOutCalls).toEqual([]);
    semLaco();
  });

  it('a tela de login só pode chamar /api/dev/users (modo desenvolvimento)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/login/LoginClient.tsx', 'utf8');
    const chamadas = [...src.matchAll(/fetch\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
    expect(chamadas.every((c) => c === '/api/dev/users')).toBe(true);
  });
});

describe('sessão de usuário existente', () => {
  it('ATIVO: carrega perfil e diretório, sem navegar', async () => {
    w.users.u1 = usuario('u1', 'ATIVO');
    w.cookie = { uid: 'u1' };
    await abrir('/');
    expect(await screen.findByText('pagina:/:u1@scitecjr.com')).toBeTruthy();
    expect(w.fetchLog).toEqual(['/api/me', '/api/users']);
    expect(w.softNavs).toBe(0);
    semLaco();
  });

  it('ATIVO abrindo /login: 1 salto do servidor para "/" e sem laço', async () => {
    w.users.u1 = usuario('u1', 'ATIVO');
    w.cookie = { uid: 'u1' };
    await abrir('/login');
    expect(await screen.findByText('pagina:/:u1@scitecjr.com')).toBeTruthy();
    expect(w.hops).toBe(1);
    semLaco();
  });

  it.each(['PENDENTE', 'INATIVO'] as const)(
    '%s: mostra a tela de status, não chama /api/users nem navega; "Sair" encerra a sessão sem passar por /login',
    async (status) => {
      w.users.u1 = usuario('u1', status);
      w.cookie = { uid: 'u1' };
      await abrir('/');
      const sair = await screen.findByRole('button', { name: /Sair/ });
      expect(w.fetchLog).toEqual(['/api/me']);
      expect(w.softNavs).toBe(0);

      fireEvent.click(sair);
      await waitFor(() => expect(w.path).toBe('/login'));
      expect(await screen.findByText('tela-de-login')).toBeTruthy();
      expect(w.cookie).toBeNull();
      expect(w.signOutCalls).toEqual([{ callbackUrl: '/login' }]);
      expect(w.softNavs).toBe(0);
      semLaco();
    },
  );

  it('ATIVO clica em sair: só o signOut navega (nenhum replace para /login com o cookie ainda válido)', async () => {
    w.users.u1 = usuario('u1', 'ATIVO');
    w.cookie = { uid: 'u1' };
    await abrir('/');
    await screen.findByText('pagina:/:u1@scitecjr.com'); // perfil já carregado (loading=false)
    fireEvent.click(screen.getByRole('button', { name: 'sair-do-app' }));
    await waitFor(() => expect(w.path).toBe('/login'));
    expect(w.signOutCalls).toEqual([{ callbackUrl: '/login' }]);
    expect(w.replaceLog).toEqual([]);
    expect(w.cookie).toBeNull();
    semLaco();
  });

  it('logout que falha (rede): libera nova tentativa em vez de travar', async () => {
    w.users.u1 = usuario('u1', 'ATIVO');
    w.cookie = { uid: 'u1' };
    await abrir('/');
    await screen.findByText('pagina:/:u1@scitecjr.com');
    const botao = screen.getByRole('button', { name: 'sair-do-app' });
    w.signOutFalha = true;
    await act(async () => {
      fireEvent.click(botao);
      await dormir(120);
    });
    w.signOutFalha = false;
    fireEvent.click(botao);
    await waitFor(() => expect(w.path).toBe('/login'));
    expect(w.signOutCalls).toHaveLength(2);
  });
});

describe('cookie válido, mas o cliente não consegue carregar o usuário', () => {
  it('usuário sem registro no banco (/api/me 401): encerra a sessão UMA vez e termina em /login', async () => {
    w.cookie = { uid: 'fantasma' };
    await abrir('/');
    await waitFor(() => expect(w.path).toBe('/login'));
    // Vários pedidos de atualização concorrentes não podem disparar vários signOut.
    expect(w.signOutCalls).toEqual([{ callbackUrl: '/login' }]);
    expect(w.replaceLog).toEqual([]);
    expect(w.cookie).toBeNull();
    expect(w.fetchLog).toEqual(['/api/me']);
    semLaco();
  });

  it('refreshMe repetido com 401 não dispara signOut duas vezes', async () => {
    w.cookie = { uid: 'fantasma' };
    await abrir('/');
    const atualizar = await screen.findByRole('button', { name: 'atualizar' }).catch(() => null);
    if (atualizar) {
      fireEvent.click(atualizar);
      fireEvent.click(atualizar);
    }
    await waitFor(() => expect(w.path).toBe('/login'));
    expect(w.signOutCalls).toHaveLength(1);
  });

  it('banco fora do ar (/api/me 500): não há ida e volta /login ↔ "/"; o usuário vê a tela de login', async () => {
    w.users.u1 = usuario('u1', 'ATIVO');
    w.cookie = { uid: 'u1' };
    w.dbFora = true;
    await abrir('/');
    await waitFor(() => expect(w.path).toBe('/login'));
    expect(await screen.findByText('tela-de-login')).toBeTruthy();
    expect(w.signOutCalls).toEqual([]);
    semLaco();
  });

  it('/login com cookie de usuário inexistente mostra o formulário (não redireciona para o callbackUrl)', async () => {
    w.cookie = { uid: 'fantasma' };
    await carregar('/login?callbackUrl=%2Fpipe');
    expect(w.path).toBe('/login?callbackUrl=%2Fpipe');
    expect(w.hops).toBe(0);
  });
});
