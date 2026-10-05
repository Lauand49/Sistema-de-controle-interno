/**
 * Rótulos e formatação dos painéis (isomórfico: sem imports de Node, Prisma ou `server-only`).
 */
import { normalizeText } from '@/lib/leads/text';
import type { Conversion, LeadStatus, RequestStatus } from './metrics';
import type { Periodo } from './period';

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  RAW: 'Importado',
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  CONVERTED_TO_PIPE: 'Convertido em card',
  DISCARDED: 'Descartado',
};

export const PERIOD_LABEL: Record<Periodo, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  tudo: 'Todo o período',
};

/** 'AAAA-MM-DD' → 'DD/MM/AAAA', só reordenando a string (sem `Date`, logo sem fuso). */
export function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Prazo (`dueDate`) vindo da API → 'DD/MM/AAAA'. O prazo é uma data sem horário gravada à meia-noite UTC;
 * `new Date(x).toLocaleDateString()` em São Paulo (UTC-3) mostraria o dia anterior. Usa só a parte de data.
 */
export function formatDueDate(iso: string): string {
  return formatDayKey(iso.slice(0, 10));
}

const intFormatter = new Intl.NumberFormat('pt-BR');

/** Número no formato pt-BR (separador de milhar "."). */
export function formatInt(n: number): string {
  return intFormatter.format(n);
}

/** '25% (5 de 20)'; quando não há denominador, '— (0 de 0)'. */
export function formatConversion(c: Conversion): string {
  const pct = c.percent === null ? '—' : `${c.percent}%`;
  return `${pct} (${formatInt(c.converted)} de ${formatInt(c.total)})`;
}

/** Busca sem caixa e sem acentos: normalizeText(name) contém normalizeText(query). */
export function matchesMemberSearch(name: string, query: string): boolean {
  return normalizeText(name).includes(normalizeText(query));
}
