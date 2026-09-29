/**
 * Funções puras do Mapa (Req. 13.4, 13.5, 19.7), separadas do componente para que possam
 * ser testadas sem Leaflet/DOM.
 */
import { CATEGORY_LABEL, PRIORITY_LABEL, type CategoryCode, type PriorityCode } from '@/lib/leads/config';
import type { MapPoint } from '@/lib/leads/client-api';

export type MapColorKey = PriorityCode | 'SEM';

/** Quatro cores distintas: Alta, Média, Baixa e sem prioridade (Req. 13.4). */
export const MAP_COLORS: Record<MapColorKey, string> = {
  ALTA: '#22c55e',
  MEDIA: '#f59e0b',
  BAIXA: '#94a3b8',
  SEM: '#a855f7',
};

export const MAP_NO_PRIORITY_LABEL = 'Sem prioridade (não analisada)';

/** Itens da legenda, na ordem de exibição, sempre com texto junto da cor (Req. 19.7). */
export const MAP_LEGEND: ReadonlyArray<{ key: MapColorKey; label: string; color: string }> = [
  { key: 'ALTA', label: PRIORITY_LABEL.ALTA, color: MAP_COLORS.ALTA },
  { key: 'MEDIA', label: PRIORITY_LABEL.MEDIA, color: MAP_COLORS.MEDIA },
  { key: 'BAIXA', label: PRIORITY_LABEL.BAIXA, color: MAP_COLORS.BAIXA },
  { key: 'SEM', label: MAP_NO_PRIORITY_LABEL, color: MAP_COLORS.SEM },
];

export const EMPTY_VALUE = '—';

export function markerColor(prioridade: PriorityCode | null | undefined): string {
  return MAP_COLORS[prioridade ?? 'SEM'];
}

export function fichaHref(id: string): string {
  return `/tools/lead-miner/leads/${encodeURIComponent(id)}`;
}

export interface PopupContent {
  nome: string;
  categoria: string;
  score: string;
  prioridade: string;
  href: string;
}

/** Texto do popup; empresa não analisada mostra "—" em categoria, score e prioridade (Req. 13.5). */
export function popupContent(p: Pick<MapPoint, 'id' | 'nome' | 'categoria' | 'scoreFinal' | 'prioridade'>): PopupContent {
  const categoria = p.categoria ? CATEGORY_LABEL[p.categoria as CategoryCode] ?? EMPTY_VALUE : EMPTY_VALUE;
  const score =
    typeof p.scoreFinal === 'number' && Number.isFinite(p.scoreFinal)
      ? p.scoreFinal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
      : EMPTY_VALUE;
  const prioridade = p.prioridade ? PRIORITY_LABEL[p.prioridade as PriorityCode] ?? EMPTY_VALUE : EMPTY_VALUE;
  return { nome: p.nome, categoria, score, prioridade, href: fichaHref(p.id) };
}

/** Aviso de truncamento (Req. 13.2): só quando há mais pontos válidos do que os exibidos. */
export function truncationNotice(shown: number, total: number): string | null {
  if (total <= shown) return null;
  return `Exibindo ${shown.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} empresas com localização (as de maior score).`;
}
