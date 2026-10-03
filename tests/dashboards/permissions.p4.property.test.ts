// Feature: dashboards, Property 4: Visibilidade do Resumo_Membro
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEPARTMENT_CODES,
  canSeeMemberSummary,
  isDepartmentManager,
  progressScope,
  type Person,
} from '@/lib/permissions';
import { arbActivePerson, arbPerson, arbUnitCodeish } from './support/arb-person';

/** Assessor ativo: sem cargo global e sem cargo de gerente (departamento ou setor). */
const arbPlainAssessor: fc.Arbitrary<Person> = arbActivePerson.map((p) => ({
  ...p,
  globalRole: null,
  departmentRole: p.departmentRole === 'GERENTE' ? 'ASSESSOR' : p.departmentRole,
  sectors: p.sectors.map((s) => ({ ...s, role: 'MEMBRO' as const })),
}));

/** Gerente de Setor ativo, sem cargo global (pode ou não ser Gerente de Departamento). */
const arbSectorManager: fc.Arbitrary<Person> = arbActivePerson
  .filter((p) => p.sectors.length > 0)
  .map((p) => ({
    ...p,
    globalRole: null,
    sectors: p.sectors.map((s, i) => (i === 0 ? { ...s, role: 'GERENTE' as const } : s)),
  }));

const arbDepartmentCode = fc.constantFrom<string>(...DEPARTMENT_CODES);

describe('Property 4: Visibilidade do Resumo_Membro', () => {
  /** **Validates: Requirements 7.3** */
  it("canSeeMemberSummary é verdadeiro exatamente quando progressScope é 'ALL' ou contém o código", () => {
    fc.assert(
      fc.property(arbPerson, arbPerson, arbUnitCodeish, (actor, target, code) => {
        const scope = progressScope(actor, target);
        const expected = scope === 'ALL' || (Array.isArray(scope) && (scope as string[]).includes(code));
        expect(canSeeMemberSummary(actor, target, code)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /** **Validates: Requirements 7.4** */
  it('Assessor ativo sem cargo de gerente só vê o próprio Resumo_Membro', () => {
    fc.assert(
      fc.property(arbPlainAssessor, arbPerson, arbUnitCodeish, (actor, target, code) => {
        expect(canSeeMemberSummary(actor, target, code)).toBe(target.id === actor.id);
      }),
      { numRuns: 100 }
    );
  });

  /** **Validates: Requirements 7.3** */
  it('Gerente de Setor não vê resumos de outros membros em código de departamento sem ser gerente dele', () => {
    fc.assert(
      fc.property(arbSectorManager, arbPerson, arbDepartmentCode, (actor, target, code) => {
        fc.pre(target.id !== actor.id);
        // Único caminho restante para 'ALL': gerir o departamento do membro.
        fc.pre(!(isDepartmentManager(actor) && target.departmentCode === actor.departmentCode));
        expect(canSeeMemberSummary(actor, target, code)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
