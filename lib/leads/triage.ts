/**
 * Montagem do Lead_de_Triagem a partir de uma Empresa minerada (Req. 15.1, 15.2, 15.6).
 *
 * Função pura: não acessa banco nem rede. O resultado é passado direto para
 * `prisma.prospectLead.createMany` / `createManyAndReturn` com `skipDuplicates`
 * sobre o índice único de `companyId`.
 */
import type { Prisma } from '@prisma/client';
import { ACTION_PLAN_BY_CATEGORY, ACTION_PLAN_DEFAULT, NICHES } from './config';
import type { CategoryCode } from './types';

/** Campos da Empresa necessários para montar o lead de triagem. */
export interface TriageSource {
  id: string;
  nome: string;
  /** Id do nicho (`lib/leads/config.ts`). */
  nicho: string;
  telefone: string | null;
  website: string | null;
  categoria: CategoryCode | null;
  assignedTo: string | null;
}

const NICHE_LABEL: ReadonlyMap<string, string> = new Map(NICHES.map((n) => [n.id, n.label]));

/** Telefone e website não vazios, nessa ordem, unidos por " | "; null se ambos vazios. */
function buildContactInfo(telefone: string | null, website: string | null): string | null {
  const parts = [telefone, website]
    .map((v) => v?.trim() ?? '')
    .filter((v) => v.length > 0);
  return parts.length > 0 ? parts.join(' | ') : null;
}

export function buildTriageLead(c: TriageSource): Prisma.ProspectLeadCreateManyInput {
  return {
    status: 'RAW',
    companyId: c.id,
    companyName: c.nome,
    contactInfo: buildContactInfo(c.telefone, c.website),
    // Fallback para o id se o nicho não estiver mais no catálogo.
    segment: NICHE_LABEL.get(c.nicho) ?? c.nicho,
    actionPlan: c.categoria ? ACTION_PLAN_BY_CATEGORY[c.categoria] : ACTION_PLAN_DEFAULT,
    assignedTo: c.assignedTo ?? null,
  };
}
