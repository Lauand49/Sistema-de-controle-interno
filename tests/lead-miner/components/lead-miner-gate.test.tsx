// @vitest-environment jsdom
/**
 * `LeadMinerGate` (Req. 19.4): sem `canUseNegociosTools` mostra "Acesso negado" e não monta os
 * filhos — portanto nenhuma requisição às rotas do minerador.
 */
import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Person } from '@/lib/permissions';

const profileState: { currentProfile: Person | null; loading: boolean } = { currentProfile: null, loading: false };

vi.mock('@/contexts/ProfileContext', () => ({
  useProfile: () => profileState,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { LEAD_MINER_ACCESS_DENIED, LeadMinerGate } from '@/components/lead-miner/LeadMinerGate';

function person(over: Partial<Person> = {}): Person {
  return {
    id: 'u1',
    status: 'ATIVO',
    globalRole: null,
    departmentCode: 'NEGOCIOS',
    departmentRole: 'ASSESSOR',
    sectors: [],
    ...over,
  } as Person;
}

/** Filho que dispara uma requisição ao montar, como as telas do minerador. */
function FetchingChild() {
  useEffect(() => {
    void fetch('/api/tools/lead-miner/config');
  }, []);
  return <p>conteúdo do minerador</p>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LeadMinerGate', () => {
  it('sem permissão: mostra acesso negado e não dispara fetch', () => {
    profileState.loading = false;
    profileState.currentProfile = person({ departmentCode: 'PROJETOS' as Person['departmentCode'] });
    render(
      <LeadMinerGate>
        <FetchingChild />
      </LeadMinerGate>,
    );
    expect(screen.getByRole('alert').textContent).toContain(LEAD_MINER_ACCESS_DENIED);
    expect(screen.queryByText('conteúdo do minerador')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem sessão (perfil nulo) também bloqueia sem fetch', () => {
    profileState.loading = false;
    profileState.currentProfile = null;
    render(
      <LeadMinerGate>
        <FetchingChild />
      </LeadMinerGate>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('carregando: mostra skeleton e não monta os filhos', () => {
    profileState.loading = true;
    profileState.currentProfile = null;
    render(
      <LeadMinerGate>
        <FetchingChild />
      </LeadMinerGate>,
    );
    expect(screen.getByRole('status')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com permissão (Negócios ativo): monta os filhos', () => {
    profileState.loading = false;
    profileState.currentProfile = person();
    render(
      <LeadMinerGate>
        <FetchingChild />
      </LeadMinerGate>,
    );
    expect(screen.getByText('conteúdo do minerador')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
