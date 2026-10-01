/**
 * DTOs das respostas da API_Paineis (isomórfico: usado pelas rotas e pelas telas).
 *
 * Contêm apenas os campos exibidos pelas Telas_Paineis (Req. 2.10): nada de
 * descrições, valores de campos de cards, contatos de leads ou e-mails.
 * Datas são strings: instantes em ISO 8601 e dias em 'AAAA-MM-DD'.
 */
import type { Periodo } from './period';
import type {
  Conversion,
  LeadStatusCounts,
  RequestStatusCounts,
  TaskCounts,
} from './metrics';

export type { Conversion, LeadStatusCounts, RequestStatusCounts, TaskCounts };

export interface PersonBrief {
  id: string;
  name: string;
  avatar: string | null;
}

export interface UnitRef {
  code: string;
  name: string;
}

export type UnitType = 'DEPARTAMENTO' | 'SETOR';

/** Limites do Periodo aplicado (ISO 8601); `from` nulo em 'tudo'. */
export interface PeriodDTO {
  key: Periodo;
  from: string | null;
  to: string;
}

export interface OverdueTaskDTO {
  id: string;
  title: string;
  /** Dia_Prazo, 'AAAA-MM-DD'. */
  dueDate: string;
  assignee: PersonBrief | null;
  /** null = "Geral" (tarefa sem Unidade). */
  unit: UnitRef | null;
}

export interface PhaseCountDTO {
  id: string;
  name: string;
  order: number;
  isFinal: boolean;
  cards: number;
}

export interface PipeCountDTO {
  id: string;
  name: string;
  phases: PhaseCountDTO[];
}

export interface MemberCardGroupDTO {
  pipe: { id: string; name: string; unit: UnitRef };
  phases: PhaseCountDTO[];
}

export interface MemberSummaryDTO {
  user: PersonBrief;
  open: number;
  overdue: number;
  doneInPeriod: number;
}

export interface UnitRequestsDTO {
  received: RequestStatusCounts;
  sent: RequestStatusCounts;
  overdueReceived: number;
}

export interface SectorInfoDTO {
  manager: PersonBrief | null;
  activeMembers: number;
}

export interface LeadsByAssigneeDTO {
  /** null = "Sem responsável" (sempre a última linha). */
  assignee: PersonBrief | null;
  counts: LeadStatusCounts;
}

export interface UnitLeadsDTO {
  byStatus: LeadStatusCounts;
  conversion: Conversion;
  byAssignee: LeadsByAssigneeDTO[];
}

export interface UnitDashboardDTO {
  unit: UnitRef & { type: UnitType };
  /** Dia_Referencia, 'AAAA-MM-DD'. */
  referenceDate: string;
  period: PeriodDTO;
  tasks: TaskCounts;
  overdueTasks: OverdueTaskDTO[];
  pipes: PipeCountDTO[];
  /** Só em departamento (Req. 5.5). */
  requests: UnitRequestsDTO | null;
  /** Só em setor (Req. 5.4). */
  sector: SectorInfoDTO | null;
  /** Somente Resumos_Membro autorizados (Req. 7.3). */
  members: MemberSummaryDTO[];
  /** Só em Negócios (Req. 4.7). */
  leads: UnitLeadsDTO | null;
}

export type MemberScopeDTO = { kind: 'ALL' } | { kind: 'SECTORS'; sectors: UnitRef[] };

export interface MemberDashboardDTO {
  member: PersonBrief & { title: string; status: 'PENDENTE' | 'ATIVO' | 'INATIVO' };
  scope: MemberScopeDTO;
  referenceDate: string;
  period: PeriodDTO;
  tasks: TaskCounts;
  overdueTasks: OverdueTaskDTO[];
  cards: MemberCardGroupDTO[];
  /** null com escopo de setores (Req. 8.7). */
  requests: { open: number; overdue: number } | null;
  /** null com escopo de setores ou quando o Alvo não tem leads (Req. 8.6, 8.7). */
  leads: { byStatus: LeadStatusCounts } | null;
}

export interface HubDTO {
  me: { id: string };
  departments: UnitRef[];
  sectors: UnitRef[];
  /** null quando o Ator não é Presidência, Gerente de Departamento nem Gerente de Setor. */
  members: (PersonBrief & { title: string })[] | null;
}
