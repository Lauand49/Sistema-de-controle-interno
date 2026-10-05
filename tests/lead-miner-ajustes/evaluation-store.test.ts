/**
 * T5 — persistência da avaliação (Prisma simulado): elegibilidade do botão, teto por mineração,
 * idempotência e gravação dos campos.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GeminiClient } from '@/lib/leads/ai';
import type { UsageGate } from '@/lib/leads/usage';
import {
  RunNotFinishedError,
  desempenhoFrom,
  evaluateCompanyIds,
  evaluateRunAuto,
} from '@/lib/leads/evaluation-store';
import type { EvaluationDeps } from '@/lib/leads/evaluation';

const NOW = new Date('2026-10-20T12:00:00Z');

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

function fakeDb(opts: { rows?: unknown[]; counts?: number[]; run?: unknown }) {
  const counts = [...(opts.counts ?? [])];
  const db = {
    company: {
      findMany: vi.fn(async (_a: unknown) => opts.rows ?? []),
      count: vi.fn(async (_a: unknown) => counts.shift() ?? 0),
      update: vi.fn(async (_a: unknown) => ({})),
    },
    miningRun: {
      findUnique: vi.fn(async () => (opts.run === undefined ? { status: 'CONCLUIDA', createdAt: new Date('2026-10-20T10:00:00Z') } : opts.run)),
    },
  };
  return db;
}

const usage: UsageGate = { reserve: vi.fn(async () => true), count: vi.fn(async () => 0) };

function aiDeps(): { deps: EvaluationDeps; generate: ReturnType<typeof vi.fn> } {
  const generate = vi.fn(async (prompt: string) => {
    const n = (prompt.match(/"ref":/g) ?? []).length - 1;
    return JSON.stringify({ avaliacoes: Array.from({ length: n }, (_, i) => ({ ref: i + 1, resumo: `R${i + 1}`, sugestao: `S${i + 1}` })) });
  });
  return { deps: { client: { generate } as GeminiClient, usage, limit: 100, now: () => NOW }, generate };
}

const noAi: EvaluationDeps = { client: null, usage, limit: 100, now: () => NOW };

describe('desempenhoFrom', () => {
  it('lê a nota do PageSpeed guardado e rejeita lixo', () => {
    expect(desempenhoFrom({ desempenho: 64 })).toBe(64);
    for (const bad of [null, undefined, [], 'x', {}, { desempenho: 'a' }, { desempenho: 101 }, { desempenho: -1 }, { desempenho: NaN }]) {
      expect(desempenhoFrom(bad)).toBeNull();
    }
  });
});

describe('evaluateCompanyIds (botão "Avaliar")', () => {
  it('só considera quem está em "Sem contato" e ainda sem avaliação (ou só com a de regras)', async () => {
    const db = fakeDb({ rows: [] });
    await evaluateCompanyIds(db as never, ['a', 'b'], noAi);
    const where = JSON.stringify((db.company.findMany.mock.calls[0][0] as { where: unknown }).where);
    expect(where).toContain('"id":{"in":["a","b"]}');
    expect(where).toContain('"NOT"'); // aba Sem contato
    expect(where).toContain('"avaliadoEm":null');
    expect(where).toContain('"fonteAvaliacao":"REGRA"');
  });

  it('sem elegíveis não chama a IA nem grava', async () => {
    const { deps, generate } = aiDeps();
    const db = fakeDb({ rows: [] });
    const r = await evaluateCompanyIds(db as never, ['a'], deps);
    expect(r.avaliados).toBe(0);
    expect(generate).not.toHaveBeenCalled();
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('grava resumo, sugestão, data e fonte de cada lead', async () => {
    const { deps } = aiDeps();
    const db = fakeDb({ rows: [row(1), row(2)] });
    const r = await evaluateCompanyIds(db as never, ['c1', 'c2'], deps);
    expect(r).toMatchObject({ avaliados: 2, porIa: 2, porRegra: 0, motivoSemIa: null });
    const data = db.company.update.mock.calls.map((c) => (c[0] as { where: { id: string }; data: Record<string, unknown> }));
    expect(data.map((d) => d.where.id)).toEqual(['c1', 'c2']);
    expect(data[0].data).toEqual({ avaliacaoResumo: 'R1', sugestaoAcao: 'S1', avaliadoEm: NOW, fonteAvaliacao: 'IA' });
  });

  it('sem IA: grava por regras com o motivo no resumo da chamada', async () => {
    const db = fakeDb({ rows: [row(1)] });
    const r = await evaluateCompanyIds(db as never, ['c1'], noAi);
    expect(r).toMatchObject({ avaliados: 1, porIa: 0, porRegra: 1, motivoSemIa: 'IA_SEM_CHAVE' });
    expect((db.company.update.mock.calls[0][0] as { data: { fonteAvaliacao: string } }).data.fonteAvaliacao).toBe('REGRA');
  });

  it('lista vazia não consulta o banco', async () => {
    const db = fakeDb({});
    expect((await evaluateCompanyIds(db as never, [], noAi)).avaliados).toBe(0);
    expect(db.company.findMany).not.toHaveBeenCalled();
  });
});

describe('evaluateRunAuto (fim da mineração)', () => {
  it('mineração inexistente → null; não concluída → RunNotFinishedError', async () => {
    expect(await evaluateRunAuto(fakeDb({ run: null }) as never, 'r', noAi)).toBeNull();
    await expect(
      evaluateRunAuto(fakeDb({ run: { status: 'EM_ANDAMENTO', createdAt: NOW } }) as never, 'r', noAi),
    ).rejects.toBeInstanceOf(RunNotFinishedError);
  });

  it('pede no máximo 30 candidatos por mineração', async () => {
    const db = fakeDb({ rows: [row(1)], counts: [0, 0] });
    await evaluateRunAuto(db as never, 'r', noAi);
    expect((db.company.findMany.mock.calls[0][0] as { take: number }).take).toBe(30);
  });

  it('idempotente: já avaliados contam para o teto (12 feitos → só 18 restantes)', async () => {
    const db = fakeDb({ rows: [row(1)], counts: [12, 0] });
    await evaluateRunAuto(db as never, 'r', noAi);
    expect((db.company.findMany.mock.calls[0][0] as { take: number }).take).toBe(18);
  });

  it('teto atingido: não chama a IA, não grava e informa quantos ficaram para o botão', async () => {
    const { deps, generate } = aiDeps();
    const db = fakeDb({ counts: [30, 17] });
    const r = await evaluateRunAuto(db as never, 'r', deps);
    expect(r).toMatchObject({ avaliados: 0, restantes: 17 });
    expect(generate).not.toHaveBeenCalled();
    expect(db.company.findMany).not.toHaveBeenCalled();
    expect(db.company.update).not.toHaveBeenCalled();
  });

  it('só olha leads desta mineração, sem contato e nunca avaliados', async () => {
    const db = fakeDb({ rows: [], counts: [0] });
    await evaluateRunAuto(db as never, 'run-1', noAi);
    const where = JSON.stringify((db.company.findMany.mock.calls[0][0] as { where: unknown }).where);
    expect(where).toContain('"runId":"run-1"');
    expect(where).toContain('"NOT"');
    expect(where).toContain('"avaliadoEm":null');
  });

  it('informa os restantes depois de avaliar', async () => {
    const { deps } = aiDeps();
    const db = fakeDb({ rows: [row(1), row(2)], counts: [0, 5] });
    const r = await evaluateRunAuto(db as never, 'r', deps);
    expect(r).toMatchObject({ avaliados: 2, restantes: 5 });
  });
});
