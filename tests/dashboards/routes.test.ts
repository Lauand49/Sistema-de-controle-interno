/**
 * Testes das rotas `/api/dashboards/**` com dependências falsas (Req. 12.4).
 *
 * Os handlers e o `withAuth` são os reais. Só a fronteira é simulada: a sessão (`@/auth`),
 * a leitura do ator (`findUserDTO` de `@/lib/users`), o cliente Prisma (nunca usado) e a
 * fábrica do repositório, que devolve o repositório em memória de `support/fake-repo.ts`.
 *
 * Requisitos: 12.4, 2.2, 2.3, 2.4, 2.6, 2.8, 7.3.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeRepo, makePerson, makeTask, type FakeDashboardRepository } from './support/fake-repo';
import type { PersonWithProfile } from '@/lib/dashboards/repository';

const state = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  actors: new Map<string, unknown>(),
  repo: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({
  auth: async () => (state.sessionUserId ? { user: { id: state.sessionUserId } } : null),
}));
vi.mock('@/lib/users', () => ({
  findUserDTO: async (id: string) => state.actors.get(id) ?? null,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/dashboards/repository', () => ({
  prismaDashboardRepository: () => state.repo,
}));

import * as hubRoute from '@/app/api/dashboards/route';
import * as unitRoute from '@/app/api/dashboards/units/[code]/route';
import * as memberRoute from '@/app/api/dashboards/members/[userId]/route';
import { FORBIDDEN_MESSAGE, INVALID_PERIOD_MESSAGE, NOT_FOUND_MESSAGE } from '@/lib/dashboards/service';

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
});
const pending = makePerson({ id: 'pend', status: 'PENDENTE', departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' });

const people: PersonWithProfile[] = [president, gdNegocios, assessorNeg, otherNeg, assessorMidias, pending];

let repo: FakeDashboardRepository;

function loginAs(person: PersonWithProfile | null) {
  state.sessionUserId = person?.id ?? null;
}

async function callUnit(code: string, query = '') {
  const res = await unitRoute.GET(new Request(`http://localhost/api/dashboards/units/${code}${query}`), {
    params: { code },
  });
  return { status: res.status, body: await res.json() };
}

async function callMember(userId: string, query = '') {
  const res = await memberRoute.GET(new Request(`http://localhost/api/dashboards/members/${userId}${query}`), {
    params: { userId },
  });
  return { status: res.status, body: await res.json() };
}

async function callHub() {
  const res = await hubRoute.GET(new Request('http://localhost/api/dashboards'), {
    params: {} as Record<string, never>,
  });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  repo = createFakeRepo({
    people,
    tasks: [
      makeTask({ id: 't1', status: 'TODO', assigneeId: 'a-neg', unitCode: 'NEGOCIOS' }),
      makeTask({ id: 't2', status: 'IN_PROGRESS', assigneeId: 'b-neg', unitCode: 'NEGOCIOS' }),
    ],
  });
  state.repo = repo;
  state.actors = new Map(people.map((p) => [p.id, p]));
  loginAs(null);
});

describe('módulos das rotas', () => {
  it('exportam apenas GET (além das opções de segmento) (Req. 2.8)', () => {
    for (const mod of [hubRoute, unitRoute, memberRoute]) {
      const handlers = Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k));
      expect(handlers).toEqual(['GET']);
      expect(Object.keys(mod).sort()).toEqual(['GET', 'dynamic', 'runtime']);
    }
  });
});

describe('401 sem sessão (Req. 2.2)', () => {
  it('nas três rotas, sem consultar o repositório', async () => {
    expect((await callHub()).status).toBe(401);
    expect((await callUnit('NEGOCIOS')).status).toBe(401);
    expect((await callMember('a-neg')).status).toBe(401);
    expect(repo.calls).toEqual([]);
  });

  it('sessão com usuário inexistente no banco também dá 401', async () => {
    state.sessionUserId = 'fantasma';
    expect((await callUnit('NEGOCIOS')).status).toBe(401);
    expect(repo.calls).toEqual([]);
  });
});

describe('403', () => {
  it('conta PENDENTE é barrada pelo withAuth', async () => {
    loginAs(pending);
    expect((await callHub()).status).toBe(403);
    expect((await callUnit('NEGOCIOS')).status).toBe(403);
    expect(repo.calls).toEqual([]);
  });

  it('Unidade fora do alcance do ator (Req. 2.4)', async () => {
    loginAs(assessorMidias);
    const { status, body } = await callUnit('NEGOCIOS', '?periodo=7d');
    expect(status).toBe(403);
    expect(body).toEqual({ error: FORBIDDEN_MESSAGE });
    expect(repo.metricCalls()).toEqual([]);
  });

  it('Painel_Membro sem Escopo_Progresso (Req. 2.4)', async () => {
    loginAs(assessorNeg);
    const { status, body } = await callMember('b-neg');
    expect(status).toBe(403);
    expect(body).toEqual({ error: FORBIDDEN_MESSAGE });
    expect(repo.metricCalls()).toEqual([]);
  });
});

describe('404 (Req. 2.3)', () => {
  it('código de Unidade inválido', async () => {
    loginAs(president);
    const { status, body } = await callUnit('XYZ');
    expect(status).toBe(404);
    expect(body).toEqual({ error: NOT_FOUND_MESSAGE });
    expect(repo.metricCalls()).toEqual([]);
  });

  it('Alvo inexistente', async () => {
    loginAs(president);
    const { status, body } = await callMember('nao-existe');
    expect(status).toBe(404);
    expect(body).toEqual({ error: NOT_FOUND_MESSAGE });
    expect(repo.metricCalls()).toEqual([]);
  });
});

describe('400 com periodo inválido (Req. 2.6)', () => {
  it('nas rotas de Unidade e de Membro, antes de qualquer consulta', async () => {
    loginAs(president);
    const unit = await callUnit('NEGOCIOS', '?periodo=1y');
    expect(unit.status).toBe(400);
    expect(unit.body).toEqual({ error: INVALID_PERIOD_MESSAGE });
    const member = await callMember('a-neg', '?periodo=semana');
    expect(member.status).toBe(400);
    expect(member.body).toEqual({ error: INVALID_PERIOD_MESSAGE });
    expect(repo.calls).toEqual([]);
  });
});

describe('200', () => {
  it('Assessor recebe só o próprio Resumo_Membro (Req. 7.3)', async () => {
    loginAs(assessorNeg);
    const { status, body } = await callUnit('NEGOCIOS', '?periodo=30d');
    expect(status).toBe(200);
    expect(body.unit.code).toBe('NEGOCIOS');
    expect(body.members.map((m: { user: { id: string } }) => m.user.id)).toEqual(['a-neg']);
    expect(JSON.stringify(body)).not.toContain('Davi Assessor');
    // Totais da Unidade continuam completos.
    expect(body.tasks.open).toBe(2);
  });

  it('Gerente de Departamento recebe todos os membros ativos', async () => {
    loginAs(gdNegocios);
    const { status, body } = await callUnit('negocios');
    expect(status).toBe(200);
    expect(body.period.key).toBe('30d');
    expect(body.members.map((m: { user: { id: string } }) => m.user.id)).toEqual(['gd-neg', 'a-neg', 'b-neg']);
  });

  it('Painel_Membro do próprio ator', async () => {
    loginAs(assessorNeg);
    const { status, body } = await callMember('a-neg', '?periodo=tudo');
    expect(status).toBe(200);
    expect(body.tasks.open).toBe(1);
  });

  it('Hub do Assessor: só o próprio departamento, members nulo', async () => {
    loginAs(assessorNeg);
    const { status, body } = await callHub();
    expect(status).toBe(200);
    expect(body.me).toEqual({ id: 'a-neg' });
    expect(body.departments.map((d: { code: string }) => d.code)).toEqual(['NEGOCIOS']);
    expect(body.members).toBeNull();
  });
});
