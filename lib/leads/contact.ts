/**
 * T4 — "Com contato" / "Sem contato".
 *
 * Um lead tem contato quando há telefone, WhatsApp, e-mail ou Instagram conhecidos.
 *
 * - `Company.temContato` é persistido e mantido por um trigger do Postgres, que aplica exatamente
 *   `temContato()` (abaixo) a cada INSERT/UPDATE. Assim nenhum ponto de escrita (descoberta,
 *   análise, reanálise, edição manual) precisa lembrar de recalcular.
 * - A REGRA MORA EM DOIS LUGARES QUE DEVEM MUDAR JUNTOS:
 *     1. a função `company_set_tem_contato()` — definida em `prisma/migrations/20261017000000_company_tem_contato`
 *        e REDEFINIDA pela migração mais recente que a altera (hoje
 *        `20261020000000_tem_contato_whitespace`); migrações antigas nunca são editadas, a mudança
 *        da regra entra numa migração nova com `CREATE OR REPLACE FUNCTION` + backfill;
 *     2. esta função TypeScript `temContato()`.
 *   O teste de integração `tests/lead-miner-enrichment/integration/tem-contato-trigger.int.test.ts`
 *   (só em `scitec_test`) confere que as duas coincidem, inclusive com vazio, espaços e nulos.
 * - O telefone do Cache_Google NÃO é persistido na Empresa (vale 30 dias). Por isso a consulta
 *   (`contatoWhere`) também considera o telefone do Cache_Google ainda válido: o que a tela mostra
 *   como telefone nunca cai em "Sem contato".
 */
import type { Prisma } from '@prisma/client';

export const CONTATO_TABS = ['com', 'sem'] as const;
export type ContatoTab = (typeof CONTATO_TABS)[number];
export const DEFAULT_CONTATO_TAB: ContatoTab = 'com';

export interface ContactSource {
  telefone?: string | null;
  whatsappOsm?: string | null;
  instagramOsm?: string | null;
  emailOsm?: string | null;
  /** Snapshots da última análise (sinais do site/OSM). */
  temWhatsapp?: boolean | null;
  temInstagram?: boolean | null;
}

/**
 * Caracteres que o trigger descarta nas pontas (`btrim(x, E' \t\n\r\f\v')`): espaço, tab, quebras de
 * linha, avanço de página e tab vertical. Espaços Unicode (ex.: NBSP, largura zero) contam como
 * conteúdo nos dois lados — NÃO use `String.prototype.trim()`, que também remove esses.
 */
export const CONTACT_BLANK_CHARS = ' \t\n\r\f\v';

// Mesmo conjunto de CONTACT_BLANK_CHARS (ver teste: as duas definições são conferidas).
const BLANK_ENDS = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;

const filled = (v: string | null | undefined): boolean => typeof v === 'string' && v.replace(BLANK_ENDS, '') !== '';

/**
 * REGRA DE CONTATO (pura): telefone, WhatsApp, e-mail ou Instagram conhecidos — texto não vazio
 * depois de descartar `CONTACT_BLANK_CHARS` nas pontas — ou snapshot de análise `true`.
 * Espelho exato do trigger `company_set_tem_contato` (nulos contam como vazio/falso).
 */
export function temContato(c: ContactSource): boolean {
  return (
    filled(c.telefone) ||
    filled(c.whatsappOsm) ||
    filled(c.instagramOsm) ||
    filled(c.emailOsm) ||
    c.temWhatsapp === true ||
    c.temInstagram === true
  );
}

/** Nome anterior de `temContato` (mantido para os chamadores existentes). */
export const computeTemContato = temContato;

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Primeiro e-mail válido de uma tag OSM (aceita lista separada por `;`), minúsculo; senão `null`. */
export function normalizeEmail(v: string | null | undefined): string | null {
  if (v == null) return null;
  for (const part of v.split(/[;,]/)) {
    const s = part.trim().replace(/^mailto:/i, '').toLowerCase();
    if (s.length > 0 && s.length <= 254 && EMAIL_RE.test(s)) return s;
  }
  return null;
}

/**
 * Condição do Prisma para a aba. "Com contato" = `temContato` OU telefone do Cache_Google válido;
 * "Sem contato" é o complemento exato — toda empresa cai em exatamente uma aba.
 */
export function contatoWhere(tab: ContatoTab, now: Date): Prisma.CompanyWhereInput {
  const com: Prisma.CompanyWhereInput = {
    OR: [
      { temContato: true },
      { googleCache: { is: { expiraEm: { gt: now }, telefone: { not: '' } } } },
    ],
  };
  return tab === 'com' ? com : { NOT: com };
}
