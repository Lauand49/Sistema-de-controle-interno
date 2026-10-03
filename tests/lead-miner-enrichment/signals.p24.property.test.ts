/**
 * **Validates: Requirements 9.1, 9.4**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TECH_CATALOG, type TechPattern } from '@/lib/leads/config';
import { detectTechnologies } from '@/lib/leads/signals';
// Feature: lead-miner-enrichment, Property 24: For any HTML e qualquer tecnologia do Catalogo_Tecnologias, acrescentar ao documento um trecho que corresponde a um padrão dessa tecnologia produz uma lista que contém todas as tecnologias da lista original e mais essa tecnologia.

const RUNS = { numRuns: 200 };

/** Valores concretos que casam com cada padrão do catálogo (chave: `${id}:${índice do padrão}`). */
const SAMPLES: Record<string, string[]> = {
  'wordpress:0': ['WordPress 6.4.2', 'WordPress'],
  'wordpress:1': ['https://ex.com.br/wp-content/themes/a/style.css', '/wp-includes/js/wp-emoji.min.js'],
  'wix:0': ['Wix.com Website Builder'],
  'wix:1': ['https://static.wixstatic.com/media/x.png', 'https://static.parastorage.com/services/a.js'],
  'squarespace:0': ['https://static1.squarespace.com/static/a.css', 'https://assets.squarespace-cdn.com/x.js'],
  'squarespace:1': ['Squarespace'],
  'webflow:0': ['data-wf-page="64ab"', 'data-wf-site="12cd"'],
  'webflow:1': ['Webflow'],
  'shopify:0': ['https://cdn.shopify.com/s/files/1/theme.js'],
  'shopify:1': ['window.Shopify = {}; Shopify.shop = "loja.myshopify.com";'],
  'nuvemshop:0': ['https://d26lpennugtm8s.cloudfront.net/stores/1/a.css', 'https://www.nuvemshop.com.br/x.js', 'https://tiendanube.com/a.js'],
  'loja_integrada:0': ['https://cdn.awsli.lojaintegrada.com.br/static/a.js'],
  'tray:0': ['https://images.tray.com.br/files/a.css', 'https://traycdn.net/x.js'],
  'google_analytics:0': ['https://www.google-analytics.com/analytics.js', 'https://www.googletagmanager.com/gtag/js?id=G-ABC123'],
  'google_tag_manager:0': ['https://www.googletagmanager.com/gtm.js?id=GTM-ABC12'],
  'google_tag_manager:1': ["(function(w,d){})(window,document,'script','dataLayer','GTM-K9X2ZQ');"],
  'meta_pixel:0': ['https://connect.facebook.net/en_US/fbevents.js'],
  'meta_pixel:1': ["fbq('init', '123456789');", 'fbq("init", "42");'],
  'jquery:0': ['/js/jquery.min.js', 'https://code.jquery.com/jquery-3.7.1.js'],
  'react:0': ['data-reactroot=""', '__REACT_DEVTOOLS_GLOBAL_HOOK__'],
  'react:1': ['https://unpkg.com/react-dom.production.min.js', '/static/react.js'],
  'nextjs:0': ['__NEXT_DATA__', '/_next/static/chunks/main.js'],
  'bootstrap:0': ['/css/bootstrap.min.css', 'https://cdn.example.com/bootstrap.bundle.min.js'],
};

/** Trecho HTML bem-formado que expõe `value` no lugar (`where`) examinado pelo padrão. */
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

/** Todos os pares (tecnologia, padrão) do catálogo com seus trechos de exemplo. */
const PATTERN_CASES = TECH_CATALOG.flatMap((tech) =>
  tech.patterns.map((pat, i) => ({ tech, pat, values: SAMPLES[`${tech.id}:${i}`] ?? [] })),
);

const hitArb = fc
  .constantFrom(...PATTERN_CASES)
  .chain(({ tech, pat, values }) =>
    fc.record({
      id: fc.constant(tech.id),
      html: fc.tuple(fc.constantFrom(...values), fc.nat(1)).map(([v, k]) => snippet(pat.where, v, k)),
    }),
  );

/** Texto sem `<`, `>` e aspas (não forja tags nem quebra atributos). */
const safeText = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCXYZ0123456789.,;:-_/?=&áéçãõ'.split('')), { maxLength: 40 })
  .map((cs) => cs.join(''));

/** Pedaços bem-formados: texto, tags comuns, comentários fechados, scripts e trechos de tecnologias. */
const pieceArb = fc.oneof(
  safeText,
  safeText.map((t) => `<p class="${t}">${t}</p>`),
  safeText.map((t) => `<a href="https://${t.replace(/\s/g, '')}.com.br">${t}</a>`),
  safeText.map((t) => `<!-- ${t} -->`),
  safeText.map((t) => `<script>var x = "${t}";</script>`),
  safeText.map((t) => `<script src="/assets/${t.replace(/\s/g, '')}.js"></script>`),
  safeText.map((t) => `<meta name="generator" content="${t}">`),
  hitArb.map((h) => h.html),
);

const htmlArb = fc
  .array(pieceArb, { maxLength: 12 })
  .chain((pieces) =>
    fc.constantFrom(
      pieces.join(''),
      `<!doctype html><html><head><title>Empresa</title></head><body>${pieces.join('')}</body></html>`,
    ),
  );

describe('Property 24: monotonicidade das tecnologias', () => {
  it('todo padrão do catálogo tem exemplo que casa com a sua RegExp', () => {
    for (const { tech, pat, values } of PATTERN_CASES) {
      expect(values.length, `${tech.id}: ${pat.regex}`).toBeGreaterThan(0);
      for (const v of values) expect(new RegExp(pat.regex, 'i').test(v), `${tech.id}: ${v}`).toBe(true);
    }
  });

  it('acrescentar um trecho de uma tecnologia preserva as anteriores e inclui essa tecnologia', () => {
    fc.assert(
      fc.property(htmlArb, hitArb, (html, hit) => {
        const before = detectTechnologies(html).map((t) => t.id);
        const after = detectTechnologies(html + hit.html).map((t) => t.id);
        for (const id of before) expect(after).toContain(id);
        expect(after).toContain(hit.id);
        expect(new Set(after).size).toBe(after.length);
      }),
      RUNS,
    );
  });
});
