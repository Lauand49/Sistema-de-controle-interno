/**
 * T4 — "Com contato" / "Sem contato".
 *
 * Um lead tem contato quando há telefone, WhatsApp, e-mail ou Instagram conhecidos.
 *
 * - `Company.temContato` é persistido e mantido por um trigger do Postgres
 *   (migração `20261017000000_company_tem_contato`), que aplica exatamente `computeTemContato`
 *   a cada INSERT/UPDATE. Assim nenhum ponto de escrita (descoberta, análise, reanálise,
 *   edição manual) precisa lembrar de recalcular.
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

const filled = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim() !== '';

/** Espelho em TypeScript do trigger `company_set_tem_contato` (mesma regra, mesmos campos). */
export function computeTemContato(c: ContactSource): boolean {
  return (
    filled(c.telefone) ||
    filled(c.whatsappOsm) ||
    filled(c.instagramOsm) ||
    filled(c.emailOsm) ||
    c.temWhatsapp === true ||
    c.temInstagram === true
  );
}

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
