/**
 * T1 — cancelamento de mineração: permissão, idempotência, 409 em run terminada, nada é apagado,
 * corrida entre dois cancelamentos, aborto local e vigia por polling. Offline (Prisma falso).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '@/lib/api-error';
import type { Person } from '@/lib/permissions';
import { canCancelRun, cancelledLabel, isCancellableStatus } from '@/lib/leads/run-cancel';
import {
  abortRunLocally,
  cancelRun,
  isRunCancelled,
  registerRunAbort,
  watchRunCancellation,
} from '@/lib/leads/cancel';

const person = (over: Partial<Person> = {}): Person => ({
  id: 'u-outro',
  status: 'ATIVO',
  globalRole: null,
  departmentCode: 'NEGOCIOS',
  departmentRole: 'ASSESSOR',
  sectors: [],
  ...over,
});

const CREATOR = person({ id: 'u-creator' });
const RUN_ID = 'r1';

describe('canCancelRun (permissão)', () => {
  const run = { createdById: 'u-creator' };

  it('quem iniciou a mineração pode parar', () => {
    expect(canCancelRun(CREATOR, run)).toBe(true);
  });

  it('gerência de Negócios, Presidente e Vice podem parar a mineração de outra pessoa', () => {
    expect(canCancelRun(person({ departmentRole: 'GERENTE' }), run)).toBe(true);
    expect(canCancelRun(person({ departmentCode: null, departmentRole: null, globalRole: 'PRESIDENTE' }), run)).toBe(true);
    expect(canCancelRun(person({ departmentCode: null, departmentRole: null, globalRole: 'VICE_PRESIDENTE' }), run)).toBe(true);
  });

  it('assessor de Negócios que não iniciou a mineração não pode', () => {
    expect(canCancelRun(person(), run)).toBe(false);
  });

  it('outro departamento, inativo e ausente não podem (nem o criador)', () => {
    expect(canCancelRun(person({ id: 'u-creator', departmentCode: 'GENTE', departmentRole: 'GERENTE' }), run)).toBe(false);
    expect(canCancelRun(person({ id: 'u-creator', status: 'INATIVO' }), run)).toBe(false);
    expect(canCancelRun(null, run)).toBe(false);
    expect(canCancelRun(undefined, run)).toBe(false);
  });
});

describe('helpers puros', () => {
  it('só PENDENTE e EM_ANDAMENTO admitem parada', () => {
    expect(isCancellableStatus('PENDENTE')).toBe(true);
    expect(isCancellableStatus('EM_ANDAMENTO')).toBe(true);
    for (const s of ['CONCLUIDA', 'ERRO', 'CANCELADA']) expect(isCancellableStatus(s)).toBe(false);
  });

  it('rótulo "Cancelada (N de M processados)"', () => {
    expect(cancelledLabel({ processados: 3, total: 10 })).toBe('Cancelada (3 de 10 processados)');
  });
});

function fakeDb(initial: { status: string; linked?: number }) {
  const state = { status: initial.status, total: 0 as number, finishedAt: null as Date | null };
  const audits: Array<Record<string, unknown>> = [];
  const destructive = vi.fn();
  const db = {
    miningRun: {
      findUnique: vi.fn(async () => ({ id: RUN_ID, status: state.status, createdById: 'u-creator' })),
      updateMany: vi.fn(async ({ where, data }: { where: { status: { in: string[] } }; data: Record<string, unknown> }) => {
        if (!where.status.in.includes(state.status)) return { count: 0 };
        state.status = data.status as string;
        state.total = data.total as number;
        state.finishedAt = data.finishedAt as Date;
        return { count: 1 };
      }),
      delete: destructive,
      deleteMany: destructive,
    },
    miningRunCompany: { count: vi.fn(async () => initial.linked ?? 7), deleteMany: destructive },
    company: { deleteMany: destructive },
    companyAnalysis: { deleteMany: destructive },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return {};
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return { db, state, audits, destructive };
}

const asPrisma = (db: unknown) => db as PrismaClient;

async function catchApi(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('esperava ApiError');
}

describe('cancelRun', () => {
  it.each(['EM_ANDAMENTO', 'PENDENTE'])('%s → CANCELADA, com total = empresas vinculadas e auditoria', async (status) => {
    const { db, state, audits } = fakeDb({ status, linked: 12 });

    const r = await cancelRun(asPrisma(db), RUN_ID, CREATOR);

    expect(r.changed).toBe(true);
    expect(state.status).toBe('CANCELADA');
    expect(state.total).toBe(12);
    expect(state.finishedAt).toBeInstanceOf(Date);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: 'u-creator', action: 'LEAD_MINER_RUN_CANCELLED' });
  });

  it('não perde dados já salvos: nenhuma exclusão de empresa, análise ou vínculo', async () => {
    const { db, destructive } = fakeDb({ status: 'EM_ANDAMENTO' });
    await cancelRun(asPrisma(db), RUN_ID, CREATOR);
    expect(destructive).not.toHaveBeenCalled();
  });

  it('é idempotente: cancelar duas vezes não falha e não grava de novo', async () => {
    const { db, audits } = fakeDb({ status: 'EM_ANDAMENTO' });
    const first = await cancelRun(asPrisma(db), RUN_ID, CREATOR);
    const second = await cancelRun(asPrisma(db), RUN_ID, CREATOR);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(db.miningRun.updateMany).toHaveBeenCalledTimes(1);
    expect(audits).toHaveLength(1);
  });

  it.each(['CONCLUIDA', 'ERRO'])('%s → 409 e nada é alterado', async (status) => {
    const { db, state, audits } = fakeDb({ status });
    const err = await catchApi(cancelRun(asPrisma(db), RUN_ID, CREATOR));
    expect(err.status).toBe(409);
    expect(state.status).toBe(status);
    expect(db.miningRun.updateMany).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
  });

  it('sem permissão → 403 e nada é alterado', async () => {
    const { db, state } = fakeDb({ status: 'EM_ANDAMENTO' });
    const err = await catchApi(cancelRun(asPrisma(db), RUN_ID, person()));
    expect(err.status).toBe(403);
    expect(state.status).toBe('EM_ANDAMENTO');
    expect(db.miningRun.updateMany).not.toHaveBeenCalled();
  });

  it('mineração inexistente → 404', async () => {
    const { db } = fakeDb({ status: 'EM_ANDAMENTO' });
    db.miningRun.findUnique.mockResolvedValueOnce(null as never);
    const err = await catchApi(cancelRun(asPrisma(db), RUN_ID, CREATOR));
    expect(err.status).toBe(404);
  });

  it('perdeu a corrida para outro cancelamento → sucesso idempotente', async () => {
    const { db } = fakeDb({ status: 'EM_ANDAMENTO' });
    // 1ª leitura vê EM_ANDAMENTO; o updateMany não acha mais (outro já cancelou); 2ª leitura vê CANCELADA.
    db.miningRun.findUnique
      .mockResolvedValueOnce({ id: RUN_ID, status: 'EM_ANDAMENTO', createdById: 'u-creator' })
      .mockResolvedValueOnce({ status: 'CANCELADA' } as never);
    db.miningRun.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await cancelRun(asPrisma(db), RUN_ID, CREATOR);
    expect(r.changed).toBe(false);
  });

  it('perdeu a corrida para a conclusão da mineração → 409', async () => {
    const { db } = fakeDb({ status: 'EM_ANDAMENTO' });
    db.miningRun.findUnique
      .mockResolvedValueOnce({ id: RUN_ID, status: 'EM_ANDAMENTO', createdById: 'u-creator' })
      .mockResolvedValueOnce({ status: 'CONCLUIDA' } as never);
    db.miningRun.updateMany.mockResolvedValueOnce({ count: 0 });
    const err = await catchApi(cancelRun(asPrisma(db), RUN_ID, CREATOR));
    expect(err.status).toBe(409);
  });

  it('aborta, nesta instância, a execução registrada para a mineração', async () => {
    const { db } = fakeDb({ status: 'EM_ANDAMENTO' });
    const { controller, dispose } = registerRunAbort(RUN_ID);
    const other = registerRunAbort('outra-mineracao');

    await cancelRun(asPrisma(db), RUN_ID, CREATOR);

    expect(controller.signal.aborted).toBe(true);
    expect(other.controller.signal.aborted).toBe(false); // só a mineração cancelada
    dispose();
    other.dispose();
  });
});

describe('registro de aborto e vigia', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('abortRunLocally devolve quantas execuções abortou e ignora as já removidas', () => {
    const a = registerRunAbort('rx');
    const b = registerRunAbort('rx');
    b.dispose();
    expect(abortRunLocally('rx')).toBe(1);
    expect(a.controller.signal.aborted).toBe(true);
    expect(abortRunLocally('rx')).toBe(0);
    a.dispose();
  });

  it('isRunCancelled: falha de leitura conta como não cancelada', async () => {
    const db = { miningRun: { findUnique: vi.fn().mockRejectedValue(new Error('db fora')) } };
    expect(await isRunCancelled(asPrisma(db), RUN_ID)).toBe(false);
  });

  it('o vigia aborta o controlador quando outra instância marca CANCELADA', async () => {
    let status = 'EM_ANDAMENTO';
    const db = { miningRun: { findUnique: vi.fn(async () => ({ status })) } };
    const controller = new AbortController();
    const stop = watchRunCancellation(asPrisma(db), RUN_ID, controller, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.signal.aborted).toBe(false);

    status = 'CANCELADA';
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.signal.aborted).toBe(true);
    stop();
  });

  it('parar o vigia cancela o agendamento (sem novas leituras)', async () => {
    const db = { miningRun: { findUnique: vi.fn(async () => ({ status: 'EM_ANDAMENTO' })) } };
    const stop = watchRunCancellation(asPrisma(db), RUN_ID, new AbortController(), 1000);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(db.miningRun.findUnique).not.toHaveBeenCalled();
  });
});
