/** Normalização de textos (isomórfico: sem imports de Node/Prisma). */

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const COMPANY_SUFFIX = /(^|\s)(ltda|me|eireli|sa|epp)$/;

/** trim, minúsculas, NFD sem diacríticos, espaços colapsados. */
export function normalizeText(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * normalizeText + remove pontuação + remove sufixos societários ao final
 * (ltda, me, eireli, s/a, sa, epp). "s/a" (e "s.a.") vira "sa" antes da remoção de pontuação.
 * Sufixos repetidos são removidos em sequência, garantindo idempotência.
 */
export function normalizeCompanyName(s: string | null | undefined): string {
  let out = normalizeText(s)
    .replace(/(^|[^a-z0-9])s\s*[/.]\s*a(?![a-z0-9])/g, '$1sa')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  while (COMPANY_SUFFIX.test(out)) {
    out = out.replace(COMPANY_SUFFIX, '').trim();
  }
  return out;
}
