/**
 * **Validates: Requirements 9.2, 9.3**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TECH_CATALOG, TECH_GROUP_ORDER, type TechPattern } from '@/lib/leads/config';
import { detectTechnologies } from '@/lib/leads/signals';
// Feature: lead-miner-enrichment, Property 23: For any HTML gerado a partir de trechos do catálogo e ruído, a lista de tecnologias não tem identificadores repetidos e está ordenada por grupo (CMS, LOJA_VIRTUAL, ANALYTICS, MARKETING, FRAMEWORK) e, dentro do grupo, por rótulo; e for any HTML gerado só com ruído que não casa nenhum padrão, a lista é vazia.

const RUNS = { numRuns: 200 };

/** Valores concretos que casam com cada padrão do catálogo (chave: `${id}:${índice do padrão}`). */
const SAMPLES: Record<string, string[]> = {
  'wordpress:0': ['WordPress 6.4.2'],
  'wordpress:1': ['https://ex.com.br/wp-content/themes/a/style.css', '/wp-includes/js/wp-emoji.min.js'],
  'wix:0': ['Wix.com Website Builder'],
  'wix:1': ['https://static.wixstatic.com/media/x.png'],
  'squarespace:0': ['https://static1.squarespace.com/static/a.css'],
  'squarespace:1': ['Squarespace'],
  'webflow:0': ['data-wf-page="64ab"'],
  'webflow:1': ['Webflow'],
  'shopify:0': ['https://cdn.shopify.com/s/files/1/theme.js'],
  'shopify:1': ['Shopify.shop = "loja.myshopify.com";'],
  'nuvemshop:0': ['https://d26lpennugtm8s.cloudfront.net/stores/1/a.css', 'https://www.nuvemshop.com.br/x.js'],
  'loja_integrada:0': ['https://cdn.awsli.lojaintegrada.com.br/static/a.js'],
  'tray:0': ['https://images.tray.com.br/files/a.css'],
  'google_analytics:0': ['https://www.google-analytics.com/analytics.js'],
  'google_tag_manager:0': ['https://www.googletagmanager.com/gtm.js?id=GTM-ABC12'],
  'google_tag_manager:1': ["dataLayer.push('GTM-K9X2ZQ');"],
  'meta_pixel:0': ['https://connect.facebook.net/en_US/fbevents.js'],
  'meta_pixel:1': ["fbq('init', '123456789');"],
  'jquery:0': ['/js/jquery.min.js'],
  'react:0': ['data-reactroot=""'],
  'react:1': ['/static/react.js'],
  'nextjs:0': ['__NEXT_DATA__'],
  'bootstrap:0': ['/css/bootstrap.min.css'],
};

function snippet(where: TechPattern['where'], value: string, variant: number): string {
  switch (where) {
    case 'generator':
      return `<meta name="generator" content="${value}">`;
    case 'asset':
      return variant % 2 === 0 ? `<script src="${value}"></script>` : `<link rel="stylesheet" href="${value}">`;
    case 'inline':
      return `<script>${value}</script>`;
    case 'html':
      return value.includes('=') ? `<div ${value}></div>` : `<div id="${value}"></div>`;
  }
}

const PATTERN_CASES = TECH_CATALOG.flatMap((tech) =>
  tech.patterns.map((pat, i) => ({ tech, pat, values: SAMPLES[`${tech.id}:${i}`] ?? [] })),
);

const techSnippetArb = fc
  .constantFrom(...PATTERN_CASES)
  .chain(({ pat, values }) =>
    fc.tuple(fc.constantFrom(...values), fc.nat(1)).map(([v, k]) => snippet(pat.where, v, k)),
  );

/** Texto sem `<`, `>`, aspas e `&` (não forja tags, atributos nem entidades). */
const safeText = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCXYZ0123456789.,;:-_/?=áéçãõ'.split('')), { maxLength: 40 })
  .map((cs) => cs.join(''));

const noisePieceArb = fc.oneof(
  safeText,
  safeText.map((t) => `<p class="${t}">${t}</p>`),
  safeText.map((t) => `<a href="https://${t.replace(/\s/g, '')}.com.br">${t}</a>`),
  safeText.map((t) => `<!-- ${t} -->`),
  safeText.map((t) => `<script>var x = "${t}";</script>`),
  safeText.map((t) => `<script src="/assets/${t.replace(/\s/g, '')}.js"></script>`),
  safeText.map((t) => `<meta name="generator" content="${t}">`),
);

function wrap(pieces: string[]) {
  return fc.constantFrom(
    pieces.join(''),
    `<!doctype html><html><head><title>Empresa</title></head><body>${pieces.join('')}</body></html>`,
  );
}

const mixedHtmlArb = fc.array(fc.oneof(noisePieceArb, techSnippetArb), { maxLength: 12 }).chain(wrap);

/** Padrões do catálogo sem âncoras, aplicados ao documento inteiro (superconjunto de todas as fontes). */
const LOOSE_RES = TECH_CATALOG.flatMap((t) => t.patterns.map((pt) => new RegExp(pt.regex.replace(/^\^/, ''), 'i')));
const noiseOnlyHtmlArb = fc
  .array(noisePieceArb, { maxLength: 12 })
  .chain(wrap)
  .filter((html) => LOOSE_RES.every((re) => !re.test(html)));

describe('Property 23: lista de tecnologias normalizada', () => {
  it('sem ids repetidos e ordenada por grupo e, no grupo, por rótulo', () => {
    fc.assert(
      fc.property(mixedHtmlArb, (html) => {
        const list = detectTechnologies(html);
        const ids = list.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (let i = 1; i < list.length; i++) {
          const a = list[i - 1];
          const b = list[i];
          const ga = TECH_GROUP_ORDER.indexOf(a.group);
          const gb = TECH_GROUP_ORDER.indexOf(b.group);
          expect(ga).toBeGreaterThanOrEqual(0);
          expect(ga).toBeLessThanOrEqual(gb);
          if (ga === gb) expect(a.label.localeCompare(b.label, 'pt-BR')).toBeLessThanOrEqual(0);
        }
      }),
      RUNS,
    );
  });

  it('HTML só com ruído que não casa nenhum padrão produz lista vazia', () => {
    fc.assert(
      fc.property(noiseOnlyHtmlArb, (html) => {
        expect(detectTechnologies(html)).toEqual([]);
      }),
      RUNS,
    );
  });
});
