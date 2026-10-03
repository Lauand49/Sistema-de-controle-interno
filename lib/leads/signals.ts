/**
 * Detector_Sinais (Etapa 3): Instagram, WhatsApp e tecnologias do site a partir do
 * Corpo_HTML e das tags OSM. Módulo puro e isomórfico: sem estado global mutável, relógio,
 * aleatoriedade ou imports de Node/Prisma. As RegExps do catálogo padrão são compiladas uma
 * vez (somente leitura, sem flag `g`, portanto sem `lastIndex`).
 *
 * Requisitos: 8.1–8.6, 9.1–9.3 (serialização: 8.8, 9.5).
 */
import { TECH_CATALOG, TECH_GROUP_ORDER, type TechEntry, type TechPattern } from './config';
import { extractAssets, extractHrefs } from './html';
import type { SignalOrigin, SinaisDigitais, TechGroup, TechHit } from './types';

// ---------------------------------------------------------------------------
// Instagram (Req. 8.1)
// ---------------------------------------------------------------------------

/** Primeiros segmentos de caminho do Instagram que não são perfis. */
export const INSTAGRAM_RESERVED = ['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'share'] as const;
const RESERVED_SET: ReadonlySet<string> = new Set(INSTAGRAM_RESERVED);

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
/** `https://instagram.com/x`, `//www.instagram.com/x`, `instagram.com/x` → captura o 1º segmento. */
const INSTAGRAM_URL_RE = /^(?:https?:)?(?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]*)/i;

function validHandle(raw: string): string | null {
  const h = raw.toLowerCase();
  if (!HANDLE_RE.test(h) || RESERVED_SET.has(h)) return null;
  return h;
}

/** `@handle`, `instagram.com/handle`, URL completa → handle minúsculo válido ([a-z0-9._], 1–30) ou null. */
export function normalizeInstagram(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s) return null;
  const m = INSTAGRAM_URL_RE.exec(s);
  if (m) return validHandle(m[1]);
  // Valor solto (tag OSM): "@handle", "handle" ou "handle/"
  const bare = s.replace(/^@/, '').replace(/\/+$/, '');
  return validHandle(bare);
}

/** Handles válidos de todos os links `href` do Instagram, na ordem do documento (com repetições). */
export function findInstagramHandles(html: string): string[] {
  const out: string[] = [];
  for (const href of extractHrefs(html)) {
    const m = INSTAGRAM_URL_RE.exec(href);
    if (!m) continue;
    const h = validHandle(m[1]);
    if (h) out.push(h);
  }
  return out;
}

/** Link gerado no formato do Req. 8.1 (usado nos testes de round-trip, Req. 8.7). */
export function instagramLink(handle: string, variant: 'www' | 'bare'): string {
  return variant === 'www' ? `https://www.instagram.com/${handle}/` : `https://instagram.com/${handle}`;
}

// ---------------------------------------------------------------------------
// WhatsApp (Req. 8.2, 8.3)
// ---------------------------------------------------------------------------

/** Só dígitos; 10–11 dígitos → prefixa 55; aceita 12–13; senão null (Req. 8.2, 8.3). */
export function normalizeWhatsapp(v: string | null | undefined): string | null {
  if (v == null) return null;
  let digits = v.replace(/\D+/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits.length === 12 || digits.length === 13 ? digits : null;
}

const WA_ME_RE = /^(?:https?:)?(?:\/\/)?(?:www\.)?wa\.me\/([^?#/]*)/i;
const WA_SEND_RE = /^(?:(?:https?:)?\/\/(?:api|web)\.whatsapp\.com\/send\/?|whatsapp:\/\/send\/?)\?([^#]*)/i;
/** Número cru do link: dígitos com `+`, espaços (ou `%20`) e separadores comuns. */
const RAW_NUMBER_RE = /^[\d\s+().-]+$/;

function numberFromRaw(raw: string): string | null {
  const s = raw.replace(/%20/gi, ' ').replace(/%2B/gi, '+').trim();
  if (!s || !RAW_NUMBER_RE.test(s)) return null;
  return normalizeWhatsapp(s);
}

function phoneParam(query: string): string | null {
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).toLowerCase() === 'phone') return part.slice(eq + 1);
  }
  return null;
}

/** Números válidos (normalizados) de todos os links de WhatsApp, na ordem do documento. */
export function findWhatsappNumbers(html: string): string[] {
  const out: string[] = [];
  for (const href of extractHrefs(html)) {
    let raw: string | null = null;
    const me = WA_ME_RE.exec(href);
    if (me) raw = me[1];
    else {
      const send = WA_SEND_RE.exec(href);
      if (send) raw = phoneParam(send[1]);
    }
    if (raw == null) continue;
    const n = numberFromRaw(raw);
    if (n) out.push(n);
  }
  return out;
}

/** Link gerado em um dos formatos do Req. 8.2 (usado nos testes de round-trip, Req. 8.7). */
export function whatsappLink(number: string, variant: 'wa.me' | 'api' | 'web' | 'scheme'): string {
  switch (variant) {
    case 'wa.me':
      return `https://wa.me/${number}`;
    case 'api':
      return `https://api.whatsapp.com/send?phone=${number}`;
    case 'web':
      return `https://web.whatsapp.com/send?phone=${number}`;
    case 'scheme':
      return `whatsapp://send?phone=${number}`;
  }
}

// ---------------------------------------------------------------------------
// Escolha (Req. 8.4)
// ---------------------------------------------------------------------------

/** Mais frequente; empate → primeira ocorrência (Req. 8.4). */
export function pickMostFrequent(values: readonly string[]): string | null {
  const counts = new Map<string, number>(); // ordem de inserção = primeira ocorrência
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((c, v) => {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// Tecnologias (Req. 9.1–9.3)
// ---------------------------------------------------------------------------

interface CompiledEntry {
  hit: TechHit;
  tests: Array<{ where: TechPattern['where']; re: RegExp }>;
}

function compile(catalog: readonly TechEntry[]): readonly CompiledEntry[] {
  return catalog.map((e) => ({
    hit: { id: e.id, label: e.label, group: e.group },
    tests: e.patterns.map((p) => ({ where: p.where, re: new RegExp(p.regex, 'i') })),
  }));
}

const DEFAULT_COMPILED = compile(TECH_CATALOG);

function groupIndex(g: TechGroup): number {
  const i = TECH_GROUP_ORDER.indexOf(g);
  return i === -1 ? TECH_GROUP_ORDER.length : i;
}

function compareTech(a: TechHit, b: TechHit): number {
  return (
    groupIndex(a.group) - groupIndex(b.group) ||
    a.label.localeCompare(b.label, 'pt-BR') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Tecnologias do catálogo encontradas no HTML, sem repetição, ordenadas por grupo e rótulo. */
export function detectTechnologies(html: string, catalog?: readonly TechEntry[]): TechHit[] {
  if (!html) return [];
  const compiled = catalog ? compile(catalog) : DEFAULT_COMPILED;
  const { generator, assets, inline } = extractAssets(html);
  const sources: Record<TechPattern['where'], readonly string[]> = {
    generator,
    asset: assets,
    inline,
    html: [html],
  };
  const seen = new Set<string>();
  const out: TechHit[] = [];
  for (const entry of compiled) {
    if (seen.has(entry.hit.id)) continue;
    const found = entry.tests.some(({ where, re }) => sources[where].some((s) => re.test(s)));
    if (found) {
      seen.add(entry.hit.id);
      out.push({ ...entry.hit });
    }
  }
  return out.sort(compareTech);
}

// ---------------------------------------------------------------------------
// Detector (Req. 8.5, 8.6)
// ---------------------------------------------------------------------------

/**
 * Sinais_Digitais da Empresa: o sinal do site vence; na falta, a tag OSM normalizada com
 * origem `OSM`. Sem `html`, só as tags OSM e nenhuma tecnologia.
 */
export function detectSignals(
  html: string | null,
  osm: { instagram: string | null; whatsapp: string | null },
  catalog?: readonly TechEntry[],
): SinaisDigitais {
  const siteInstagram = html ? pickMostFrequent(findInstagramHandles(html)) : null;
  const siteWhatsapp = html ? pickMostFrequent(findWhatsappNumbers(html)) : null;
  const osmInstagram = siteInstagram ? null : normalizeInstagram(osm.instagram);
  const osmWhatsapp = siteWhatsapp ? null : normalizeWhatsapp(osm.whatsapp);
  return {
    instagram: siteInstagram ?? osmInstagram,
    instagramOrigem: siteInstagram ? 'SITE' : osmInstagram ? 'OSM' : null,
    whatsapp: siteWhatsapp ?? osmWhatsapp,
    whatsappOrigem: siteWhatsapp ? 'SITE' : osmWhatsapp ? 'OSM' : null,
    tecnologias: html ? detectTechnologies(html, catalog) : [],
  };
}

// ---------------------------------------------------------------------------
// Gravação (Req. 8.8, 9.5)
// ---------------------------------------------------------------------------

const ORIGINS: ReadonlySet<string> = new Set<SignalOrigin>(['SITE', 'OSM']);
const GROUPS: ReadonlySet<string> = new Set<string>(TECH_GROUP_ORDER);

/** Valor JSON simples (sem `undefined`) para gravar na coluna `sinais`. */
export function serializeSinais(s: SinaisDigitais): {
  instagram: string | null;
  instagramOrigem: SignalOrigin | null;
  whatsapp: string | null;
  whatsappOrigem: SignalOrigin | null;
  tecnologias: Array<{ id: string; label: string; group: TechGroup }>;
} {
  return {
    instagram: s.instagram,
    instagramOrigem: s.instagramOrigem,
    whatsapp: s.whatsapp,
    whatsappOrigem: s.whatsappOrigem,
    tecnologias: s.tecnologias.map((t) => ({ id: t.id, label: t.label, group: t.group })),
  };
}

function parseSignal(
  value: unknown,
  origin: unknown,
  normalize: (v: string) => string | null,
): [string | null, SignalOrigin | null] {
  if (typeof value !== 'string' || typeof origin !== 'string' || !ORIGINS.has(origin)) return [null, null];
  const n = normalize(value);
  return n !== null && n === value ? [n, origin as SignalOrigin] : [null, null];
}

/** Leitura defensiva: `null` quando o valor não é um objeto; campos fora da forma são descartados. Nunca lança. */
export function parseSinais(value: unknown): SinaisDigitais | null {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const [instagram, instagramOrigem] = parseSignal(o.instagram, o.instagramOrigem, normalizeInstagram);
  const [whatsapp, whatsappOrigem] = parseSignal(o.whatsapp, o.whatsappOrigem, normalizeWhatsapp);
  const tecnologias: TechHit[] = [];
  const seen = new Set<string>();
  if (Array.isArray(o.tecnologias)) {
    for (const item of o.tecnologias) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const { id, label, group } = item as Record<string, unknown>;
      if (typeof id !== 'string' || !id || typeof label !== 'string' || typeof group !== 'string') continue;
      if (!GROUPS.has(group) || seen.has(id)) continue;
      seen.add(id);
      tecnologias.push({ id, label, group: group as TechGroup });
    }
  }
  tecnologias.sort(compareTech);
  return { instagram, instagramOrigem, whatsapp, whatsappOrigem, tecnologias };
}
