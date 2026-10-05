// @vitest-environment jsdom
/**
 * T3 — resultados progressivos: helpers, polling (~3 s) com `useLiveRun`, selo "analisando…",
 * contadores ao vivo e ordenação por mais recentes durante a execução.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ getRun: vi.fn() }));
vi.mock('@/lib/leads/client-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/leads/client-api')>();
  return { ...actual, leadMinerApi: { ...actual.leadMinerApi, ...api } };
});
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import type { CompanyRow, RunDetail } from '@/lib/leads/client-api';
import { useLiveRun } from '@/hooks/lead-miner/useLiveRun';
import { LiveRunPanel } from '@/components/lead-miner/LiveRunPanel';
import { RankingTable } from '@/components/lead-miner/RankingTable';
import {
  LIVE_POLL_MS,
  buildTabbedRankingRequest,
  isAnalyzing,
  isRunLive,
  liveCounters,
} from '@/components/lead-miner/ranking-helpers';
import { companyFiltersSchema, rankingOrderFor, RANKING_ORDER } from '@/lib/leads/filters';

const run = (over: Partial<RunDetail> = {}): RunDetail =>
  ({
    id: 'r1',
    status: 'EM_ANDAMENTO',
    processados: 4,
    total: 10,
    novos: 7,
    existentes: 3,
    comContato: 6,
    errorMessage: null,
    nichosFalhos: [],
    iaDisabledReason: null,
    bairro: 'Centro',
    cidade: 'Santos',
    uf: 'SP',
    createdAt: '2026-10-20T12:00:00Z',
    finishedAt: null,
    ...over,
  }) as RunDetail;

const row = (over: Partial<CompanyRow> = {}): CompanyRow =>
  ({
    id: 'c1',
    nome: 'Clínica Sorriso',
    nomeOrigem: 'PROPRIO',
    googleFields: [],
    googlePlaceId: null,
    nicho: 'clinica_odontologica',
    bairro: 'Centro',
    cidade: 'Santos',
    uf: 'SP',
    telefone: null,
    website: null,
    categoria: null,
    scoreFinal: null,
    prioridade: null,
    hasSite: null,
    isHttps: null,
    fonte: 'OSM',
    lastAnalyzedAt: null,
    latitude: null,
    longitude: null,
    temInstagram: null,
    temWhatsapp: null,
    temContato: false,
    contatoWhatsapp: false,
    contatoInstagram: false,
    contatoEmail: false,
    cnpjFormatado: null,
    situacaoCadastral: null,
    desempenhoRuim: null,
    assignedUser: null,
    prospectLead: null,
    ...over,
  }) as CompanyRow;

beforeEach(() => {
  vi.useFakeTimers();
  api.getRun.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('helpers', () => {
  it('isRunLive só para PENDENTE e EM_ANDAMENTO', () => {
    expect(isRunLive('PENDENTE')).toBe(true);
    expect(isRunLive('EM_ANDAMENTO')).toBe(true);
    for (const s of ['CONCLUIDA', 'ERRO', 'CANCELADA', null, undefined]) expect(isRunLive(s)).toBe(false);
  });

  it('polling é de ~3 s', () => {
    expect(LIVE_POLL_MS).toBe(3000);
  });

  it('isAnalyzing: só ao vivo e sem análise nem score anterior', () => {
    expect(isAnalyzing({ lastAnalyzedAt: null, scoreFinal: null }, true)).toBe(true);
    expect(isAnalyzing({ lastAnalyzedAt: null, scoreFinal: null }, false)).toBe(false);
    expect(isAnalyzing({ lastAnalyzedAt: '2026-10-01T00:00:00Z', scoreFinal: 70 }, true)).toBe(false);
  });

  it('liveCounters: encontradas = novas + existentes; total oculto durante a descoberta', () => {
    expect(liveCounters(run())).toEqual({ encontradas: 10, comContato: 6, analisadas: 4, total: 10 });
    expect(liveCounters(run({ status: 'PENDENTE', total: 0, comContato: undefined }))).toEqual({
      encontradas: 10,
      comContato: 0,
      analisadas: 4,
      total: null,
    });
  });

  it('a requisição pede "recentes" só ao vivo; ao concluir volta ao score', () => {
    expect(buildTabbedRankingRequest({}, { live: true }).query.get('ordem')).toBe('recentes');
    expect(buildTabbedRankingRequest({}, { live: false }).query.get('ordem')).toBeNull();
    expect(buildTabbedRankingRequest({}).query.get('ordem')).toBeNull();
  });

  it('o servidor aceita score/recentes, rejeita outro valor e ordena de acordo', () => {
    expect(companyFiltersSchema.parse({ ordem: 'recentes' }).ordem).toBe('recentes');
    expect(companyFiltersSchema.parse({ ordem: '' }).ordem).toBeUndefined();
    expect(companyFiltersSchema.safeParse({ ordem: 'nome' }).success).toBe(false);
    expect(rankingOrderFor(undefined)).toBe(RANKING_ORDER);
    expect(rankingOrderFor('score')).toBe(RANKING_ORDER);
    expect(rankingOrderFor('recentes')[0]).toEqual({ updatedAt: 'desc' });
  });
});

describe('useLiveRun', () => {
  it('sem runId não consulta nada', async () => {
    const { result } = renderHook(() => useLiveRun(undefined));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getRun).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ run: null, live: false, tick: 0 });
  });

  it('consulta de imediato e a cada 3 s enquanto roda; para ao concluir', async () => {
    api.getRun
      .mockResolvedValueOnce(run({ processados: 0 }))
      .mockResolvedValueOnce(run({ processados: 5 }))
      .mockResolvedValueOnce(run({ status: 'CONCLUIDA', processados: 10 }))
      .mockResolvedValue(run({ status: 'CONCLUIDA', processados: 10 }));

    const { result } = renderHook(() => useLiveRun('r1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getRun).toHaveBeenCalledTimes(1);
    expect(result.current.live).toBe(true);
    expect(result.current.tick).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS - 100);
    });
    expect(api.getRun).toHaveBeenCalledTimes(1); // ainda não deu 3 s

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(api.getRun).toHaveBeenCalledTimes(2);
    expect(result.current.run?.processados).toBe(5);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    });
    expect(api.getRun).toHaveBeenCalledTimes(3);
    expect(result.current.live).toBe(false);
    expect(result.current.tick).toBe(3); // a última resposta ainda dispara a atualização final da lista

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 5);
    });
    expect(api.getRun).toHaveBeenCalledTimes(3); // parou de consultar
  });

  it('mineração já concluída: uma consulta só', async () => {
    api.getRun.mockResolvedValue(run({ status: 'CONCLUIDA' }));
    const { result } = renderHook(() => useLiveRun('r1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 3);
    });
    expect(api.getRun).toHaveBeenCalledTimes(1);
    expect(result.current.live).toBe(false);
  });

  it('cancelada deixa de ser "ao vivo"', async () => {
    api.getRun.mockResolvedValue(run({ status: 'CANCELADA' }));
    const { result } = renderHook(() => useLiveRun('r1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.live).toBe(false);
  });

  it('erro na primeira consulta: expõe a mensagem e não fica repetindo', async () => {
    api.getRun.mockRejectedValue(new Error('Mineração não encontrada.'));
    const { result } = renderHook(() => useLiveRun('r1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 3);
    });
    expect(result.current.error).toBe('Mineração não encontrada.');
    expect(api.getRun).toHaveBeenCalledTimes(1);
  });

  it('falha isolada no meio do acompanhamento mantém o último estado e tenta de novo', async () => {
    api.getRun
      .mockResolvedValueOnce(run())
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValue(run({ processados: 9 }));
    const { result } = renderHook(() => useLiveRun('r1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.run?.processados).toBe(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    });
    expect(result.current.run?.processados).toBe(9);
  });

  it('aba oculta não consulta; ao voltar, retoma', async () => {
    api.getRun.mockResolvedValue(run());
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    renderHook(() => useLiveRun('r1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getRun).toHaveBeenCalledTimes(1); // a primeira sempre acontece
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 3);
    });
    expect(api.getRun).toHaveBeenCalledTimes(1);
    hidden.mockReturnValue(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    });
    expect(api.getRun).toHaveBeenCalledTimes(2);
    hidden.mockRestore();
  });

  it('desmontar cancela o polling', async () => {
    api.getRun.mockResolvedValue(run());
    const { unmount } = renderHook(() => useLiveRun('r1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 4);
    });
    expect(api.getRun).toHaveBeenCalledTimes(1);
  });
});

describe('LiveRunPanel', () => {
  it('mostra encontradas, com contato e analisadas (de N)', () => {
    render(<LiveRunPanel run={run()} live />);
    expect(screen.getByTestId('live-encontradas').textContent).toBe('10');
    expect(screen.getByTestId('live-com-contato').textContent).toBe('6');
    expect(screen.getByTestId('live-analisadas').textContent).toBe('4 de 10');
    expect(screen.getByRole('status').textContent).toMatch(/Analisando/);
  });

  it('durante a descoberta não mostra o total a analisar', () => {
    render(<LiveRunPanel run={run({ status: 'PENDENTE', total: 0 })} live />);
    expect(screen.getByTestId('live-analisadas').textContent).toBe('4');
    expect(screen.getByRole('status').textContent).toMatch(/Buscando/);
  });

  it('ao terminar, avisa o estado final', () => {
    const { rerender } = render(<LiveRunPanel run={run({ status: 'CONCLUIDA' })} live={false} />);
    expect(screen.getByRole('status').textContent).toBe('Mineração concluída.');
    rerender(<LiveRunPanel run={run({ status: 'CANCELADA' })} live={false} />);
    expect(screen.getByRole('status').textContent).toMatch(/cancelada/i);
  });
});

describe('RankingTable ao vivo', () => {
  const props = { selected: new Set<string>(), onToggle: vi.fn(), onTogglePage: vi.fn(), offset: 0 };

  it('linha sem análise mostra "analisando…" no lugar do score; analisada mostra o score', () => {
    render(
      <RankingTable
        {...props}
        live
        rows={[row({ id: 'a' }), row({ id: 'b', nome: 'Outra', scoreFinal: 82, lastAnalyzedAt: '2026-10-20T12:00:00Z' })]}
      />,
    );
    expect(screen.getAllByText('analisando…')).toHaveLength(1);
    expect(screen.getByText('82')).toBeTruthy();
  });

  it('fora do modo ao vivo mostra "—" para quem não tem score', () => {
    render(<RankingTable {...props} rows={[row()]} />);
    expect(screen.queryByText('analisando…')).toBeNull();
  });

  it('mostra telefone e canais conhecidos desde a descoberta, antes da análise', () => {
    render(
      <RankingTable
        {...props}
        live
        rows={[row({ telefone: '(13) 3000-1234', contatoWhatsapp: true, contatoInstagram: true, contatoEmail: true })]}
      />,
    );
    expect(screen.getByText('(13) 3000-1234')).toBeTruthy();
    for (const label of ['WhatsApp', 'Instagram', 'E-mail']) expect(screen.getByText(label)).toBeTruthy();
  });
});
