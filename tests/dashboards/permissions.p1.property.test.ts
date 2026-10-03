// Feature: dashboards, Property 1: Acesso ao painel de unidade
/**
 * Property 1: Acesso ao painel de unidade.
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  SECTOR_CODES,
  canViewUnit,
  canViewUnitDashboard,
  isUnitCode,
  type GlobalRole,
  type Person,
} from '@/lib/permissions';
import { VALID_UNIT_CODES, arbActivePerson, arbPerson, arbUnitCodeish } from './support/arb-person';

describe('Property 1: Acesso ao painel de unidade', () => {
  it('canViewUnitDashboard(p, code) === isUnitCode(code) && canViewUnit(p, code)', () => {
    fc.assert(
      fc.property(arbPerson, arbUnitCodeish, (p, code) => {
        expect(canViewUnitDashboard(p, code)).toBe(isUnitCode(code) && canViewUnit(p, code));
      }),
      { numRuns: 100 }
    );
  });

  it('Presidência ativa vê o painel de todo código válido', () => {
    fc.assert(
      fc.property(
        arbActivePerson,
        fc.constantFrom<GlobalRole>('PRESIDENTE', 'VICE_PRESIDENTE'),
        fc.constantFrom(...VALID_UNIT_CODES),
        (base, role, code) => {
          const p: Person = { ...base, globalRole: role };
          expect(canViewUnitDashboard(p, code)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sem Presidência, setor sem vínculo não é visível (inclusive Gerente de Departamento)', () => {
    fc.assert(
      fc.property(
        arbPerson,
        fc.constantFrom(...SECTOR_CODES),
        fc.boolean(),
        (base, sector, forceDeptManager) => {
          const p: Person = {
            ...base,
            globalRole: null,
            departmentCode: forceDeptManager ? base.departmentCode ?? 'NEGOCIOS' : base.departmentCode,
            departmentRole: forceDeptManager ? 'GERENTE' : base.departmentRole,
            sectors: base.sectors.filter((s) => s.code !== sector),
          };
          expect(canViewUnitDashboard(p, sector)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
