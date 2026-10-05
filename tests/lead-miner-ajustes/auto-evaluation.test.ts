/**
 * P3 — avaliação automática disparada pelo servidor ao concluir a mineração.
 * Offline: Prisma e Gemini simulados. Cobre disparo único, idempotência, teto, cota, fallback
 * "sem IA", falta de tempo e a rota de lote.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiClient } from '@/lib/leads/ai';
import type { UsageGate } from '@/lib/leads/usage';
import type { EvaluationDeps } from '@/lib/leads/evaluation';
import { AUTO_EVALUATION_BUDGET_MS, claimAutoEvaluation, triggerAutoEvaluation } from '@/lib/leads/auto-evaluation';

const NOW = new Date('2026-10-20T12:00:00Z');
const RUN_CREATED = new Date('2026-10-20T10:00:00Z');

const row = (i: number) => ({
  id: `c${i}`,
  nome: `Loja ${i}`,
  nicho: 'clinica_odontologica',
  bairro: 'Centro',
  cidade: 'Santos',
  website: null,
  hasSite: false,
  isHttps: null,
  analyses: [],
});

/** Banco falso: `claim` alterna como o UPDATE atômico; `findMany` respeita `take`. */
function fakeDb(opts: { pending?: number; done?: number; claimFails?: boolean } = {}) {
  let claimed = false;
  const pending = Array.from({ length: opts.pending ?? 0 }, (_, i) => row(i));
  const saved: Array<{ id: string; data: Record<string, unknown> }> = [];
  const db = {
    $queryRaw: vi.fn(async () => {
      if (opts.claimFails) throw new Error('column "avaliacaoIniciadaEm" does not exist');
      if (claimed) return [];
      claimed = true;
      return [{ id: 'r1' }];
    }),
    miningRun: { findUnique: vi.fn(async () => ({ status: 'CONCLUIDA', createdAt: RUN_CREATED })) },
    company: {
      // 1ª contagem = já avaliados desta mineração; as demais = pendentes restantes.
      count: vi.fn(async (a: { where: unknown }) => {
        const text = JSON.stringify(a.where);
        if (text.includes('"avaliadoEm":{"gte"')) return opts.done ?? 0;
        return pending.length - saved.length;
      }),
      findMany: vi.fn(async (a: { take?: number }) => pending.slice(0, a.take ?? pending.length)),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        saved.push({ id: a.where.id, data: a.data });
        return {};
      }),
    },
  };
  return { db, saved };
}

function usageGate(limit = Number.POSITIVE_INFINITY) {
  let used = 0;
  const gate: UsageGate = {
    reserve: vi.fn(async () => {
      if (used >= limit) return false;
      used += 1;
      return true;
    }),
    count: vi.fn(async () => used),
  };
  return gate;
}

function aiClient() {
  const generate = vi.fn(async (prompt: string) => {
    const n = (prompt.match(/"ref":/g) ?? []).length - 1;
    return JSON.stringify({
      avaliacoes: Array.from({ length: n }, (_, i) => ({ ref: i + 1, resumo: `R${i + 1}`, sugestao: `S${i + 1}` })),
    });
  });
  return { client: { generate } as GeminiClient, generate };
}

const deps = (client: GeminiClient | null, usage: UsageGate = usageGate(), now: () => Date = () => NOW): EvaluationDeps => ({
  client,
  usage,
  limit: 100,
  now,
});

const run = (db: ReturnType<typeof fakeDb>['db'], status: string, d: EvaluationDeps, opts = {}) =>
  triggerAutoEvaluation(db as never, 'r1', status, d, opts);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('claimAutoEvaluation', () => {
  it('só o primeiro chamador ganha; o SQL exige CONCLUIDA e marca nula', async () => {
    const { db } = fakeDb();
    expect(await claimAutoEvaluation(db as never, 'r1')).toBe(true);
    expect(await claimAutoEvaluation(db as never, 'r1')).toBe(false);
    const sql = (db.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray])[0].join('?');
    expect(sql).toContain(`status = 'CONCLUIDA'`);
    expect(sql).toContain('"avaliacaoIniciadaEm" IS NULL');
  });
});

describe('triggerAutoEvaluation', () => {
  it('mineração que não está CONCLUIDA: nem tenta reservar a marca', async () => {
    const { db } = fakeDb({ pending: 3 });
    for (const status of ['PENDENTE', 'EM_ANDAMENTO', 'CANCELADA', 'ERRO']) {
      expect(await run(db, status, deps(null))).toEqual({ triggered: false, reason: 'NAO_CONCLUIDA' });
    }
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('dispara uma única vez, mesmo com chamadas simultâneas (lotes concorrentes)', async () => {
    const { db, saved } = fakeDb({ pending: 4 });
    const { client, generate } = aiClient();
    const d = deps(client);
    const results = await Promise.all([run(db, 'CONCLUIDA', d), run(db, 'CONCLUIDA', d), run(db, 'CONCLUIDA', d)]);
    expect(results.filter((r) => r.triggered)).toHaveLength(1);
    expect(results.filter((r) => !r.triggered && r.reason === 'JA_DISPARADA')).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(1); // 4 leads = 1 lote
    expect(saved).toHaveLength(4);
    expect(saved[0].data).toMatchObject({ fonteAvaliacao: 'IA', avaliadoEm: NOW });
  });

  it('idempotência: a 2ª chamada não faz nada e a consulta exclui quem já tem avaliacaoResumo', async () => {
    const { db, saved } = fakeDb({ pending: 2 });
    const { client, generate } = aiClient();
    await run(db, 'CONCLUIDA', deps(client));
    const again = await run(db, 'CONCLUIDA', deps(client));
    expect(again).toEqual({ triggered: false, reason: 'JA_DISPARADA' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(2);
    const where = JSON.stringify((db.company.findMany.mock.calls[0][0] as { where: unknown }).where);
    expect(where).toContain('"avaliacaoResumo":null');
    expect(where).toContain('"avaliadoEm":null');
    expect(where).toContain('"runId":"r1"');
    expect(where).toContain('"NOT"'); // só "Sem contato"
  });

  it('sem chave de IA: grava por regras (REGRA, "sem IA") e não toca na cota', async () => {
    const { db, saved } = fakeDb({ pending: 3 });
    const usage = usageGate();
    const out = await run(db, 'CONCLUIDA', deps(null, usage));
    expect(out).toMatchObject({ triggered: true, summary: { avaliados: 3, porIa: 0, porRegra: 3, motivoSemIa: 'IA_SEM_CHAVE' } });
    expect(saved.every((s) => s.data.fonteAvaliacao === 'REGRA')).toBe(true);
    expect(usage.reserve).not.toHaveBeenCalled();
  });

  it('respeita o teto de 30 por mineração (45 pendentes → 30 avaliados, 3 chamadas)', async () => {
    const { db, saved } = fakeDb({ pending: 45 });
    const { client, generate } = aiClient();
    const out = await run(db, 'CONCLUIDA', deps(client));
    expect((db.company.findMany.mock.calls[0][0] as { take: number }).take).toBe(30);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(saved).toHaveLength(30);
    expect(out).toMatchObject({ triggered: true, summary: { avaliados: 30, restantes: 15 } });
  });

  it('o teto considera o que já foi avaliado desde o início da mineração (12 feitos → 18)', async () => {
    const { db } = fakeDb({ pending: 45, done: 12 });
    await run(db, 'CONCLUIDA', deps(aiClient().client));
    expect((db.company.findMany.mock.calls[0][0] as { take: number }).take).toBe(18);
  });

  it('teto já atingido: não chama a IA nem grava', async () => {
    const { db, saved } = fakeDb({ pending: 10, done: 30 });
    const { client, generate } = aiClient();
    const out = await run(db, 'CONCLUIDA', deps(client));
    expect(generate).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
    expect(out).toMatchObject({ triggered: true, summary: { avaliados: 0 } });
  });

  it('respeita o limite mensal (GEMINI_MONTHLY_LIMIT): cota de 1 chamada → 10 por IA e o resto por regras', async () => {
    const { db, saved } = fakeDb({ pending: 25 });
    const { client, generate } = aiClient();
    const out = await run(db, 'CONCLUIDA', deps(client, usageGate(1)));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(saved.filter((s) => s.data.fonteAvaliacao === 'IA')).toHaveLength(10);
    expect(saved.filter((s) => s.data.fonteAvaliacao === 'REGRA')).toHaveLength(15);
    expect(out).toMatchObject({ triggered: true, summary: { porIa: 10, porRegra: 15, motivoSemIa: 'IA_COTA_ESGOTADA' } });
  });

  it('sem tempo até o prazo: não grava nada por regras (ficam pendentes para o botão "Avaliar")', async () => {
    const { db, saved } = fakeDb({ pending: 5 });
    const { client, generate } = aiClient();
    // Só restam 5 s de orçamento e uma chamada à IA precisa de até 20 s.
    const out = await run(db, 'CONCLUIDA', deps(client), { startedAt: NOW.getTime() - (AUTO_EVALUATION_BUDGET_MS - 5_000) });
    expect(generate).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
    expect(out).toMatchObject({ triggered: true, summary: { avaliados: 0, restantes: 5 } });
  });

  it('falha ao reservar a marca (ex.: migração ainda não aplicada): não lança e não avalia', async () => {
    const { db, saved } = fakeDb({ pending: 3, claimFails: true });
    const out = await run(db, 'CONCLUIDA', deps(aiClient().client));
    expect(out).toEqual({ triggered: false, reason: 'ERRO' });
    expect(saved).toHaveLength(0);
  });

  it('falha ao gravar: não lança', async () => {
    const { db } = fakeDb({ pending: 2 });
    db.company.update.mockRejectedValueOnce(new Error('db'));
    expect(await run(db, 'CONCLUIDA', deps(null))).toEqual({ triggered: false, reason: 'ERRO' });
  });
});

describe('rota de lote: dispara ao concluir', () => {
  const state = { status: 'EM_ANDAMENTO', trigger: vi.fn() };

  async function callBatch() {
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/users', () => ({
      findUserDTO: async (id: string) => ({
        id,
        name: 'Ana',
        status: 'ATIVO',
        globalRole: null,
        departmentCode: 'NEGOCIOS',
        departmentRole: 'ASSESSOR',
        sectors: [],
      }),
    }));
    vi.doMock('@/lib/prisma', () => ({ prisma: { miningRun: { findUnique: async () => ({ createdById: 'u1' }) } } }));
    vi.doMock('@/lib/leads/pipeline', () => ({
      runBatch: async () => ({ id: 'r1', status: state.status, processados: 1, total: 1 }),
      MSG_PIPELINE: { mineracaoNaoEncontrada: 'x' },
    }));
    vi.doMock('@/lib/leads/deps', () => ({ getPipelineDeps: () => ({}), getEvaluationDeps: () => ({ tag: 'eval' }) }));
    vi.doMock('@/lib/leads/auto-evaluation', () => ({ triggerAutoEvaluation: state.trigger }));
    const { POST } = await import('@/app/api/tools/lead-miner/runs/[id]/batch/route');
    const res = await POST(new Request('http://localhost/x', { method: 'POST' }), { params: { id: 'r1' } });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  beforeEach(() => {
    state.trigger = vi.fn(async () => ({ triggered: true, summary: null }));
  });

  it('passa o status do lote ao disparador (que só age em CONCLUIDA) e devolve o progresso intacto', async () => {
    state.status = 'EM_ANDAMENTO';
    let r = await callBatch();
    expect(r.body).toMatchObject({ status: 'EM_ANDAMENTO' });
    expect(state.trigger.mock.calls[0][2]).toBe('EM_ANDAMENTO');

    state.status = 'CONCLUIDA';
    r = await callBatch();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'CONCLUIDA', processados: 1 });
    expect(state.trigger.mock.calls[1][1]).toBe('r1');
    expect(state.trigger.mock.calls[1][2]).toBe('CONCLUIDA');
  });

  it('se o disparador falhar, o lote responde normalmente', async () => {
    state.status = 'CONCLUIDA';
    state.trigger = vi.fn(async () => {
      throw new Error('boom');
    });
    const r = await callBatch();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'CONCLUIDA' });
  });
});
