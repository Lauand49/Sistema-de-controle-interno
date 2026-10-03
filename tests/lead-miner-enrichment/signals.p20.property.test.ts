/**
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.7**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  INSTAGRAM_RESERVED,
  detectSignals,
  findInstagramHandles,
  findWhatsappNumbers,
  instagramLink,
  normalizeWhatsapp,
  whatsappLink,
} from '@/lib/leads/signals';
// Feature: lead-miner-enrichment, Property 20: For any handle válido do Instagram (fora dos caminhos reservados, com maiúsculas e query opcionais) inserido num HTML arbitrário como link em qualquer variante (instagram.com/www.instagram.com), o Detector_Sinais devolve o handle em minúsculas; for any número com 10 a 13 dígitos inserido como link em qualquer formato do Req. 8.2 (com +, espaços ou %20 opcionais), devolve o número em dígitos com 55 prefixado quando tinha 10 ou 11 dígitos; e normalizeWhatsapp devolve null exatamente quando o resultado normalizado não tem 12 ou 13 dígitos.

const RUNS = { numRuns: 150 };
const NO_OSM = { instagram: null, whatsapp: null };

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

const RESERVED: ReadonlySet<string> = new Set(INSTAGRAM_RESERVED);

/** Handle válido em minúsculas ([a-z0-9._], 1–30), fora dos caminhos reservados. */
const handle = fc
  .stringMatching(/^[a-z0-9._]{1,30}$/)
  .filter((h) => !RESERVED.has(h));

/** Mesma string com algumas letras em maiúsculas. */
function withCase(h: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: h.length, maxLength: h.length })
    .map((flags) => h.split('').map((c, i) => (flags[i] ? c.toUpperCase() : c)).join(''));
}

const query = fc.option(
  fc.constantFrom('?utm_source=site', '?igsh=AbC123', '?hl=pt-br&x=1', '#perfil'),
  { nil: '' },
);

/** Link do Instagram: variante www/bare, esquema opcional, query opcional. */
const instagramHref = handle.chain((h) =>
  fc
    .record({
      cased: withCase(h),
      variant: fc.constantFrom<'www' | 'bare'>('www', 'bare'),
      scheme: fc.constantFrom('https://', 'http://', '//'),
      q: query,
    })
    .map(({ cased, variant, scheme, q }) => ({
      expected: h,
      href: instagramLink(cased, variant).replace(/^https:\/\//, scheme) + q,
    })),
);

/** Texto de preenchimento sem `<`, `&`, `"` e sem domínios de Instagram/WhatsApp. */
const filler = fc.stringMatching(/^[A-Za-z0-9 .,;:!?\n-]{0,80}$/);

/** Tags benignas que não contêm links de Instagram/WhatsApp. */
const benign = fc.constantFrom(
  '<p>Bem-vindo</p>',
  '<a href="https://example.com/contato">Contato</a>',
  '<img src="/logo.png" alt="logo">',
  '<div class="x"><span>Olá</span></div>',
  '<link rel="stylesheet" href="/a.css">',
  '',
);

/** HTML arbitrário com o link inserido entre conteúdos benignos. */
function htmlWith(href: string): fc.Arbitrary<string> {
  return fc
    .tuple(filler, benign, filler, benign, filler, fc.constantFrom('"', "'"))
    .map(
      ([a, b, c, d, e, quote]) =>
        `<html><body>${a}${b}${c}<a href=${quote}${href}${quote}>link</a>${d}${e}</body></html>`,
    );
}

/** Número de 10 a 13 dígitos. */
const number = fc.integer({ min: 10, max: 13 }).chain((len) => fc.stringMatching(new RegExp(`^[0-9]{${len}}$`)));

/** Formata o número com `+`, espaços ou `%20` opcionais. */
function decorate(n: string): fc.Arbitrary<string> {
  return fc
    .record({
      plus: fc.boolean(),
      sep: fc.constantFrom('', ' ', '%20'),
      cut: fc.array(fc.boolean(), { minLength: n.length, maxLength: n.length }),
    })
    .map(({ plus, sep, cut }) => {
      let s = '';
      for (let i = 0; i < n.length; i++) {
        s += n[i];
        if (sep && cut[i] && i < n.length - 1) s += sep;
      }
      return (plus ? '+' : '') + s;
    });
}

const whatsappHref = number.chain((n) =>
  fc
    .record({
      raw: decorate(n),
      variant: fc.constantFrom<'wa.me' | 'api' | 'web' | 'scheme'>('wa.me', 'api', 'web', 'scheme'),
    })
    .map(({ raw, variant }) => ({
      expected: n.length <= 11 ? '55' + n : n,
      href: whatsappLink(raw, variant),
    })),
);

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe('Property 20: round-trip de Instagram e WhatsApp', () => {
  it('handle do Instagram inserido como link volta em minúsculas', () => {
    fc.assert(
      fc.property(
        instagramHref.chain((l) => htmlWith(l.href).map((html) => ({ ...l, html }))),
        ({ expected, html }) => {
          expect(findInstagramHandles(html)).toEqual([expected]);
          const s = detectSignals(html, NO_OSM);
          expect(s.instagram).toBe(expected);
          expect(s.instagramOrigem).toBe('SITE');
        },
      ),
      RUNS,
    );
  });

  it('número de WhatsApp inserido como link volta só com dígitos e 55 quando tinha 10–11 dígitos', () => {
    fc.assert(
      fc.property(
        whatsappHref.chain((l) => htmlWith(l.href).map((html) => ({ ...l, html }))),
        ({ expected, html }) => {
          expect(findWhatsappNumbers(html)).toEqual([expected]);
          const s = detectSignals(html, NO_OSM);
          expect(s.whatsapp).toBe(expected);
          expect(s.whatsappOrigem).toBe('SITE');
        },
      ),
      RUNS,
    );
  });

  it('normalizeWhatsapp devolve null exatamente quando o normalizado não tem 12 ou 13 dígitos', () => {
    const input = fc.oneof(
      fc.string({ maxLength: 30 }),
      fc.stringMatching(/^[0-9 +().-]{0,25}$/),
      fc.integer({ min: 0, max: 18 }).chain((len) => fc.stringMatching(new RegExp(`^[0-9]{${len}}$`))),
    );
    fc.assert(
      fc.property(input, (v) => {
        const digits = v.replace(/\D+/g, '');
        const normalized = digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
        const out = normalizeWhatsapp(v);
        if (normalized.length === 12 || normalized.length === 13) expect(out).toBe(normalized);
        else expect(out).toBeNull();
      }),
      RUNS,
    );
  });
});
