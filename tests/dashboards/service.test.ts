/**
 * Testes unitários do serviço dos painéis com o repositório falso (Req. 12.4).
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-error';
import {
  FORBIDDEN_MESSAGE,
  INVALID_PERIOD_MESSAGE,
  NOT_FOUND_MESSAGE,
  getMemberDashboard,
  getUnitDashboard,
} from '@/lib/dashboards/service';
import { createFakeRepo, makePerson, makeTask, type FakeSeed } from './support/fake-repo';

// 12:00 em São Paulo, 05/10/2026.
const NOW = new Date('2026-10-05T15:00:00.000Z');

const president = makePerson({ id: 'pres', name: 'Ana Presidente', globalRole: 'PRESIDENTE' });
const gdNegocios = makePerson({
  id: 'gd-neg',
  name: 'Bruno Gerente',
  departmentCode: 'NEGOCIOS',
  departmentRole: 'GERENTE',
});
const assessorNeg = makePerson({
  id: 'a-neg',
  name: 'Carla Assessora',
  departmentCode: 'NEGOCIOS',
  departmentRole: 'ASSESSOR',
});
const otherNeg = makePerson({
  id: 'b-neg',
  name: 'Davi Assessor',
  departmentCode: 'NEGOCIOS',
  departmentRole: 'ASSESSOR',
});
const assessorMidias = makePerson({
  id: 'a-mid',
  name: 'Elisa Mídias',
  departmentCode: 'MIDIAS',
  departmentRole: 'ASSESSOR',
  sectors: [{ code: 'TEC_SOFTWARE', role: 'MEMBRO' }],
});
const otherMidias = makePerson({
  id: 'b-mid',
  name: 'Fábio Mídias',
  departmentCode: 'MIDIAS',
  departmentRole: 'ASSESSOR',
});
const gsSoftware = makePerson({
  id: 'gs-soft',
  name: 'Gabi Gerente de Setor',
  departmentCode: 'MIDIAS',
  departmentRole: 'ASSESSOR',
  sectors: [{ code: 'TEC_SOFTWARE', role: 'GERENTE' }],
});

const overdueDue = new Date('2026-10-01T00:00:00.000Z');

function seed(overrides: FakeSeed = {}): FakeSeed {
  return {
    people: [president, gdNegocios, assessorNeg, otherNeg, assessorMidias, otherMidias, gsSoftware],
    tasks: [
      makeTask({ id: 't1', status: 'TODO', assigneeId: 'a-neg', unitCode: 'NEGOCIOS', dueDate: overdueDue }),
      makeTask({ id: 't2', status: 'IN_PROGRESS', assigneeId: 'b-neg', unitCode: 'NEGOCIOS' }),
      makeTask({
        id: 't3',
        status: 'DONE',
        assigneeId: 'a-neg',
        unitCode: 'NEGOCIOS',
        completedAt: new Date('2026-10-04T12:00:00.000Z'),
      }),
      makeTask({ id: 't4', status: 'TODO', assigneeId: 'a-mid', unitCode: 'MIDIAS' }),
      makeTask({ id: 't5', status: 'TODO', assigneeId: 'a-mid', unitCode: 'TEC_SOFTWARE', dueDate: overdueDue }),
    ],
    requests: [
      {
        status: 'PENDING',
        fromDept: 'GENTE',
        toDept: 'NEGOCIOS',
        handlerId: 'a-neg',
        dueDate: overdueDue,
        updatedAt: new Date('2026-09-30T12:00:00.000Z'),
      },
    ],
    leads: [
      { status: 'PENDING', assignedTo: 'a-neg', createdAt: new Date('2026-10-01T12:00:00.000Z') },
      { status: 'CONVERTED_TO_PIPE', assignedTo: null, createdAt: new Date('2026-10-02T12:00:00.000Z') },
    ],
    ...overrides,
  };
}

async function expectApiError(promise: Promise<unknown>, status: number, message: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
  expect((err as ApiError).message).toBe(message);
}

describe('getUnitDashboard: erros', () => {
  it('400 com período inválido, antes de qualquer consulta', async () => {
    const repo = createFakeRepo(seed());
    await expectApiError(getUnitDashboard(repo, president, 'NEGOCIOS', '30D', NOW), 400, INVALID_PERIOD_MESSAGE);
    await expectApiError(getUnitDashboard(repo, president, 'XYZ', 'semana', NOW), 400, INVALID_PERIOD_MESSAGE);
    expect(repo.calls).toEqual([]);
  });

  it('404 com código fora da lista, sem consultar o repositório', async () => {
    const repo = createFakeRepo(seed());
    await expectApiError(getUnitDashboard(repo, president, 'GLOBAL', '30d', NOW), 404, NOT_FOUND_MESSAGE);
    await expectApiError(getUnitDashboard(repo, president, 'TEC-SOFTWARE', null, NOW), 404, NOT_FOUND_MESSAGE);
    expect(repo.calls).toEqual([]);
  });

  it('404 quando a Unidade não existe no banco, sem consultas de métrica', async () => {
    const repo = createFakeRepo(seed({ units: [] }));
    await expectApiError(getUnitDashboard(repo, president, 'NEGOCIOS', '30d', NOW), 404, NOT_FOUND_MESSAGE);
    expect(repo.callsOf('findUnit')).toHaveLength(1);
    expect(repo.metricCalls()).toEqual([]);
  });

  it('403 sem permissão, sem consultas de métrica', async () => {
    const repo = createFakeRepo(seed());
    await expectApiError(getUnitDashboard(repo, assessorMidias, 'NEGOCIOS', '7d', NOW), 403, FORBIDDEN_MESSAGE);
    await expectApiError(getUnitDashboard(repo, gdNegocios, 'TEC_SOFTWARE', '7d', NOW), 403, FORBIDDEN_MESSAGE);
    expect(repo.metricCalls()).toEqual([]);
  });

  it('aceita o código em minúsculas', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getUnitDashboard(repo, president, 'negocios', null, NOW);
    expect(dto.unit.code).toBe('NEGOCIOS');
    expect(dto.period.key).toBe('30d');
  });
});

describe('getMemberDashboard: erros', () => {
  it('400 com período inválido, antes de qualquer consulta', async () => {
    const repo = createFakeRepo(seed());
    await expectApiError(getMemberDashboard(repo, president, 'a-neg', '1y', NOW), 400, INVALID_PERIOD_MESSAGE);
    expect(repo.calls).toEqual([]);
  });

  it('404 com alvo inexistente, sem consultas de métrica', async () => {
    const repo = createFakeRepo(seed());
    await expectApiError(getMemberDashboard(repo, president, 'nao-existe', '30d', NOW), 404, NOT_FOUND_MESSAGE);
    expect(repo.callsOf('findPerson')).toHaveLength(1);
    expect(repo.metricCalls()).toEqual([]);
  });

  it('403 sem Escopo_Progresso, sem consultas de métrica', async () => {
    const repo = createFakeRepo(seed());
    await expectApiError(getMemberDashboard(repo, assessorNeg, 'b-neg', '30d', NOW), 403, FORBIDDEN_MESSAGE);
    await expectApiError(getMemberDashboard(repo, gdNegocios, 'a-mid', '30d', NOW), 403, FORBIDDEN_MESSAGE);
    expect(repo.metricCalls()).toEqual([]);
  });
});

describe('getUnitDashboard: Resumos_Membro autorizados (Req. 7.3)', () => {
  it('Assessor vê só a própria linha', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getUnitDashboard(repo, assessorNeg, 'NEGOCIOS', '30d', NOW);
    expect(dto.members).toEqual([
      { user: { id: 'a-neg', name: 'Carla Assessora', avatar: null }, open: 1, overdue: 1, doneInPeriod: 1 },
    ]);
    // Os totais da Unidade continuam incluindo todos.
    expect(dto.tasks).toEqual({ open: 2, overdue: 1, doneInPeriod: 1 });
  });

  it('Gerente de Departamento vê todos os membros ativos, por nome', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getUnitDashboard(repo, gdNegocios, 'NEGOCIOS', '30d', NOW);
    expect(dto.members.map((m) => m.user.id)).toEqual(['gd-neg', 'a-neg', 'b-neg']);
  });

  it('Gerente de Setor no painel do departamento recebe members vazio', async () => {
    // O GS de TEC_SOFTWARE pertence a MIDIAS; sobre membros de MIDIAS o escopo dele é só
    // ['TEC_SOFTWARE'], que não autoriza o Resumo_Membro no painel de MIDIAS. O próprio GS
    // fica fora da semente de pessoas, para que a lista contenha apenas os outros membros.
    const repo = createFakeRepo(seed({ people: [president, assessorMidias, otherMidias] }));
    const dto = await getUnitDashboard(repo, gsSoftware, 'MIDIAS', '30d', NOW);
    expect(dto.members).toEqual([]);
    expect(dto.tasks.open).toBe(1);
  });

  it('Gerente de Setor no próprio setor vê os membros do setor', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getUnitDashboard(repo, gsSoftware, 'TEC_SOFTWARE', '30d', NOW);
    expect(dto.members.map((m) => m.user.id)).toEqual(['a-mid', 'gs-soft']);
  });
});

describe('getUnitDashboard: blocos conforme o tipo de Unidade (Req. 4.7, 5.5)', () => {
  it('Negócios: requests e leads presentes, sector nulo', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getUnitDashboard(repo, president, 'NEGOCIOS', '30d', NOW);
    expect(dto.unit).toEqual({ code: 'NEGOCIOS', name: 'Negócios', type: 'DEPARTAMENTO' });
    expect(dto.requests).toEqual({
      received: { PENDING: 1, APPROVED: 0, REJECTED: 0, IN_PROGRESS: 0, COMPLETED: 0 },
      sent: { PENDING: 0, APPROVED: 0, REJECTED: 0, IN_PROGRESS: 0, COMPLETED: 0 },
      overdueReceived: 1,
    });
    expect(dto.sector).toBeNull();
    expect(dto.leads).not.toBeNull();
    expect(dto.leads!.conversion).toEqual({ converted: 1, total: 2, percent: 50 });
    expect(dto.leads!.byAssignee.at(-1)?.assignee).toBeNull();
    expect(repo.callsOf('sectorManager')).toEqual([]);
  });

  it('outro departamento: requests presente, leads e sector nulos', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getUnitDashboard(repo, president, 'GENTE', '30d', NOW);
    expect(dto.requests).not.toBeNull();
    expect(dto.requests!.sent.PENDING).toBe(1);
    expect(dto.leads).toBeNull();
    expect(dto.sector).toBeNull();
    expect(repo.callsOf('leadRows')).toEqual([]);
  });

  it('setor: sector presente, requests e leads nulos', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getUnitDashboard(repo, president, 'TEC_SOFTWARE', '30d', NOW);
    expect(dto.unit.type).toBe('SETOR');
    expect(dto.sector).toEqual({
      manager: { id: 'gs-soft', name: 'Gabi Gerente de Setor', avatar: null },
      activeMembers: 2,
    });
    expect(dto.requests).toBeNull();
    expect(dto.leads).toBeNull();
    expect(repo.callsOf('requestRows')).toEqual([]);
    expect(repo.callsOf('leadRows')).toEqual([]);
  });

  it('tarefas atrasadas da Unidade mantêm o responsável e omitem a Unidade', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getUnitDashboard(repo, president, 'NEGOCIOS', '30d', NOW);
    expect(dto.overdueTasks).toEqual([
      {
        id: 't1',
        title: 'Tarefa t1',
        dueDate: '2026-10-01',
        assignee: { id: 'a-neg', name: 'Carla Assessora', avatar: null },
        unit: null,
      },
    ]);
  });
});

describe('getMemberDashboard', () => {
  it('tarefas atrasadas do membro mantêm a Unidade e omitem o responsável', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getMemberDashboard(repo, president, 'a-mid', '30d', NOW);
    expect(dto.scope).toEqual({ kind: 'ALL' });
    expect(dto.overdueTasks).toEqual([
      {
        id: 't5',
        title: 'Tarefa t5',
        dueDate: '2026-10-01',
        assignee: null,
        unit: { code: 'TEC_SOFTWARE', name: 'Tecnologia e Software' },
      },
    ]);
  });

  it('Gerente de Setor: escopo do setor, sem requests e leads', async () => {
    const repo = createFakeRepo(seed());
    const dto = await getMemberDashboard(repo, gsSoftware, 'a-mid', '30d', NOW);
    expect(dto.scope).toEqual({
      kind: 'SECTORS',
      sectors: [{ code: 'TEC_SOFTWARE', name: 'Tecnologia e Software' }],
    });
    expect(dto.tasks).toEqual({ open: 1, overdue: 1, doneInPeriod: 0 });
    expect(dto.requests).toBeNull();
    expect(dto.leads).toBeNull();
    expect(repo.callsOf('handlerRequestCounts')).toEqual([]);
    expect(repo.callsOf('memberLeadRows')).toEqual([]);
  });
});
