// Feature: dashboards, Property 2: Acesso ao painel de membro e Escopo_Progresso
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canViewMemberDashboard, progressScope, type Person } from '@/lib/permissions';
import { arbActivePerson, arbPerson } from './support/arb-person';

/** Presidência = Presidente ou Vice-presidente (globalRole não nulo). */
const isPresidencia = (p: Person) => p.globalRole !== null;

const isDeptManagerOf = (actor: Person, target: Person) =>
  actor.departmentRole === 'GERENTE' &&
  actor.departmentCode !== null &&
  actor.departmentCode === target.departmentCode;

describe('Property 2: Acesso ao painel de membro e Escopo_Progresso', () => {
  /** **Validates: Requirements 1.2, 1.3, 1.6** */
  it('canViewMemberDashboard ⇔ progressScope !== null, para qualquer par', () => {
    fc.assert(
      fc.property(arbPerson, arbPerson, (actor, target) => {
        expect(canViewMemberDashboard(actor, target)).toBe(progressScope(actor, target) !== null);
      }),
      { numRuns: 100 }
    );
  });

  /** **Validates: Requirements 1.2, 1.3, 1.6** */
  it('com ator ativo: ALL para Presidência/si mesmo/GD do depto; senão null ou subconjunto não vazio dos setores em comum', () => {
    fc.assert(
      fc.property(arbActivePerson, arbPerson, (actor, target) => {
        const scope = progressScope(actor, target);

        if (isPresidencia(actor) || actor.id === target.id || isDeptManagerOf(actor, target)) {
          expect(scope).toBe('ALL');
          return;
        }

        if (scope === null) return;
        expect(Array.isArray(scope)).toBe(true);
        const list = scope as string[];
        expect(list.length).toBeGreaterThan(0);

        const managed = new Set(actor.sectors.filter((s) => s.role === 'GERENTE').map((s) => s.code));
        const targetSectors = new Set(target.sectors.map((s) => s.code));
        for (const code of list) {
          expect(managed.has(code as never)).toBe(true);
          expect(targetSectors.has(code as never)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
