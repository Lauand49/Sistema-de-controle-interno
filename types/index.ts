import type { DepartmentCode, Person, PersonType } from '@/lib/permissions';

export type FieldType = 'TEXT' | 'NUMBER' | 'CURRENCY' | 'DATE' | 'SELECT' | 'TEXTAREA';

/** Departamento ou 'GLOBAL' (Presidência / itens gerais). */
export type Department = DepartmentCode | 'GLOBAL';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';

/** Usuário como retornado pelas APIs (inclui a hierarquia). */
export interface User extends Person {
  name: string;
  email: string;
  avatar?: string | null;
  cargo?: string | null;
  personType: PersonType;
  /** Título legível: "Gerente de Negócios", "Presidente"... */
  title: string;
  lastLoginAt?: string | null;
  createdAt?: string;
  _count?: {
    assignedCards?: number;
    assignedLeads?: number;
    assignedTasks?: number;
  };
}

/** Título de exibição de um usuário (aceita objetos parciais vindos de relações). */
export function getUserCargoTitle(user: { title?: string; cargo?: string | null }): string {
  if (user.cargo && user.cargo.trim()) return user.cargo;
  return user.title || 'Membro';
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string | null;
  department?: string | null;
  assigneeId?: string | null;
  assignee?: User | null;
  leadId?: string | null;
  cardId?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Field {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  options?: string | null; // JSON formatted string array
  required: boolean;
  order: number;
  phaseId: string;
}

export interface CardFieldValue {
  id: string;
  cardId: string;
  fieldId: string;
  value?: string | null;
  field: Field;
}

export interface CardActivity {
  id: string;
  cardId: string;
  userId?: string | null;
  user?: User | null;
  type: 'PHASE_CHANGE' | 'CARD_CREATED' | 'FIELD_UPDATED' | 'COMMENT';
  description: string;
  metadata?: string | null;
  createdAt: string;
}

export interface Card {
  id: string;
  title: string;
  description?: string | null;
  order: number;
  phaseId: string;
  phase?: Phase;
  assigneeId?: string | null;
  assignee?: User | null;
  values: CardFieldValue[];
  activities: CardActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface Phase {
  id: string;
  name: string;
  order: number;
  pipeId: string;
  isFinal: boolean;
  color?: string | null;
  fields: Field[];
  cards: Card[];
}

export interface Pipe {
  id: string;
  name: string;
  description?: string | null;
  department?: Department | string;
  icon?: string | null;
  phases: Phase[];
}

export interface PhaseGateError {
  error: string;
  message: string;
  missingFields: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    options?: string | null;
  }>;
  targetPhaseId: string;
  targetPhaseName: string;
  currentPhaseId: string;
}

// Module "Ferramentas": Lead Prospecting & Triage Types
export type LeadProspectStatus = 'RAW' | 'PENDING' | 'IN_PROGRESS' | 'CONVERTED_TO_PIPE' | 'DISCARDED';

export interface ProspectLead {
  id: string;
  companyName: string;
  contactName?: string | null;
  contactInfo?: string | null;
  actionPlan: string;
  notes?: string | null;
  segment?: string | null;
  status: LeadProspectStatus;
  batchId?: string | null;
  pipeCardId?: string | null;
  pipeCard?: {
    id: string;
    title: string;
    phaseId: string;
    phaseName: string;
    phaseColor?: string | null;
    meetingDate?: string | null;
    assigneeName?: string | null;
  } | null;
  assignedTo?: string | null;
  assignedUser?: User | null;
  createdAt: string;
  updatedAt: string;
}

// Solicitações Intersetoriais
export interface CrossDeptRequest {
  id: string;
  title: string;
  description: string;
  fromDept: Department | string;
  toDept: Department | string;
  status: RequestStatus | string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | string;
  requesterId: string;
  requester?: User;
  handlerId?: string | null;
  handler?: User | null;
  linkedCardId?: string | null;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

// AdmJurFin: Transações Financeiras
export interface FinancialTransaction {
  id: string;
  description: string;
  amount: number;
  type: 'INFLOW' | 'OUTFLOW';
  category: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  invoiceUrl?: string | null;
  relatedCardId?: string | null;
  dueDate?: string | null;
  paymentDate?: string | null;
  createdAt: string;
}
