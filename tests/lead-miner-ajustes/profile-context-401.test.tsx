// @vitest-environment jsdom
/**
 * ProfileProvider: sessão com cookie válido mas sem usuário no banco (/api/me = 401) não pode gerar o laço
 * "/ → /login → /" (o /login redireciona de volta quando vê a sessão). O provider encerra a sessão.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const nav = vi.hoisted(() => ({ replace: vi.fn(), pathname: '/' }));
const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => undefined) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
}));
vi.mock('next-auth/react', () => ({ signOut: auth.signOut }));
vi.mock('@/components/auth/AccountStatusScreen', () => ({ AccountStatusScreen: () => null }));

import { ProfileProvider } from '@/contexts/ProfileContext';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  nav.pathname = '/';
  nav.replace.mockClear();
  auth.signOut.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ProfileProvider com /api/me = 401', () => {
  it('encerra a sessão uma única vez (apaga o cookie) em vez de só redirecionar para /login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: 'Não autenticado.' })));
    render(
      <ProfileProvider>
        <p>conteúdo</p>
      </ProfileProvider>,
    );
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
    expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('no /login não consulta a sessão nem encerra nada', async () => {
    nav.pathname = '/login';
    const fetchMock = vi.fn(async () => json(401, {}));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ProfileProvider>
        <p>login</p>
      </ProfileProvider>,
    );
    expect(await screen.findByText('login')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('sessão válida: carrega o usuário e não encerra', async () => {
    const me = { id: 'u1', name: 'Ana', email: 'ana@scitecjr.com', status: 'ATIVO' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === '/api/me' ? json(200, me) : json(200, []))),
    );
    render(
      <ProfileProvider>
        <p>ok</p>
      </ProfileProvider>,
    );
    expect(await screen.findByText('ok')).toBeTruthy();
    await waitFor(() => expect(nav.replace).not.toHaveBeenCalled());
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
