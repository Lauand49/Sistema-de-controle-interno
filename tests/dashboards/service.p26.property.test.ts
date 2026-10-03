// Feature: dashboards, Property 26: Respostas sem dados sensíveis
/**
 * **Validates: Requirements 2.9, 2.10**
 *
 * O repositório falso devolve os objetos semeados como estão; aqui eles carregam chaves
 * extras (`email`, `description`, `contactInfo`, `contactName`, `values`, `notes`) com um
 * valor sentinela. Nenhuma dessas chaves (nem o sentinela) pode aparecer em nenhum nível
 * das respostas de `getHub`, `getUnitDashboard` e `getMemberDashboard`; os painéis de
 * Unidade e de membro trazem `referenceDate` = `saoPauloDayKey(now)` e `period` com os
 * limites de `periodWindow`.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ApiError } from '@/lib/api-error';
import { periodWindow, saoPauloDayKey, type Periodo } from '@/lib/dashboards/period';
import type { PersonWithProfile, UnitRecord } from '@/lib/dashboards/repository';
import { getHub, getMemberDashboard, getUnitDashboard } from '@/lib/dashboards/service';
import type { PeriodDTO } from '@/lib/dashboards/types';
import type { Person } from '@/lib/permissions';
import { arbDueDate, arbNow, arbPeriodo, arbWindowInstant } from './support/arb-facts';
import { VALID_UNIT_CODES, arbDepartmentCode, arbDepartmentRole, arbGlobalRole, arbSectorLinks, arbStatus } from './support/arb-person';
import {
  createFakeRepo,
  defaultUnits,
  makePerson,
  makeTask,
  type FakeCard,
  type FakeLead,
  type FakePipe,
  type FakeSeed,
  type FakeTask,
} from './support/fake-repo';

// ---------------------------------------------------------------------------
// Geradores locais
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = ['email', 'description', 'contactInfo', 'contactName', 'values', 'notes'] as const;
const SENTINEL = '§SENSIVEL§';

/** Extras sensíveis: cada chave presente ou não, com valores que contêm o sentinela. */
const arbExtras: fc.Arbitrary<Record<string, unknown>> = fc
  .subarray([...SENSITIVE_KEYS], { minLength: 1 })
  .map((keys) =>
    Object.fromEntries(
      keys.map((k) => [k, k === 'values' ? [{ fieldId: 'f', value: SENTINEL }] : `${k}-${SENTINEL}@scitecjr.com`])
    )
  );

const PRESIDENT_ID = 'pres';
const OTHER_IDS = ['u1', 'u2', 'u3', 'u4'] as const;
const ALL_IDS = [PRESIDENT_ID, ...OTHER_IDS];
const STATUS_VALUES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
const REQUEST_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED'] as const;
const LEAD_STATUS_VALUES = ['RAW', 'PENDING', 'IN_PROGRESS', 'CONVERTED_TO_PIPE', 'DISCARDED'] as const;
const DEPT_CODES = ['NEGOCIOS', 'ADMJURFIN', 'GENTE', 'MIDIAS'] as const;

const arbAssignee = fc.constantFrom<string | null>(null, ...ALL_IDS);
const arbUnitOrNull = fc.constantFrom<string | null>(null, ...VALID_UNIT_CODES);

function withExtras<T extends object>(base: fc.Arbitrary<T>): fc.Arbitrary<T> {
  return fc.tuple(base, arbExtras).map(([b, extras]) => ({ ...extras, ...b }));
}

function arbPeople(): fc.Arbitrary<PersonWithProfile[]> {
  const president = withExtras(fc.constant({})).map(
    (extras) =>
      makePerson({ ...extras, id: PRESIDENT_ID, name: 'Presidente', globalRole: 'PRESIDENTE' } as Parameters<
        typeof makePerson
      >[0])
  );
  const other = (id: string) =>
    withExtras(
      fc.record({
        status: arbStatus,
        globalRole: arbGlobalRole,
        departmentCode: arbDepartmentCode,
        departmentRole: arbDepartmentRole,
        sectors: arbSectorLinks,
      })
    ).map((p) =>
      makePerson({ ...p, id, name: `Pessoa ${id}`, sectors: p.sectors.map((s) => ({ code: s.code, role: s.role })) } as Parameters<
        typeof makePerson
      >[0])
    );
  return fc.tuple(president, ...OTHER_IDS.map(other));
}

function arbTasks(now: Date, periodo: Periodo): fc.Arbitrary<FakeTask[]> {
  return fc
    .array(
      withExtras(
        fc.record({
          status: fc.constantFrom(...STATUS_VALUES),
          dueDate: arbDueDate(now),
          completedAt: fc.option(arbWindowInstant(now, periodo), { nil: null }),
          assigneeId: arbAssignee,
          unitCode: arbUnitOrNull,
        })
      ),
      { maxLength: 15 }
    )
    .map((list) => list.map((t, i) => makeTask({ ...t, id: `t${i}` })));
}

const arbPipes: fc.Arbitrary<FakePipe[]> = fc
  .array(
    withExtras(
      fc.record({
        unitCode: fc.constantFrom(...VALID_UNIT_CODES),
        phases: fc.array(withExtras(fc.record({ order: fc.nat({ max: 5 }), isFinal: fc.boolean() })), {
          minLength: 1,
          maxLength: 3,
        }),
      })
    ),
    { maxLength: 4 }
  )
  .map((pipes) =>
    pipes.map((p, i) => ({
      ...p,
      id: `pipe${i}`,
      name: `Pipe ${i}`,
      unitCode: p.unitCode as FakePipe['unitCode'],
      createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
      phases: p.phases.map((ph, j) => ({ ...ph, id: `pipe${i}-ph${j}`, name: `Fase ${j}` })),
    }))
  );

function arbCards(pipes: FakePipe[]): fc.Arbitrary<FakeCard[]> {
  const phaseIds = pipes.flatMap((p) => p.phases.map((ph) => ph.id));
  if (phaseIds.length === 0) return fc.constant([]);
  return fc
    .array(withExtras(fc.record({ phaseId: fc.constantFrom(...phaseIds), assigneeId: arbAssignee })), {
      maxLength: 15,
    })
    .map((cards) => cards.map((c, i) => ({ ...c, id: `card${i}` })));
}

function arbRequests(now: Date, periodo: Periodo) {
  return fc.array(
    withExtras(
      fc.record({
        status: fc.constantFrom<string>(...REQUEST_STATUS_VALUES),
        fromDept: fc.constantFrom<string>(...DEPT_CODES),
        toDept: fc.constantFrom<string>(...DEPT_CODES),
        handlerId: arbAssignee,
        dueDate: arbDueDate(now),
        updatedAt: arbWindowInstant(now, periodo),
      })
    ),
    { maxLength: 10 }
  );
}

function arbLeads(now: Date, periodo: Periodo): fc.Arbitrary<FakeLead[]> {
  return fc.array(
    withExtras(
      fc.record({
        status: fc.constantFrom<string>(...LEAD_STATUS_VALUES),
        assignedTo: arbAssignee,
        createdAt: arbWindowInstant(now, periodo),
      })
    ),
    { maxLength: 10 }
  );
}

const arbUnits: fc.Arbitrary<UnitRecord[]> = fc
  .array(arbExtras, { minLength: VALID_UNIT_CODES.length, maxLength: VALID_UNIT_CODES.length })
  .map((extras) => defaultUnits().map((u, i) => ({ ...extras[i], ...u })));

const arbScenario = fc.tuple(arbNow, arbPeriodo, arbPipes).chain(([now, periodo, pipes]) =>
  fc.record({
    now: fc.constant(now),
    periodo: fc.constant(periodo),
    unitCode: fc.constantFrom(...VALID_UNIT_CODES),
    targetId: fc.constantFrom(...ALL_IDS),
    actorId: fc.constantFrom(...ALL_IDS),
    seed: fc.record({
      units: arbUnits,
      people: arbPeople(),
      tasks: arbTasks(now, periodo),
      pipes: fc.constant(pipes),
      cards: arbCards(pipes),
      requests: arbRequests(now, periodo),
      leads: arbLeads(now, periodo),
    }) as fc.Arbitrary<Required<FakeSeed>>,
  })
);

// ---------------------------------------------------------------------------
// Verificações
// ---------------------------------------------------------------------------

/** Caminhos (em qualquer nível) com chave sensível. */
function sensitivePaths(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => sensitivePaths(v, `${path}[${i}]`));
  return Object.entries(value).flatMap(([k, v]) => [
    ...((SENSITIVE_KEYS as readonly string[]).includes(k) ? [`${path}.${k}`] : []),
    ...sensitivePaths(v, `${path}.${k}`),
  ]);
}

function expectClean(dto: unknown) {
  expect(sensitivePaths(dto)).toEqual([]);
  expect(JSON.stringify(dto)).not.toContain(SENTINEL);
}

function expectedPeriod(periodo: Periodo, now: Date): PeriodDTO {
  const w = periodWindow(periodo, now);
  return { key: w.key, from: w.from === null ? null : w.from.toISOString(), to: w.to.toISOString() };
}

/** Executa a chamada; erros de permissão/existência (ApiError) não geram resposta. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError) return null;
    throw e;
  }
}

describe('Property 26: Respostas sem dados sensíveis', () => {
  it('getHub, getUnitDashboard e getMemberDashboard não expõem chaves sensíveis e trazem referenceDate/period', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async ({ now, periodo, unitCode, targetId, actorId, seed }) => {
        const repo = createFakeRepo(seed);
        const president = seed.people.find((p) => p.id === PRESIDENT_ID)! as Person;
        const actor = seed.people.find((p) => p.id === actorId)! as Person;
        const refDay = saoPauloDayKey(now);
        const period = expectedPeriod(periodo, now);

        // Presidente: sempre autorizado, garante uma resposta completa.
        for (const who of [president, actor]) {
          expectClean(await getHub(repo, who));

          const unit = await orNull(getUnitDashboard(repo, who, unitCode, periodo, now));
          if (who === president) expect(unit).not.toBeNull();
          if (unit !== null) {
            expectClean(unit);
            expect(unit.referenceDate).toBe(refDay);
            expect(unit.period).toEqual(period);
          }

          const member = await orNull(getMemberDashboard(repo, who, targetId, periodo, now));
          if (who === president) expect(member).not.toBeNull();
          if (member !== null) {
            expectClean(member);
            expect(member.referenceDate).toBe(refDay);
            expect(member.period).toEqual(period);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
