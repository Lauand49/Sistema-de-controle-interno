// @vitest-environment jsdom
/**
 * `MemberHeader` ("Conta desativada", aviso de setores — Req. 8.7, 8.10) e
 * `MemberSearchList` (busca sem caixa/acentos com rótulo programático — Req. 9.3, 11.7).
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemberHeader } from '@/components/dashboards/MemberHeader';
import { MemberSearchList } from '@/components/dashboards/MemberSearchList';
import type { MemberDashboardDTO } from '@/lib/dashboards/types';

afterEach(() => cleanup());

function member(status: MemberDashboardDTO['member']['status']): MemberDashboardDTO['member'] {
  return { id: 'u-9', name: 'Carla Dias', avatar: null, title: 'Assessora de Projetos', status };
}

describe('MemberHeader', () => {
  it('exibe nome, título, avatar e "Conta desativada" para INATIVO', () => {
    render(<MemberHeader member={member('INATIVO')} scope={{ kind: 'ALL' }} />);
    expect(screen.getByText('Carla Dias')).toBeTruthy();
    expect(screen.getByText('Assessora de Projetos')).toBeTruthy();
    expect(screen.getByAltText('Foto de Carla Dias')).toBeTruthy();
    expect(screen.getByText('Conta desativada')).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('ATIVO não mostra "Conta desativada"', () => {
    render(<MemberHeader member={member('ATIVO')} scope={{ kind: 'ALL' }} />);
    expect(screen.getByText('Ativo')).toBeTruthy();
    expect(screen.queryByText('Conta desativada')).toBeNull();
  });

  it('com escopo de setores mostra o aviso com os nomes', () => {
    render(
      <MemberHeader
        member={member('ATIVO')}
        scope={{
          kind: 'SECTORS',
          sectors: [
            { code: 'MKT', name: 'Marketing' },
            { code: 'VND', name: 'Vendas' },
          ],
        }}
      />,
    );
    expect(screen.getByRole('note').textContent).toBe('Exibindo apenas atividades dos setores: Marketing, Vendas');
  });
});

describe('MemberSearchList', () => {
  const members = [
    { id: 'a', name: 'José Ávila', avatar: null, title: 'Gerente' },
    { id: 'b', name: 'Mariana Lima', avatar: null, title: '' },
    { id: 'c', name: 'João Conceição', avatar: null, title: 'Assessor' },
  ];

  function names(): string[] {
    return screen.queryAllByRole('link').map((a) => a.textContent ?? '');
  }

  it('campo de busca tem o rótulo "Buscar membro" e lista todos com link', () => {
    render(<MemberSearchList members={members} />);
    expect((screen.getByLabelText('Buscar membro') as HTMLInputElement).type).toBe('search');
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/paineis/membros/a',
      '/paineis/membros/b',
      '/paineis/membros/c',
    ]);
  });

  it('filtra sem diferenciar maiúsculas, minúsculas e acentos', () => {
    render(<MemberSearchList members={members} />);
    const input = screen.getByLabelText('Buscar membro');

    fireEvent.change(input, { target: { value: 'JOSE AVILA' } });
    expect(names()).toEqual(['José ÁvilaGerente']);

    fireEvent.change(input, { target: { value: 'conceicao' } });
    expect(names()).toEqual(['João ConceiçãoAssessor']);

    fireEvent.change(input, { target: { value: 'jo' } });
    expect(names()).toHaveLength(2);

    fireEvent.change(input, { target: { value: 'Zé Ninguém' } });
    expect(names()).toEqual([]);
    expect(screen.getByText('Nenhum membro encontrado')).toBeTruthy();
  });

  it('lista vazia mostra o estado vazio', () => {
    render(<MemberSearchList members={[]} />);
    expect(screen.getByText('Nenhum membro para exibir')).toBeTruthy();
  });
});
