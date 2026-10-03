/**
 * Geradores (fast-check) de pessoas e códigos de unidade para os testes dos painéis.
 */
import fc from 'fast-check';
import {
  DEPARTMENT_CODES,
  SECTORS,
  SECTOR_CODES,
  type DepartmentCode,
  type DepartmentRole,
  type GlobalRole,
  type Person,
  type SectorLink,
  type SectorRole,
  type UserStatus,
} from '@/lib/permissions';

/** Conjunto pequeno de ids: gera colisões (ator === alvo) com frequência. */
export const PERSON_IDS = ['u1', 'u2', 'u3', 'u4'] as const;

/** Os 9 códigos válidos (4 departamentos + 5 setores). */
export const VALID_UNIT_CODES: string[] = [...DEPARTMENT_CODES, ...SECTOR_CODES];

const SECTOR_NAME = new Map(SECTORS.map((s) => [s.code, s.name] as const));

export const arbPersonId = fc.constantFrom(...PERSON_IDS);
export const arbStatus = fc.constantFrom<UserStatus>('PENDENTE', 'ATIVO', 'INATIVO');
export const arbGlobalRole = fc.constantFrom<GlobalRole | null>(null, 'PRESIDENTE', 'VICE_PRESIDENTE');
export const arbDepartmentCode = fc.constantFrom<DepartmentCode | null>(null, ...DEPARTMENT_CODES);
export const arbDepartmentRole = fc.constantFrom<DepartmentRole | null>(null, 'GERENTE', 'ASSESSOR');

/** 0–5 vínculos de setor, sem repetir setor, com papel GERENTE/MEMBRO. */
export const arbSectorLinks: fc.Arbitrary<SectorLink[]> = fc.uniqueArray(
  fc.record({
    code: fc.constantFrom(...SECTOR_CODES),
    role: fc.constantFrom<SectorRole>('GERENTE', 'MEMBRO'),
  }),
  { maxLength: SECTOR_CODES.length, selector: (s) => s.code }
).map((links) => links.map((l) => ({ code: l.code, name: SECTOR_NAME.get(l.code)!, role: l.role })));

function personArb(status: fc.Arbitrary<UserStatus>): fc.Arbitrary<Person> {
  return fc.record({
    id: arbPersonId,
    status,
    globalRole: arbGlobalRole,
    departmentCode: arbDepartmentCode,
    departmentRole: arbDepartmentRole,
    sectors: arbSectorLinks,
  });
}

/** Pessoa qualquer (PENDENTE/ATIVO/INATIVO). */
export const arbPerson: fc.Arbitrary<Person> = personArb(arbStatus);

/** Pessoa com status ATIVO. */
export const arbActivePerson: fc.Arbitrary<Person> = personArb(fc.constant<UserStatus>('ATIVO'));

/** Troca a caixa de cada letra de forma aleatória (pode coincidir com o original). */
const arbCaseVariant: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...VALID_UNIT_CODES), fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }))
  .map(([code, flips]) =>
    code
      .split('')
      .map((ch, i) => (flips[i] ? ch.toLowerCase() : ch))
      .join('')
  );

/** Códigos válidos, variações de caixa (inclui minúsculas) e strings arbitrárias. */
export const arbUnitCodeish: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...VALID_UNIT_CODES),
  arbCaseVariant,
  fc.constantFrom(...VALID_UNIT_CODES).map((c) => c.toLowerCase()),
  fc.constantFrom('', ' ', 'GLOBAL', ' NEGOCIOS', 'NEGOCIOS ', 'TEC-SOFTWARE'),
  fc.string()
);
