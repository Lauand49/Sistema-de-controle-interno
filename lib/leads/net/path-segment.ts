/**
 * Validação de valores usados como segmento de path em URLs de host fixo (Req. 20.4).
 *
 * `encodeURIComponent` preserva `.`, então `'.'`/`'..'` virariam segmentos de ponto que o
 * parser de URL colapsa (subindo no path). Vazio também é recusado. Puro.
 */
export function isSafePathSegment(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value !== '.' && value !== '..';
}

/**
 * true quando `pathname` (já normalizado pelo parser) é exatamente `prefix` + um único
 * segmento não vazio, sem `/` adicional.
 */
export function isSingleSegmentUnder(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  return rest !== '' && !rest.includes('/');
}
