/**
 * Testes unitários das regras de acesso aos painéis (lib/permissions.ts).
 * **Validates: Requirements 12.3, 1.3, 1.4, 1.5, 1.6, 1.7, 7.4**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canSeeMemberSummary,
  canViewMemberDashboard,
  canViewUnitDashboard,
  isUnitCode,
  progressScope,
  type Person,
  type SectorLink,
} from '@/lib/permissions';
import { VALID_UNIT_CODES, arbActivePerson, arbPerson, arbUnitCodeish } from './support/arb-person';

// ─────────────────────────────── Fixtures ───────────────────────────────

const TEC_GERENTE: SectorLink = { code: 'TEC_SOFTWARE', name: 'Tecnologia e Software', role: 'GERENTE' };
const TEC_MEMBRO: SectorLink = { code: 'TEC_SOFTWARE', name: 'Tecnologia e Software', role: 'MEMBRO' };
const DESIGN_MEMBRO: SectorLink = { code: 'DESIGN_CONCEPCAO', name: 'Design e Concepção', role: 'MEMBRO' };

function person(overrides: Partial<Person> & { id: string }): Person {
  return {
    status: 'ATIVO',
    globalRole: null,
    departmentCode: null,
    departmentRole: null,
    sectors: [],
    ...overrides,
  };
}

const presidente = person({ id: 'pres', globalRole: 'PRESIDENTE' });
const vice = person({ id: 'vice', globalRole: 'VICE_PRESIDENTE' });
/** Gerente de Departamento de Negócios, sem vínculo com setores. */
const gdNegocios = person({ id: 'gd-neg', departmentCode: 'NEGOCIOS', departmentRole: 'GERENTE' });
/** Gerente de Setor de TEC_SOFTWARE, assessor em Mídias. */
const gsTec = person({
  id: 'gs-tec',
  departmentCode: 'MIDIAS',
  departmentRole: 'ASSESSOR',
  sectors: [TEC_GERENTE],
});
/** Assessor de Negócios sem setor. */
const assessorSemSetor = person({ id: 'as-neg', departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' });
/** Assessor de Negócios membro de TEC_SOFTWARE. */
const assessorComSetor = person({
  id: 'as-neg-tec',
  departmentCode: 'NEGOCIOS',
  departmentRole: 'ASSESSOR',
  sectors: [TEC_MEMBRO],
});
/** Membro de outro departamento (Gente) que participa de TEC_SOFTWARE e DESIGN_CONCEPCAO. */
const membroGenteTec = person({
  id: 'gente-tec',
  departmentCode: 'GENTE',
  departmentRole: 'ASSESSOR',
  sectors: [TEC_MEMBRO, DESIGN_MEMBRO],
});
/** Membro de AdmJurFin sem setores. */
const membroAdm = person({ id: 'adm', departmentCode: 'ADMJURFIN', departmentRole: 'ASSESSOR' });

const everyone = [
  presidente,
  vice,
  gdNegocios,
  gsTec,
  assessorSemSetor,
  assessorComSetor,
  membroGenteTec,
  membroAdm,
];

// ─────────────────────────────── canViewUnitDashboard ───────────────────────────────

describe('canViewUnitDashboard', () => {
  it.each([
    ['Presidente', presidente],
    ['Vice-presidente', vice],
  ])('%s vê todos os 9 painéis de unidade', (_label, p) => {
    for (const code of VALID_UNIT_CODES) expect(canViewUnitDashboard(p, code)).toBe(true);
  });

  it('Gerente de Departamento vê o próprio departamento e nenhum outro', () => {
    expect(canViewUnitDashboard(gdNegocios, 'NEGOCIOS')).toBe(true);
    expect(canViewUnitDashboard(gdNegocios, 'MIDIAS')).toBe(false);
    expect(canViewUnitDashboard(gdNegocios, 'ADMJURFIN')).toBe(false);
  });

  it('Gerente de Departamento de Negócios não vê TEC_SOFTWARE sem vínculo', () => {
    expect(canViewUnitDashboard(gdNegocios, 'TEC_SOFTWARE')).toBe(false);
    expect(canViewUnitDashboard(gdNegocios, 'DADOS_INTELIGENCIA')).toBe(false);
  });

  it('Gerente de Setor vê o setor que gerencia e o próprio departamento', () => {
    expect(canViewUnitDashboard(gsTec, 'TEC_SOFTWARE')).toBe(true);
    expect(canViewUnitDashboard(gsTec, 'MIDIAS')).toBe(true);
    expect(canViewUnitDashboard(gsTec, 'NEGOCIOS')).toBe(false);
    expect(canViewUnitDashboard(gsTec, 'ENG_INOVACAO')).toBe(false);
  });

  it('Assessor sem setor vê só o próprio departamento', () => {
    expect(canViewUnitDashboard(assessorSemSetor, 'NEGOCIOS')).toBe(true);
    expect(canViewUnitDashboard(assessorSemSetor, 'GENTE')).toBe(false);
    expect(canViewUnitDashboard(assessorSemSetor, 'TEC_SOFTWARE')).toBe(false);
  });

  it('Assessor com setor vê o próprio departamento e o setor do qual participa', () => {
    expect(canViewUnitDashboard(assessorComSetor, 'NEGOCIOS')).toBe(true);
    expect(canViewUnitDashboard(assessorComSetor, 'TEC_SOFTWARE')).toBe(true);
    expect(canViewUnitDashboard(assessorComSetor, 'DESIGN_CONCEPCAO')).toBe(false);
  });

  it('códigos inválidos (minúsculas, espaços, arbitrários) retornam falso mesmo para a Presidência', () => {
    for (const code of ['negocios', 'Tec_Software', ' NEGOCIOS', 'NEGOCIOS ', '', 'GLOBAL', 'xyz']) {
      expect(canViewUnitDashboard(presidente, code)).toBe(false);
      expect(canViewUnitDashboard(gdNegocios, code)).toBe(false);
    }
  });

  it('ator ausente não vê nada', () => {
    expect(canViewUnitDashboard(null, 'NEGOCIOS')).toBe(false);
    expect(canViewUnitDashboard(undefined, 'TEC_SOFTWARE')).toBe(false);
  });
});

// ─────────────────────────────── canViewMemberDashboard ───────────────────────────────

describe('canViewMemberDashboard', () => {
  it.each([
    ['Presidente', presidente],
    ['Vice-presidente', vice],
  ])('%s vê o painel de qualquer membro', (_label, p) => {
    for (const target of everyone) expect(canViewMemberDashboard(p, target)).toBe(true);
  });

  it('todo usuário ativo vê o próprio painel com escopo ALL', () => {
    for (const p of everyone) {
      expect(canViewMemberDashboard(p, p)).toBe(true);
      expect(progressScope(p, p)).toBe('ALL');
    }
  });

  it('Gerente de Departamento vê membros do próprio departamento com escopo ALL', () => {
    expect(canViewMemberDashboard(gdNegocios, assessorSemSetor)).toBe(true);
    expect(progressScope(gdNegocios, assessorComSetor)).toBe('ALL');
    expect(canViewMemberDashboard(gdNegocios, membroAdm)).toBe(false);
    expect(canViewMemberDashboard(gdNegocios, membroGenteTec)).toBe(false);
  });

  it("Gerente de Setor tem escopo ['TEC_SOFTWARE'] sobre membro de outro departamento", () => {
    expect(canViewMemberDashboard(gsTec, membroGenteTec)).toBe(true);
    expect(progressScope(gsTec, membroGenteTec)).toEqual(['TEC_SOFTWARE']);
    expect(progressScope(gsTec, assessorComSetor)).toEqual(['TEC_SOFTWARE']);
  });

  it('Gerente de Setor não vê quem não participa do setor que gerencia', () => {
    expect(canViewMemberDashboard(gsTec, assessorSemSetor)).toBe(false);
    expect(canViewMemberDashboard(gsTec, membroAdm)).toBe(false);
  });

  it('Assessor (com ou sem setor) só vê o próprio painel', () => {
    for (const actor of [assessorSemSetor, assessorComSetor]) {
      for (const target of everyone) {
        expect(canViewMemberDashboard(actor, target)).toBe(target.id === actor.id);
      }
    }
  });
});

// ─────────────────────────────── Conta não ativa ───────────────────────────────

describe('PENDENTE e INATIVO', () => {
  it.each(['PENDENTE', 'INATIVO'] as const)('%s não acessa nenhum painel, nem com cargo', (status) => {
    for (const base of [presidente, vice, gdNegocios, gsTec, assessorComSetor]) {
      const p = { ...base, status };
      for (const code of VALID_UNIT_CODES) expect(canViewUnitDashboard(p, code)).toBe(false);
      for (const target of everyone) {
        expect(canViewMemberDashboard(p, target)).toBe(false);
        expect(canSeeMemberSummary(p, target, 'NEGOCIOS')).toBe(false);
      }
      expect(canViewMemberDashboard(p, p)).toBe(false);
    }
  });
});

// ─────────────────────────────── canSeeMemberSummary ───────────────────────────────

describe('canSeeMemberSummary', () => {
  it('Assessor vê só o próprio Resumo_Membro no painel de departamento e de setor', () => {
    expect(canSeeMemberSummary(assessorComSetor, assessorComSetor, 'NEGOCIOS')).toBe(true);
    expect(canSeeMemberSummary(assessorComSetor, assessorComSetor, 'TEC_SOFTWARE')).toBe(true);
    expect(canSeeMemberSummary(assessorComSetor, assessorSemSetor, 'NEGOCIOS')).toBe(false);
    expect(canSeeMemberSummary(assessorComSetor, gdNegocios, 'NEGOCIOS')).toBe(false);
    expect(canSeeMemberSummary(assessorComSetor, gsTec, 'TEC_SOFTWARE')).toBe(false);
    expect(canSeeMemberSummary(assessorComSetor, membroGenteTec, 'TEC_SOFTWARE')).toBe(false);
  });

  it('Gerente de Setor não vê Resumos_Membro de outros no painel de departamento', () => {
    const colegaMidiasTec = person({
      id: 'midias-tec',
      departmentCode: 'MIDIAS',
      departmentRole: 'ASSESSOR',
      sectors: [TEC_MEMBRO],
    });
    const colegaMidias = person({ id: 'midias', departmentCode: 'MIDIAS', departmentRole: 'ASSESSOR' });
    expect(canSeeMemberSummary(gsTec, colegaMidiasTec, 'MIDIAS')).toBe(false);
    expect(canSeeMemberSummary(gsTec, colegaMidias, 'MIDIAS')).toBe(false);
    // no painel do setor que gerencia, vê o mesmo membro
    expect(canSeeMemberSummary(gsTec, colegaMidiasTec, 'TEC_SOFTWARE')).toBe(true);
  });

  it('Gerente de Setor vê o resumo de membro de outro departamento só no setor gerenciado', () => {
    expect(canSeeMemberSummary(gsTec, membroGenteTec, 'TEC_SOFTWARE')).toBe(true);
    expect(canSeeMemberSummary(gsTec, membroGenteTec, 'DESIGN_CONCEPCAO')).toBe(false);
    expect(canSeeMemberSummary(gsTec, membroGenteTec, 'GENTE')).toBe(false);
  });

  it('Gerente de Departamento e Presidência veem os resumos da unidade', () => {
    expect(canSeeMemberSummary(gdNegocios, assessorSemSetor, 'NEGOCIOS')).toBe(true);
    expect(canSeeMemberSummary(presidente, membroGenteTec, 'TEC_SOFTWARE')).toBe(true);
    expect(canSeeMemberSummary(vice, membroAdm, 'ADMJURFIN')).toBe(true);
  });
});

// ─────────────────────────────── Geradores compartilhados ───────────────────────────────

describe('support/arb-person', () => {
  it('arbUnitCodeish produz códigos válidos e inválidos', () => {
    const samples = fc.sample(arbUnitCodeish, { numRuns: 500, seed: 42 });
    expect(samples.some((c) => isUnitCode(c))).toBe(true);
    expect(samples.some((c) => !isUnitCode(c))).toBe(true);
  });

  it('arbPerson gera os três status e arbActivePerson só ATIVO, sem setores repetidos', () => {
    const people = fc.sample(arbPerson, { numRuns: 300, seed: 7 });
    expect(new Set(people.map((p) => p.status))).toEqual(new Set(['PENDENTE', 'ATIVO', 'INATIVO']));
    for (const p of fc.sample(arbActivePerson, { numRuns: 200, seed: 7 })) {
      expect(p.status).toBe('ATIVO');
      expect(new Set(p.sectors.map((s) => s.code)).size).toBe(p.sectors.length);
    }
  });
});
