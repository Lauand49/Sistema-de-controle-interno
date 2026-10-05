import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadMinerApiError, leadMinerApi, type RunProgress } from '@/lib/leads/client-api';
import { driveRun, IDLE_DELAY_MS, RETRY_DELAY_MS, type RunDriverApi } from '@/hooks/lead-miner/driveRun';
import { RunDriverPool } from '@/hooks/lead-miner/runDriverPool';
import { applyDriveResult, initialRunState } from '@/hooks/lead-miner/runState';

function prog(id: string, over: Partial<RunProgress> = {}): RunProgress {
  return {
    id,
    status: 'EM_ANDAMENTO',
    processados: 0,
    total: 3,
    novos: 2,
    existentes: 1,
    errorMessage: null,
    nichosFalhos: [],
    iaDisabledReason: null,
    fonteSolicitada: 'OSM',
    fonte: 'OSM',
    googleMotivo: null,
    googleNichosAfetados: [],
    pagespeedEnabled: false,
    pagespeedMotivo: null,
    cnpjEnabled: false,
    ...over,
  };
}

/** API em memória: `discover` passa para EM_ANDAMENTO; cada `batch` processa 1 empresa. */
function scriptedApi(total = 3) {
  const state = new Map<string, RunProgress>();
  const calls: string[] = [];
  let inFlight = new Map<string, number>();
  let maxConcurrentPerRun = 0;
  const track = async (id: string, fn: () => RunProgress) => {
    inFlight.set(id, (inFlight.get(id) ?? 0) + 1);
    maxConcurrentPerRun = Math.max(maxConcurrentPerRun, inFlight.get(id)!);
    await new Promise((r) => setTimeout(r, 1));
    inFlight.set(id, inFlight.get(id)! - 1);
    return fn();
  };
  const api: RunDriverApi = {
    discover: (id) =>
      track(id, () => {
        calls.push(`discover:${id}`);
        const cur = state.get(id) ?? prog(id, { status: 'PENDENTE', total: 0 });
        const next = cur.status === 'PENDENTE' ? { ...cur, status: 'EM_ANDAMENTO' as const, total } : cur;
        state.set(id, next);
        return next;
      }),
    batch: (id) =>
      track(id, () => {
        calls.push(`batch:${id}`);
        const cur = state.get(id)!;
        const processados = Math.min(cur.total, cur.processados + 1);
        const next = { ...cur, processados, status: processados === cur.total ? ('CONCLUIDA' as const) : cur.status };
        state.set(id, next);
        return next;
      }),
  };
  return { api, calls, max: () => maxConcurrentPerRun, reset: () => (inFlight = new Map()) };
}

const noSleep = vi.fn(async () => {});

afterEach(() => {
  noSleep.mockClear();
  vi.unstubAllGlobals();
});

describe('driveRun', () => {
  it('chama discover enquanto PENDENTE e batch enquanto EM_ANDAMENTO até CONCLUIDA', async () => {
    const { api, calls } = scriptedApi(2);
    const seen: RunProgress[] = [];
    const r = await driveRun('r1', {
      api,
      signal: new AbortController().signal,
      initial: prog('r1', { status: 'PENDENTE', total: 0 }),
      onProgress: (p) => seen.push(p),
      sleep: noSleep,
    });
    expect(calls).toEqual(['discover:r1', 'batch:r1', 'batch:r1']);
    expect(r.kind).toBe('finished');
    expect(r.kind === 'finished' && r.progress).toMatchObject({ status: 'CONCLUIDA', processados: 2, total: 2 });
    expect(seen.map((p) => p.processados)).toEqual([0, 1, 2]);
  });

  it('termina sem requisição quando o progresso inicial já é final', async () => {
    const { api, calls } = scriptedApi();
    const r = await driveRun('r1', {
      api,
      signal: new AbortController().signal,
      initial: prog('r1', { status: 'ERRO', errorMessage: 'Bairro não encontrado' }),
      sleep: noSleep,
    });
    expect(calls).toEqual([]);
    expect(r.kind).toBe('finished');
  });

  it('em falha de rede avisa "reconectando", espera 5 s e tenta de novo', async () => {
    let fails = 1;
    const api: RunDriverApi = {
      discover: async () => prog('r1'),
      batch: async (id) => {
        if (fails-- > 0) throw new LeadMinerApiError(0, 'sem rede');
        return prog(id, { status: 'CONCLUIDA', processados: 3 });
      },
    };
    const flags: boolean[] = [];
    const r = await driveRun('r1', {
      api,
      signal: new AbortController().signal,
      initial: prog('r1'),
      onReconnecting: (v) => flags.push(v),
      sleep: noSleep,
    });
    expect(flags).toEqual([true, false]);
    expect(noSleep).toHaveBeenCalledWith(RETRY_DELAY_MS, expect.anything());
    expect(r.kind).toBe('finished');
  });

  it('erro definitivo (403) encerra com a mensagem', async () => {
    const api: RunDriverApi = {
      discover: async () => prog('r1'),
      batch: async () => {
        throw new LeadMinerApiError(403, 'Apenas o autor da mineração pode executá-la.');
      },
    };
    const r = await driveRun('r1', { api, signal: new AbortController().signal, initial: prog('r1'), sleep: noSleep });
    expect(r).toMatchObject({ kind: 'failed', message: 'Apenas o autor da mineração pode executá-la.' });
  });

  it('pausa quando a resposta não traz avanço', async () => {
    let n = 0;
    const api: RunDriverApi = {
      discover: async (id) => (++n < 2 ? prog(id, { status: 'PENDENTE', total: 0 }) : prog(id, { status: 'CONCLUIDA', total: 0 })),
      batch: async (id) => prog(id),
    };
    await driveRun('r1', { api, signal: new AbortController().signal, initial: prog('r1', { status: 'PENDENTE', total: 0 }), sleep: noSleep });
    expect(noSleep).toHaveBeenCalledWith(IDLE_DELAY_MS, expect.anything());
  });

  it('para no abort sem novas requisições', async () => {
    const ac = new AbortController();
    const batch = vi.fn(async (id: string) => {
      ac.abort();
      return prog(id);
    });
    const r = await driveRun('r1', { api: { discover: batch, batch }, signal: ac.signal, initial: prog('r1'), sleep: noSleep });
    expect(r.kind).toBe('aborted');
    expect(batch).toHaveBeenCalledTimes(1);
  });
});

describe('applyDriveResult', () => {
  it('em ERRO usa a mensagem registrada na mineração', () => {
    const s = applyDriveResult(initialRunState('r1'), {
      kind: 'finished',
      progress: prog('r1', { status: 'ERRO', errorMessage: 'Falha ao gravar no banco de dados' }),
    });
    expect(s).toMatchObject({ done: true, error: 'Falha ao gravar no banco de dados' });
  });
});

describe('RunDriverPool', () => {
  it('executa várias minerações em paralelo com no máximo uma requisição por mineração', async () => {
    const { api, max } = scriptedApi(4);
    const outcomes: string[] = [];
    let resolveAll!: () => void;
    const allDone = new Promise<void>((r) => (resolveAll = r));
    const pool = new RunDriverPool({
      api,
      sleep: noSleep,
      onOutcome: (res, sawActive) => {
        if (res.kind === 'finished') outcomes.push(`${res.progress.id}:${sawActive}`);
        if (outcomes.length === 2) resolveAll();
      },
    });
    pool.sync([prog('a', { status: 'PENDENTE', total: 0 }), prog('b', { status: 'PENDENTE', total: 0 })]);
    // Adições repetidas da mesma mineração não criam um segundo laço.
    pool.add('a');
    pool.sync([prog('a', { status: 'PENDENTE', total: 0 })]);
    expect(pool.runningCount()).toBe(2);
    await allDone;
    expect(max()).toBe(1);
    expect(outcomes.sort()).toEqual(['a:true', 'b:true']);
    expect(pool.list().every((s) => s.done && s.progress?.status === 'CONCLUIDA')).toBe(true);
    expect(pool.runningCount()).toBe(0);
  });

  it('stopAll cancela os laços e resume os retoma', async () => {
    const { api } = scriptedApi(2);
    const pool = new RunDriverPool({ api, sleep: noSleep });
    pool.sync([prog('a')]);
    pool.stopAll();
    expect(pool.runningCount()).toBe(0);
    pool.resume();
    expect(pool.isRunning('a')).toBe(true);
    pool.remove('a');
    expect(pool.list()).toEqual([]);
  });
});

describe('leadMinerApi.assign', () => {
  it('envia { ids, assigneeId }', async () => {
    const fetchFake = vi.fn(async (_url: string, init: RequestInit) => {
      return new Response(JSON.stringify({ updated: 1, assignee: { id: 'u1', name: 'Ana' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchFake);
    const res = await leadMinerApi.assign(['c1'], 'u1');
    expect(JSON.parse(String(fetchFake.mock.calls[0][1].body))).toEqual({ ids: ['c1'], assigneeId: 'u1' });
    expect(res).toEqual({ updated: 1, assignee: { id: 'u1', name: 'Ana' } });
  });
});
