// Feature: dashboards, Property 27: Hub lista só o que o ator pode abrir
/**
 * **Validates: Requirements 9.1, 9.3**
 *
 * Para qualquer ator ativo e conjunto de pessoas, `getHub` devolve em
 * `departments`/`sectors` exatamente os `DEPARTMENTS`/`SECTORS` com
 * `canViewUnitDashboard` verdadeiro (na ordem da matriz), e `members` é `null` quando o
 * ator não é Presidência, Gerente de Departamento nem Gerente de Setor; caso contrário,
 * contém exatamente as pessoas ATIVAS, diferentes do ator, com `canViewMemberDashboard`
 * verdadeiro (ordenadas por nome, pt-BR).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { PersonWithProfile } from '@/lib/dashboards/repository';
import { getHub } from '@/lib/dashboards/service';
import {
  DEPARTMENTS,
  SECTORS,
  canViewMemberDashboard,
  canViewUnitDashboard,
  isDepartmentManager,
  isGlobal,
  isSectorManager,
  type Person,
} from '@/lib/permissions';
import {
  arbActivePerson,
  arbDepartmentCode,
  arbDepartmentRole,
  arbGlobalRole,
  arbSectorLinks,
  arbStatus,
} from './support/arb-person';
import { createFakeRepo, makePerson } from './support/fake-repo';

// ---------------------------------------------------------------------------
// Geradores locais
// ---------------------------------------------------------------------------

const ACTOR_ID = 'actor';

/** Nomes com acentos, caixa variada e repetições, para exercitar a ordenação pt-BR. */
const arbName = fc.constantFrom('Ana', 'ana', 'Álvaro', 'Bruno', 'Érica', 'Eduardo', 'Zélia', 'Çarla', 'Carla');

const arbOther = (id: string): fc.Arbitrary<PersonWithProfile> =>
  fc
    .record({
      name: arbName,
      status: arbStatus,
      globalRole: arbGlobalRole,
      departmentCode: arbDepartmentCode,
      departmentRole: arbDepartmentRole,
      sectors: arbSectorLinks,
    })
    .map((p) => makePerson({ ...p, id, sectors: p.sectors.map((s) => ({ code: s.code, role: s.role })) }));

/** Ator ativo (com id fixo) e pessoas com ids únicos; o próprio ator pode estar na lista. */
const arbScenario = fc
  .record({
    actor: arbActivePerson.map((a): Person => ({ ...a, id: ACTOR_ID })),
    count: fc.nat({ max: 8 }),
    includeActor: fc.boolean(),
  })
  .chain(({ actor, count, includeActor }) =>
    fc
      .tuple(...Array.from({ length: count }, (_, i) => arbOther(`p${i}`)))
      .map((others): { actor: Person; people: PersonWithProfile[] } => ({
        actor,
        people: includeActor
          ? [
              ...others,
              makePerson({ ...actor, name: 'Ator', sectors: actor.sectors.map((s) => ({ code: s.code, role: s.role })) }),
            ]
          : others,
      }))
  );

// ---------------------------------------------------------------------------
// Propriedade
// ---------------------------------------------------------------------------

describe('Property 27: Hub lista só o que o ator pode abrir', () => {
  it('departments/sectors seguem canViewUnitDashboard e members segue o papel do ator', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async ({ actor, people }) => {
        const repo = createFakeRepo({ people });
        const hub = await getHub(repo, actor);

        expect(hub.me).toEqual({ id: actor.id });
        expect(hub.departments).toEqual(
          DEPARTMENTS.filter((d) => canViewUnitDashboard(actor, d.code)).map((d) => ({ code: d.code, name: d.name }))
        );
        expect(hub.sectors).toEqual(
          SECTORS.filter((s) => canViewUnitDashboard(actor, s.code)).map((s) => ({ code: s.code, name: s.name }))
        );

        const manages = isGlobal(actor) || isDepartmentManager(actor) || isSectorManager(actor);
        if (!manages) {
          expect(hub.members).toBeNull();
          return;
        }

        expect(hub.members).not.toBeNull();
        const members = hub.members!;
        const expected = people.filter(
          (p) => p.status === 'ATIVO' && p.id !== actor.id && canViewMemberDashboard(actor, p)
        );

        // Mesmo conjunto (sem repetição) e mesma forma de cada item.
        expect(members.map((m) => m.id).sort()).toEqual(expected.map((p) => p.id).sort());
        const byId = new Map(expected.map((p) => [p.id, p]));
        for (const m of members) {
          const p = byId.get(m.id)!;
          expect(m).toEqual({ id: p.id, name: p.name, avatar: p.avatar, title: p.title });
        }

        // Ordenadas por nome (pt-BR).
        for (let i = 1; i < members.length; i++) {
          expect(members[i - 1].name.localeCompare(members[i].name, 'pt-BR')).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 100 }
    );
  });
});
