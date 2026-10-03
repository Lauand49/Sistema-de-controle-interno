// Feature: dashboards, Property 24: Resumos_Membro filtrados pelo servidor
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { getUnitDashboard } from '@/lib/dashboards/service';
import { isDoneInPeriod, isOpenTask, isOverdueTask } from '@/lib/dashboards/metrics';
import { buildMetricContext } from '@/lib/dashboards/period';
import type { PersonWithProfile } from '@/lib/dashboards/repository';
import {
  DEPARTMENT_CODES,
  canSeeMemberSummary,
  canViewUnitDashboard,
  isUnitCode,
  type Person,
} from '@/lib/permissions';
import { arbActivePerson, arbPerson, VALID_UNIT_CODES } from './support/arb-person';
import { arbNow, arbPeriodo, arbTaskFact } from './support/arb-facts';
import { createFakeRepo, makePerson, makeTask, type FakeTask } from './support/fake-repo';

/** Ids dos possíveis membros; o ator usa um id próprio ou um destes (resumo do próprio ator). */
const MEMBER_IDS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] as const;

/** Nomes distintos com acentos e caixa variada, para exercitar a ordem em pt-BR. */
const NAMES = ['Álvaro', 'Ana', 'beatriz', 'Bruno', 'Érica', 'Eduardo', 'Ícaro', 'Igor', 'Zé', 'Çá', 'óscar', 'Otávio'];

const isDepartment = (code: string) => (DEPARTMENT_CODES as readonly string[]).includes(code);

/** Põe (ou não) a pessoa como membro da Unidade `code`. */
function withMembership(p: Person, code: string, member: boolean): Person {
  if (!member) return p;
  if (isDepartment(code)) return { ...p, departmentCode: code as Person['departmentCode'] };
  if (p.sectors.some((s) => s.code === code)) return p;
  return { ...p, sectors: [...p.sectors, { code: code as Person['sectors'][number]['code'], name: '', role: 'MEMBRO' }] };
}

function toProfile(p: Person, name: string): PersonWithProfile {
  return makePerson({
    id: p.id,
    name,
    status: p.status,
    globalRole: p.globalRole,
    departmentCode: p.departmentCode,
    departmentRole: p.departmentRole,
    sectors: p.sectors.map((s) => ({ code: s.code, role: s.role })),
  });
}

/** Unidade + ator com acesso a ela. */
const arbUnitAndActor = fc
  .constantFrom(...VALID_UNIT_CODES)
  .chain((code) =>
    fc.record({
      code: fc.constant(code),
      actor: fc
        .tuple(arbActivePerson, fc.constantFrom('actor', ...MEMBER_IDS), fc.boolean())
        .map(([p, id, member]) => withMembership({ ...p, id }, code, member))
        .filter((a) => canViewUnitDashboard(a, code)),
    })
  );

const arbScenario = fc
  .tuple(arbUnitAndActor, arbNow, arbPeriodo)
  .chain(([{ code, actor }, now, periodo]) =>
    fc.record({
      code: fc.constant(code),
      actor: fc.constant(actor),
      now: fc.constant(now),
      periodo: fc.constant(periodo),
      // Membros: maioria ativa e da Unidade; alguns inativos ou de fora (só ruído).
      others: fc.uniqueArray(
        fc.record({
          id: fc.constantFrom(...MEMBER_IDS),
          base: fc.oneof({ weight: 3, arbitrary: arbActivePerson }, { weight: 1, arbitrary: arbPerson }),
          member: fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
        }),
        { maxLength: MEMBER_IDS.length, selector: (m) => m.id }
      ),
      names: fc.shuffledSubarray(NAMES, { minLength: NAMES.length, maxLength: NAMES.length }),
      tasks: fc.array(
        fc.record({
          fact: arbTaskFact(now, periodo),
          assigneeId: fc.constantFrom<string | null>(null, 'actor', 'ghost', ...MEMBER_IDS),
          sameUnit: fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
        }),
        { maxLength: 25 }
      ),
    })
  );

describe('Property 24: Resumos_Membro filtrados pelo servidor', () => {
  /** **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6** */
  it('members contém exatamente os autorizados, em ordem pt-BR, e tasks soma todas as linhas', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        const { code, actor, now, periodo } = s;
        expect(isUnitCode(code)).toBe(true);

        // O ator entra na semente; os demais membros usam ids diferentes do dele.
        const otherPeople = s.others
          .filter((o) => o.id !== actor.id)
          .map((o) => withMembership({ ...o.base, id: o.id }, code, o.member));
        const people = [actor, ...otherPeople].map((p, i) => toProfile(p, s.names[i]));

        const tasks: FakeTask[] = s.tasks.map((t, i) =>
          makeTask({
            id: `t${i}`,
            ...t.fact,
            assigneeId: t.assigneeId === 'actor' ? actor.id : t.assigneeId,
            unitCode: t.sameUnit ? code : t.fact.unitCode === code ? null : t.fact.unitCode,
          })
        );

        const repo = createFakeRepo({ people, tasks });
        const dto = await getUnitDashboard(repo, actor, code, periodo, now);

        // Membros ativos da Unidade, filtrados por canSeeMemberSummary e ordenados por nome.
        const unitMembers = people.filter(
          (p) =>
            p.status === 'ATIVO' &&
            (isDepartment(code) ? p.departmentCode === code : p.sectors.some((x) => x.code === code))
        );
        const expected = unitMembers
          .filter((m) => canSeeMemberSummary(actor, m, code))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        expect(dto.members.map((m) => m.user.id)).toEqual(expected.map((m) => m.id));
        expect(dto.members.map((m) => m.user.name)).toEqual(expected.map((m) => m.name));

        // Totais da Unidade: todas as linhas (autorizadas ou não, com ou sem responsável).
        const ctx = buildMetricContext(now, periodo);
        const unitTasks = tasks.filter((t) => t.unitCode === code);
        const total = {
          open: unitTasks.filter(isOpenTask).length,
          overdue: unitTasks.filter((t) => isOverdueTask(t, ctx)).length,
          doneInPeriod: unitTasks.filter((t) => isDoneInPeriod(t, ctx)).length,
        };
        expect(dto.tasks).toEqual(total);

        // Cada Resumo_Membro conta só as Tarefas_da_Unidade do membro; soma ≤ total.
        for (const m of dto.members) {
          const mine = unitTasks.filter((t) => t.assigneeId === m.user.id);
          expect({ open: m.open, overdue: m.overdue, doneInPeriod: m.doneInPeriod }).toEqual({
            open: mine.filter(isOpenTask).length,
            overdue: mine.filter((t) => isOverdueTask(t, ctx)).length,
            doneInPeriod: mine.filter((t) => isDoneInPeriod(t, ctx)).length,
          });
        }
        for (const k of ['open', 'overdue', 'doneInPeriod'] as const) {
          expect(dto.members.reduce((acc, m) => acc + m[k], 0)).toBeLessThanOrEqual(total[k]);
        }
      }),
      { numRuns: 100 }
    );
  });
});
