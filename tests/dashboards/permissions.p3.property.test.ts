// Feature: dashboards, Property 3: Conta não ativa não vê painel
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  canSeeMemberSummary,
  canViewMemberDashboard,
  canViewUnitDashboard,
  type Person,
  type UserStatus,
} from '@/lib/permissions';
import { arbPerson, arbUnitCodeish } from './support/arb-person';

/** Pessoa com quaisquer cargos, mas status PENDENTE ou INATIVO. */
const arbInactivePerson: fc.Arbitrary<Person> = fc
  .tuple(arbPerson, fc.constantFrom<UserStatus>('PENDENTE', 'INATIVO'))
  .map(([p, status]) => ({ ...p, status }));

describe('Property 3: Conta não ativa não vê painel', () => {
  /** **Validates: Requirements 1.7** */
  it('ator PENDENTE/INATIVO não vê painel de unidade, de membro nem Resumo_Membro', () => {
    fc.assert(
      fc.property(arbInactivePerson, arbPerson, arbUnitCodeish, (actor, target, code) => {
        expect(canViewUnitDashboard(actor, code)).toBe(false);
        expect(canViewMemberDashboard(actor, target)).toBe(false);
        expect(canSeeMemberSummary(actor, target, code)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
