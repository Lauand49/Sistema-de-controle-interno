/** Utilidades de apresentação (sem dependências de React). */

/** Junta classes ignorando valores falsos. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** "1 funil", "3 funis". Zero usa o plural, como em português ("0 pendentes"). */
export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const brl = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Valor gravado ("4", "1234.5") → "4,00", "1.234,50". Texto que não é número volta como veio.
 * Só exibição: o valor gravado NÃO muda.
 */
export function formatBRL(stored: string | null | undefined): string {
  if (stored === null || stored === undefined || stored.trim() === '') return '';
  const n = Number(stored);
  return Number.isFinite(n) ? brl.format(n) : stored;
}

/**
 * Texto digitado → formato gravado (ponto decimal, como `<input type="number">` entregava).
 * "4,5" → "4.5"; "1.234,56" → "1234.56"; "12.5" → "12.5"; letras são descartadas.
 */
export function normalizeDecimalInput(typed: string): string {
  const cleaned = typed.replace(/[^\d.,-]/g, '');
  const sign = cleaned.startsWith('-') ? '-' : '';
  const body = cleaned.replace(/-/g, '');
  if (body.includes(',')) {
    const [int, ...rest] = body.split(',');
    return `${sign}${int.replace(/\./g, '')}${rest.length ? `.${rest.join('').replace(/\./g, '')}` : ''}`;
  }
  return `${sign}${body}`;
}
