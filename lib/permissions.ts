/**
 * Matriz de permissões da SciTec jr. — FONTE ÚNICA.
 *
 * Este arquivo é isomórfico (sem Prisma, sem APIs do Node): é usado pelas rotas de API
 * no servidor (decisão real) e pela interface (apenas para esconder/mostrar ações).
 * Qualquer mudança de regra deve acontecer aqui.
 *
 * Referência: docs/PLANO-INTEGRACAO.md, seção 4.
 */

// ─────────────────────────────── Unidades ───────────────────────────────

export const DEPARTMENTS = [
  { code: 'NEGOCIOS', name: 'Negócios' },
  { code: 'ADMJURFIN', name: 'AdmJurFin' },
  { code: 'GENTE', name: 'Gente' },
  { code: 'MIDIAS', name: 'Mídias' },
] as const;

export const SECTORS = [
  { code: 'TEC_SOFTWARE', name: 'Tecnologia e Software' },
  { code: 'ENG_INOVACAO', name: 'Engenharia e Inovação' },
  { code: 'DESIGN_CONCEPCAO', name: 'Design e Concepção' },
  { code: 'CIENCIA_CONSULTORIA', name: 'Ciência e Consultoria' },
  { code: 'DADOS_INTELIGENCIA', name: 'Dados e Inteligência' },
] as const;

export type DepartmentCode = (typeof DEPARTMENTS)[number]['code'];
export type SectorCode = (typeof SECTORS)[number]['code'];
export type UnitCode = DepartmentCode | SectorCode;

export const DEPARTMENT_CODES = DEPARTMENTS.map((d) => d.code) as DepartmentCode[];
export const SECTOR_CODES = SECTORS.map((s) => s.code) as SectorCode[];

export function isDepartmentCode(code: string | null | undefined): code is DepartmentCode {
  return !!code && (DEPARTMENT_CODES as string[]).includes(code);
}

export function isSectorCode(code: string | null | undefined): code is SectorCode {
  return !!code && (SECTOR_CODES as string[]).includes(code);
}

export function isUnitCode(code: string | null | undefined): code is UnitCode {
  return isDepartmentCode(code) || isSectorCode(code);
}

export function unitName(code: string | null | undefined): string {
  if (!code) return 'Geral';
  const found = [...DEPARTMENTS, ...SECTORS].find((u) => u.code === code);
  return found ? found.name : code === 'GLOBAL' ? 'Presidência' : code;
}

// ─────────────────────────────── Pessoas ───────────────────────────────

export type GlobalRole = 'PRESIDENTE' | 'VICE_PRESIDENTE';
export type UserStatus = 'PENDENTE' | 'ATIVO' | 'INATIVO';
export type DepartmentRole = 'GERENTE' | 'ASSESSOR';
export type SectorRole = 'GERENTE' | 'MEMBRO';

export interface SectorLink {
  code: SectorCode;
  name: string;
  role: SectorRole;
}

/** Forma mínima de uma pessoa usada pelas regras (servidor e interface). */
export interface Person {
  id: string;
  status: UserStatus;
  globalRole: GlobalRole | null;
  departmentCode: DepartmentCode | null;
  departmentRole: DepartmentRole | null;
  sectors: SectorLink[];
}

export type PersonType =
  | 'PRESIDENTE'
  | 'VICE_PRESIDENTE'
  | 'GERENTE_DEPARTAMENTO'
  | 'GERENTE_SETOR'
  | 'ASSESSOR';

export const PERSON_TYPE_LABEL: Record<PersonType, string> = {
  PRESIDENTE: 'Presidente',
  VICE_PRESIDENTE: 'Vice-presidente',
  GERENTE_DEPARTAMENTO: 'Gerente de Departamento',
  GERENTE_SETOR: 'Gerente de Setor',
  ASSESSOR: 'Assessor',
};

export function isGlobal(p: Person | null | undefined): boolean {
  return !!p && p.status === 'ATIVO' && p.globalRole !== null;
}

export function isPresident(p: Person | null | undefined): boolean {
  return !!p && p.status === 'ATIVO' && p.globalRole === 'PRESIDENTE';
}

export function isActive(p: Person | null | undefined): boolean {
  return !!p && p.status === 'ATIVO';
}

export function isDepartmentManager(p: Person | null | undefined): boolean {
  return isActive(p) && !!p!.departmentCode && p!.departmentRole === 'GERENTE';
}

export function managedSectors(p: Person | null | undefined): SectorCode[] {
  if (!isActive(p)) return [];
  return p!.sectors.filter((s) => s.role === 'GERENTE').map((s) => s.code);
}

export function isSectorManager(p: Person | null | undefined): boolean {
  return managedSectors(p).length > 0;
}

/** O "tipo" exibido é o mais alto que a pessoa tem. */
export function personType(p: Person): PersonType {
  if (p.globalRole === 'PRESIDENTE') return 'PRESIDENTE';
  if (p.globalRole === 'VICE_PRESIDENTE') return 'VICE_PRESIDENTE';
  if (p.departmentCode && p.departmentRole === 'GERENTE') return 'GERENTE_DEPARTAMENTO';
  if (p.sectors.some((s) => s.role === 'GERENTE')) return 'GERENTE_SETOR';
  return 'ASSESSOR';
}

/** Título legível: "Gerente de Negócios", "Assessor(a) de Mídias", "Presidente"... */
export function personTitle(p: Person & { cargo?: string | null }): string {
  if (p.cargo && p.cargo.trim()) return p.cargo.trim();
  const type = personType(p);
  const dept = p.departmentCode ? unitName(p.departmentCode) : null;
  switch (type) {
    case 'PRESIDENTE':
    case 'VICE_PRESIDENTE':
      return PERSON_TYPE_LABEL[type];
    case 'GERENTE_DEPARTAMENTO':
      return `Gerente de ${dept}`;
    case 'GERENTE_SETOR': {
      const sectors = p.sectors.filter((s) => s.role === 'GERENTE').map((s) => s.name);
      return `Gerente de ${sectors.join(', ')}`;
    }
    default:
      return dept ? `Assessor(a) de ${dept}` : 'Assessor(a)';
  }
}

// ─────────────────────────────── Unidades: acesso ───────────────────────────────

export function isUnitManager(p: Person | null | undefined, unitCode: string): boolean {
  if (!isActive(p)) return false;
  if (isDepartmentCode(unitCode)) {
    return p!.departmentCode === unitCode && p!.departmentRole === 'GERENTE';
  }
  if (isSectorCode(unitCode)) {
    return p!.sectors.some((s) => s.code === unitCode && s.role === 'GERENTE');
  }
  return false;
}

export function isUnitMember(p: Person | null | undefined, unitCode: string): boolean {
  if (!isActive(p)) return false;
  if (isDepartmentCode(unitCode)) return p!.departmentCode === unitCode;
  if (isSectorCode(unitCode)) return p!.sectors.some((s) => s.code === unitCode);
  return false;
}

/**
 * Ver painel/funis/tarefas de uma unidade.
 * Presidência: tudo. Demais: o próprio departamento e os setores dos quais participa.
 */
export function canViewUnit(p: Person | null | undefined, unitCode: string): boolean {
  if (isGlobal(p)) return true;
  return isUnitMember(p, unitCode);
}

/**
 * Criar/editar/mover itens (cards, tarefas, campos, funis) de uma unidade.
 * Hoje igual a canViewUnit: quem participa da unidade trabalha nela.
 */
export function canEditUnit(p: Person | null | undefined, unitCode: string): boolean {
  return canViewUnit(p, unitCode);
}

/** Códigos das unidades que a pessoa pode ver (null = todas). */
export function visibleUnitCodes(p: Person | null | undefined): UnitCode[] | null {
  if (isGlobal(p)) return null;
  if (!isActive(p)) return [];
  const codes: UnitCode[] = [];
  if (p!.departmentCode) codes.push(p!.departmentCode);
  for (const s of p!.sectors) codes.push(s.code);
  return codes;
}

// ─────────────────────────────── Gestão de pessoas ───────────────────────────────

/** Nomear/remover Vice-presidente. */
export function canManageVice(actor: Person | null | undefined): boolean {
  return isPresident(actor);
}

/** Nomear/remover Gerentes (departamento e setor). */
export function canManageManagers(actor: Person | null | undefined): boolean {
  return isGlobal(actor);
}

/** Ver a fila de usuários pendentes de aprovação. */
export function canViewPendingUsers(actor: Person | null | undefined): boolean {
  return isGlobal(actor) || isDepartmentManager(actor);
}

/** Aprovar um pendente colocando-o no departamento informado. */
export function canApproveUserInto(actor: Person | null | undefined, departmentCode: string): boolean {
  if (!isDepartmentCode(departmentCode)) return false;
  if (isGlobal(actor)) return true;
  return isUnitManager(actor, departmentCode);
}

/** Transferir um membro ativo de departamento. */
export function canChangeDepartment(actor: Person | null | undefined): boolean {
  return isGlobal(actor);
}

/** Adicionar/remover membros de um setor. */
export function canManageSectorMembers(actor: Person | null | undefined, sectorCode: string): boolean {
  if (!isSectorCode(sectorCode)) return false;
  if (isGlobal(actor)) return true;
  return isUnitManager(actor, sectorCode);
}

/** Desativar (ou reativar) a conta de alguém. */
export function canDeactivate(actor: Person | null | undefined, target: Person): boolean {
  if (!isActive(actor) || actor!.id === target.id) return false;
  if (target.globalRole === 'PRESIDENTE') return false;
  if (target.globalRole === 'VICE_PRESIDENTE') return isPresident(actor);
  if (isGlobal(actor)) return true;
  return (
    isDepartmentManager(actor) &&
    !!target.departmentCode &&
    target.departmentCode === actor!.departmentCode
  );
}

/** Editar dados básicos (nome, avatar, cargo exibido). */
export function canEditProfile(actor: Person | null | undefined, target: Person): boolean {
  if (!isActive(actor)) return false;
  return actor!.id === target.id || isGlobal(actor);
}

/** Ver o log de auditoria (a rota ainda filtra pelo escopo). */
export function canViewAudit(actor: Person | null | undefined): boolean {
  return isGlobal(actor) || isDepartmentManager(actor) || isSectorManager(actor);
}

/**
 * Escopo do progresso individual de `target` visível para `actor`:
 *  - 'ALL'      → tudo da pessoa
 *  - UnitCode[] → apenas atividades ligadas a esses setores (Gerente de Setor)
 *  - null       → sem acesso
 */
export function progressScope(
  actor: Person | null | undefined,
  target: Person
): 'ALL' | SectorCode[] | null {
  if (!isActive(actor)) return null;
  if (isGlobal(actor) || actor!.id === target.id) return 'ALL';
  if (
    isDepartmentManager(actor) &&
    !!target.departmentCode &&
    target.departmentCode === actor!.departmentCode
  ) {
    return 'ALL';
  }
  const shared = managedSectors(actor).filter((code) => target.sectors.some((s) => s.code === code));
  return shared.length > 0 ? shared : null;
}

/**
 * Ver o último acesso de `target`. Mesmo alcance do progresso individual completo
 * (o próprio, Presidência, Gerente do departamento dele); os demais recebem `null`.
 */
export function canSeeLastLogin(actor: Person | null | undefined, target: Person): boolean {
  return progressScope(actor, target) === 'ALL';
}

// ─────────────────────────────── Painéis (dashboards) ───────────────────────────────

/** Painel de unidade: mesmo critério de canViewUnit, restrito a códigos válidos (Req. 1.1). */
export function canViewUnitDashboard(p: Person | null | undefined, unitCode: string): boolean {
  return isUnitCode(unitCode) && canViewUnit(p, unitCode);
}

/** Painel de membro: existe algum Escopo_Progresso (Req. 1.2). */
export function canViewMemberDashboard(actor: Person | null | undefined, target: Person): boolean {
  return progressScope(actor, target) !== null;
}

/** Resumo_Membro de `target` no painel da unidade `unitCode` (Req. 7.3). */
export function canSeeMemberSummary(
  actor: Person | null | undefined,
  target: Person,
  unitCode: string
): boolean {
  const scope = progressScope(actor, target);
  if (scope === null) return false;
  return scope === 'ALL' || (scope as string[]).includes(unitCode);
}

// ─────────────────────────────── Negócios / Leads ───────────────────────────────

/** Ferramentas de Negócios (leads, triagem, precificação, minerador). */
export function canUseNegociosTools(p: Person | null | undefined): boolean {
  return isGlobal(p) || (isActive(p) && p!.departmentCode === 'NEGOCIOS');
}

/** Atribuir leads a outras pessoas. */
export function canAssignLeads(p: Person | null | undefined): boolean {
  return isGlobal(p) || isUnitManager(p, 'NEGOCIOS');
}

/** Quem pode ser responsável por um lead/card de lead. */
export function canBeLeadAssignee(p: Person | null | undefined): boolean {
  return isGlobal(p) || (isActive(p) && p!.departmentCode === 'NEGOCIOS');
}

/** Editar um lead (triagem, anotações, status). */
export function canEditLead(p: Person | null | undefined, lead: { assignedTo: string | null }): boolean {
  if (!canUseNegociosTools(p)) return false;
  if (canAssignLeads(p)) return true;
  return !lead.assignedTo || lead.assignedTo === p!.id;
}

/**
 * Mudança de responsável de um lead.
 * Quem não pode atribuir só pode assumir um lead sem dono ou liberar o próprio.
 */
export function canChangeLeadAssignee(
  p: Person | null | undefined,
  current: string | null,
  next: string | null
): boolean {
  if (current === next) return true;
  if (canAssignLeads(p)) return true;
  if (!canUseNegociosTools(p)) return false;
  const assumindo = current === null && next === p!.id;
  const liberando = current === p!.id && next === null;
  return assumindo || liberando;
}

/** Excluir leads definitivamente. */
export function canDeleteLead(p: Person | null | undefined): boolean {
  return canAssignLeads(p);
}

// ─────────────────────────────── AdmJurFin ───────────────────────────────

export function canAccessFinance(p: Person | null | undefined): boolean {
  return canViewUnit(p, 'ADMJURFIN');
}

// ─────────────────────────────── Solicitações intersetoriais ───────────────────────────────

interface RequestLike {
  requesterId: string;
  handlerId: string | null;
  fromDept: string;
  toDept: string;
}

export function canViewRequest(p: Person | null | undefined, r: RequestLike): boolean {
  if (isGlobal(p)) return true;
  if (!isActive(p)) return false;
  return (
    r.requesterId === p!.id ||
    r.handlerId === p!.id ||
    (!!p!.departmentCode && (p!.departmentCode === r.fromDept || p!.departmentCode === r.toDept))
  );
}

/** Atender a solicitação (status, responsável, prioridade). */
export function canHandleRequest(p: Person | null | undefined, r: RequestLike): boolean {
  if (isGlobal(p)) return true;
  return isActive(p) && p!.departmentCode === r.toDept;
}

/** Editar título/descrição/prazo. */
export function canEditRequestContent(p: Person | null | undefined, r: RequestLike): boolean {
  return canHandleRequest(p, r) || (isActive(p) && r.requesterId === p!.id);
}

export function canDeleteRequest(p: Person | null | undefined, r: RequestLike): boolean {
  if (isGlobal(p)) return true;
  if (!isActive(p)) return false;
  return r.requesterId === p!.id || isUnitManager(p, r.toDept);
}

// ─────────────────────────────── Tarefas ───────────────────────────────

interface TaskLike {
  unitCode: string | null;
  assigneeId: string | null;
}

export function canEditTask(p: Person | null | undefined, t: TaskLike): boolean {
  if (isGlobal(p)) return true;
  if (!isActive(p)) return false;
  if (t.assigneeId === p!.id) return true;
  return !!t.unitCode && canEditUnit(p, t.unitCode);
}
