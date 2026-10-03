/**
 * Exemplos da Configuracao_Minerador estendida na Etapa 3 (lib/leads/config.ts).
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPROACH_LIMITS,
  APPROACH_TIMEOUT_MS,
  BRASILAPI_TIMEOUT_MS,
  CNPJ_DATA_DAYS,
  DIGITAL_POINTS,
  DIGITAL_POINTS_V2,
  GOOGLE_CACHE_DAYS,
  GOOGLE_MAX_PAGES,
  GOOGLE_PAGE_SIZE,
  GOOGLE_QUERIES,
  NICHES,
  PAGESPEED_POOR_THRESHOLD,
  PAGESPEED_TIMEOUT_MS,
  PLACES_TIMEOUT_MS,
  TECH_CATALOG,
  TECH_GROUP_LABEL,
  TECH_GROUP_ORDER,
} from '@/lib/leads/config';

describe('GOOGLE_QUERIES (Req. 1.1)', () => {
  it('tem exatamente um texto de busca não vazio por id de NICHES', () => {
    const ids = NICHES.map((n) => n.id).sort();
    expect(ids).toHaveLength(22);
    expect(Object.keys(GOOGLE_QUERIES).sort()).toEqual(ids);
    for (const id of ids) {
      const q = GOOGLE_QUERIES[id];
      expect(q.text.trim().length, id).toBeGreaterThan(0);
      if (q.includedType !== undefined) expect(q.includedType.trim().length, id).toBeGreaterThan(0);
    }
  });
});

describe('Timeouts e limites (Req. 1.3–1.6, 1.8)', () => {
  it('timeouts por requisição', () => {
    expect(PLACES_TIMEOUT_MS).toBe(15_000);
    expect(PAGESPEED_TIMEOUT_MS).toBe(30_000);
    expect(BRASILAPI_TIMEOUT_MS).toBe(8_000);
    expect(APPROACH_TIMEOUT_MS).toBe(20_000);
  });

  it('até 3 páginas (60 lugares) por Nicho na Fonte_Google', () => {
    expect(GOOGLE_MAX_PAGES).toBe(3);
    expect(GOOGLE_MAX_PAGES * GOOGLE_PAGE_SIZE).toBe(60);
  });

  it('validade do Cache_Google (30 dias) e dos Dados_CNPJ (90 dias)', () => {
    expect(GOOGLE_CACHE_DAYS).toBe(30);
    expect(CNPJ_DATA_DAYS).toBe(90);
  });

  it('Desempenho_Ruim < 50 e pontos v2 preservam os critérios da v1', () => {
    expect(PAGESPEED_POOR_THRESHOLD).toBe(50);
    expect(DIGITAL_POINTS_V2.desempenhoRuim).toBeGreaterThan(0);
    expect(DIGITAL_POINTS_V2).toMatchObject(DIGITAL_POINTS);
  });

  it('limites da Mensagem_Abordagem', () => {
    expect(APPROACH_LIMITS).toEqual({ whatsapp: 700, emailSubject: 120, emailBody: 2_000 });
  });
});

describe('TECH_CATALOG (Req. 1.7)', () => {
  const obrigatorias = [
    'WordPress', 'Wix', 'Shopify', 'Nuvemshop', 'Loja Integrada', 'Tray', 'Squarespace', 'Webflow',
    'Google Analytics', 'Google Tag Manager', 'Meta Pixel', 'jQuery', 'React', 'Next.js', 'Bootstrap',
  ];

  it('contém as 15 tecnologias obrigatórias', () => {
    const labels = TECH_CATALOG.map((t) => t.label);
    for (const l of obrigatorias) expect(labels, l).toContain(l);
    expect(TECH_CATALOG.length).toBeGreaterThanOrEqual(15);
  });

  it('ids únicos, rótulos não vazios e grupos válidos', () => {
    const ids = TECH_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TECH_CATALOG) {
      expect(t.id.trim().length).toBeGreaterThan(0);
      expect(t.label.trim().length, t.id).toBeGreaterThan(0);
      expect(TECH_GROUP_ORDER, t.id).toContain(t.group);
    }
    expect(Object.keys(TECH_GROUP_LABEL).sort()).toEqual([...TECH_GROUP_ORDER].sort());
  });

  it('cada tecnologia tem ao menos 1 padrão e todos compilam como RegExp', () => {
    const wheres = ['generator', 'asset', 'inline', 'html'];
    for (const t of TECH_CATALOG) {
      expect(t.patterns.length, t.id).toBeGreaterThanOrEqual(1);
      for (const pat of t.patterns) {
        expect(wheres, t.id).toContain(pat.where);
        expect(() => new RegExp(pat.regex, 'i'), `${t.id}: ${pat.regex}`).not.toThrow();
      }
    }
  });
});

describe('Isomorfia (Req. 1.9)', () => {
  it('lib/leads/config.ts não importa Node, Prisma, server-only nem next/*', () => {
    const src = readFileSync(path.resolve(__dirname, '../../lib/leads/config.ts'), 'utf8');
    const specifiers = [...src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
      (m) => m[1] ?? m[2] ?? m[3],
    );
    expect(specifiers.length).toBeGreaterThan(0);
    for (const s of specifiers) {
      expect(s, s).not.toMatch(/^node:|^(fs|path|crypto|http|https|net|dns|os|child_process)$|prisma|^server-only$|^next(\/|$)/);
    }
    expect(src).not.toMatch(/process\.env/);
  });
});
