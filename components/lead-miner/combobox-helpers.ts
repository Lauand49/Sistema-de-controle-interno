/**
 * Lógica pura do combobox de localidades (T2): filtro sem acento e sem diferenciar maiúsculas,
 * casamento exato com uma opção e navegação por teclado. Sem React: testável em node.
 */
import { normalizeText } from '@/lib/leads/text';

/** Sugestões exibidas de uma vez (listas de bairros podem ter centenas de nomes). */
export const MAX_SUGGESTIONS = 50;

/**
 * Opções que casam com `query` ignorando acentos e caixa: as que COMEÇAM com o termo primeiro,
 * depois as que o CONTÊM; a ordem original é preservada dentro de cada grupo. Termo vazio →
 * as primeiras opções.
 */
export function filterOptions(options: readonly string[], query: string, limit: number = MAX_SUGGESTIONS): string[] {
  const q = normalizeText(query);
  if (q === '') return options.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const o of options) {
    const n = normalizeText(o);
    if (n.startsWith(q)) starts.push(o);
    else if (n.includes(q)) contains.push(o);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** A opção cujo texto normalizado é igual ao de `text` (grafia canônica), ou null. */
export function findExactOption(options: readonly string[], text: string): string | null {
  const q = normalizeText(text);
  if (q === '') return null;
  return options.find((o) => normalizeText(o) === q) ?? null;
}

export type ListNavKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/** Próximo índice ativo (−1 = nenhum) com volta circular; lista vazia → −1. */
export function moveActive(current: number, count: number, key: ListNavKey): number {
  if (count <= 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
  }
}

/** "3 sugestões" / "Nenhuma sugestão" para o anúncio em região `aria-live`. */
export function suggestionsAnnouncement(count: number): string {
  if (count <= 0) return 'Nenhuma sugestão';
  return `${count} ${count === 1 ? 'sugestão' : 'sugestões'}`;
}
