/**
 * T4 — abas "Com contato" / "Sem contato".
 * Regra pura (`computeTemContato`), normalização de e-mail, filtro `contato` e a migração do trigger.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTACT_BLANK_CHARS,
  computeTemContato,
  temContato,
  contatoWhere,
  normalizeEmail,
  type ContactSource,
} from '@/lib/leads/contact';
import { buildCompanyWhere, companyFiltersSchema, companyListSchema } from '@/lib/leads/filters';
import { mapElement } from '@/lib/leads/sources/osm';
import {
  buildTabbedRankingRequest,
  clearFilters,
  contatoTab,
  contatoTabPatch,
  contatoTabText,
  exportRequestFor,
  parseRankingUrl,
  applyFilterPatch,
} from '@/components/lead-miner/ranking-helpers';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('temContato (regra pura, espelho do trigger)', () => {
  it('computeTemContato é o mesmo nome antigo da função', () => {
    expect(computeTemContato).toBe(temContato);
  });

  it('vazio, só espaço/tab/quebra de linha e nulos não contam', () => {
    for (const blank of ['', ' ', '   ', '\t', '\n', '\r\n', '\f', '\v', ' \t\n\r\f\v ', null, undefined]) {
      expect(temContato({ telefone: blank }), JSON.stringify(blank)).toBe(false);
      expect(temContato({ emailOsm: blank }), JSON.stringify(blank)).toBe(false);
    }
  });

  it('espaços Unicode contam como conteúdo (igual ao btrim do trigger, que não os remove)', () => {
    for (const s of ['\u00a0', '\u200b', '\u2003', ' \u00a0 ']) {
      expect(temContato({ whatsappOsm: s }), JSON.stringify(s)).toBe(true);
    }
  });

  it('texto com conteúdo e espaços nas pontas conta', () => {
    expect(temContato({ instagramOsm: '  loja.x \n' })).toBe(true);
  });

  it('o conjunto de brancos é o documentado', () => {
    expect(CONTACT_BLANK_CHARS).toBe(' \t\n\r\f\v');
  });
});

describe('computeTemContato', () => {
  it('sem nenhum dado → false', () => {
    expect(computeTemContato({})).toBe(false);
    expect(
      computeTemContato({ telefone: null, whatsappOsm: null, instagramOsm: null, emailOsm: null, temWhatsapp: null, temInstagram: null }),
    ).toBe(false);
  });

  it.each<[string, ContactSource]>([
    ['telefone', { telefone: '(11) 4000-1234' }],
    ['WhatsApp do OSM', { whatsappOsm: '5511999990000' }],
    ['Instagram do OSM', { instagramOsm: 'clinica.sorriso' }],
    ['e-mail do OSM', { emailOsm: 'contato@clinica.com.br' }],
    ['WhatsApp detectado no site', { temWhatsapp: true }],
    ['Instagram detectado no site', { temInstagram: true }],
  ])('%s basta para ter contato', (_n, src) => {
    expect(computeTemContato(src)).toBe(true);
  });

  it('texto vazio ou só espaços não conta; snapshots false/null não contam', () => {
    expect(computeTemContato({ telefone: '   ', whatsappOsm: '', instagramOsm: ' ', emailOsm: '' })).toBe(false);
    expect(computeTemContato({ temWhatsapp: false, temInstagram: false })).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('normaliza caixa, mailto: e pega o primeiro válido de uma lista', () => {
    expect(normalizeEmail('  Contato@Clinica.COM.br ')).toBe('contato@clinica.com.br');
    expect(normalizeEmail('mailto:oi@loja.com')).toBe('oi@loja.com');
    expect(normalizeEmail('invalido; vendas@loja.com; outro@loja.com')).toBe('vendas@loja.com');
  });

  it('rejeita o que não é e-mail', () => {
    for (const bad of [null, undefined, '', '   ', 'sem-arroba', '@x.com', 'a@b', 'a b@c.com']) {
      expect(normalizeEmail(bad as string | null | undefined)).toBeNull();
    }
    expect(normalizeEmail(`${'a'.repeat(250)}@x.com`)).toBeNull();
  });
});

describe('OSM: e-mail entra só quando existe', () => {
  const el = (tags: Record<string, string>) => ({ type: 'node', id: 1, lat: -23.5, lon: -46.6, tags: { name: 'Clínica X', ...tags } });

  it('lê contact:email e email', () => {
    expect(mapElement(el({ 'contact:email': 'A@B.com' }) as never, 'clinica_odontologica')?.emailOsm).toBe('a@b.com');
    expect(mapElement(el({ email: 'c@d.com' }) as never, 'clinica_odontologica')?.emailOsm).toBe('c@d.com');
  });

  it('sem e-mail a propriedade não existe (contrato anterior preservado)', () => {
    const found = mapElement(el({}) as never, 'clinica_odontologica');
    expect(found).not.toBeNull();
    expect('emailOsm' in (found as object)).toBe(false);
  });
});

describe('filtro contato', () => {
  it('aceita com/sem, trata vazio como ausente e rejeita outro valor', () => {
    expect(companyFiltersSchema.parse({ contato: 'com' }).contato).toBe('com');
    expect(companyFiltersSchema.parse({ contato: 'sem' }).contato).toBe('sem');
    expect(companyFiltersSchema.parse({ contato: '' }).contato).toBeUndefined();
    expect(companyFiltersSchema.safeParse({ contato: 'talvez' }).success).toBe(false);
    expect(companyListSchema.safeParse({ contato: 'COM' }).success).toBe(false);
  });

  it('sem o filtro, o where não restringe contato', () => {
    expect(buildCompanyWhere({}, NOW)).toEqual({});
    expect(JSON.stringify(buildCompanyWhere({ nicho: 'x' }, NOW))).not.toContain('temContato');
  });

  it('"com" = temContato OU telefone do Cache_Google válido; "sem" é o NOT exato', () => {
    const com = contatoWhere('com', NOW);
    expect(com).toEqual({
      OR: [{ temContato: true }, { googleCache: { is: { expiraEm: { gt: NOW }, telefone: { not: '' } } } }],
    });
    expect(contatoWhere('sem', NOW)).toEqual({ NOT: com });
    expect(buildCompanyWhere({ contato: 'sem' }, NOW)).toEqual({ AND: [{ NOT: com }] });
  });
});

describe('helpers da Tela_Ranking', () => {
  it('aba padrão é "com"; valor inválido também cai em "com"', () => {
    expect(contatoTab({})).toBe('com');
    expect(contatoTab({ contato: 'sem' })).toBe('sem');
    expect(contatoTab({ contato: 'xyz' })).toBe('com');
  });

  it('a requisição sempre leva a aba explícita (lista, mapa e CSV seguem a aba)', () => {
    expect(buildTabbedRankingRequest({}).query.get('contato')).toBe('com');
    const q = buildTabbedRankingRequest({ contato: 'sem', nicho: 'x' }).query;
    expect(q.get('contato')).toBe('sem');
    const req = exportRequestFor([], q);
    expect('filters' in req && req.filters.contato).toBe('sem');
  });

  it('trocar de aba volta à página 1 e a aba padrão sai da URL', () => {
    const state = parseRankingUrl(new URLSearchParams('page=3&contato=sem&nicho=x'));
    const toCom = applyFilterPatch(state, contatoTabPatch('com'));
    expect(toCom.page).toBe(1);
    expect(toCom.ui.contato).toBeUndefined();
    const toSem = applyFilterPatch(toCom, contatoTabPatch('sem'));
    expect(toSem.ui.contato).toBe('sem');
  });

  it('limpar filtros mantém a aba e a mineração', () => {
    const state = parseRankingUrl(new URLSearchParams('contato=sem&runId=abc&nicho=x&q=foo'));
    expect(clearFilters(state).ui).toEqual({ runId: 'abc', contato: 'sem' });
  });

  it('rótulos com contagem em pt-BR', () => {
    expect(contatoTabText('com', 1234)).toBe('Com contato (1.234)');
    expect(contatoTabText('sem', 0)).toBe('Sem contato (0)');
    expect(contatoTabText('sem', null)).toBe('Sem contato');
  });
});

describe('migração do trigger', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20261017000000_company_tem_contato/migration.sql'),
    'utf8',
  );

  it('o trigger usa exatamente os campos de computeTemContato', () => {
    for (const col of ['telefone', 'whatsappOsm', 'instagramOsm', 'emailOsm', 'temWhatsapp', 'temInstagram']) {
      expect(sql).toContain(`NEW."${col}"`);
    }
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON "Company"/);
  });

  it('a migração 20261020 redefine o trigger com o mesmo conjunto de brancos da função TypeScript', () => {
    const next = readFileSync(
      join(process.cwd(), 'prisma/migrations/20261020000000_tem_contato_whitespace/migration.sql'),
      'utf8',
    );
    // E' \t\n\r\f\v' no SQL = os mesmos caracteres de CONTACT_BLANK_CHARS (escapes literais no arquivo).
    const sqlSet = CONTACT_BLANK_CHARS.replace(/[\t\n\r\f\v]/g, (c) => ({ '\t': '\\t', '\n': '\\n', '\r': '\\r', '\f': '\\f', '\v': '\\v' })[c]!);
    expect(next).toContain("CREATE OR REPLACE FUNCTION \"company_set_tem_contato\"()");
    for (const col of ['telefone', 'whatsappOsm', 'instagramOsm', 'emailOsm']) {
      expect(next).toContain(`btrim(COALESCE(NEW."${col}", ''), E'${sqlSet}') <> ''`);
    }
    expect(next).toContain('COALESCE(NEW."temWhatsapp", false)');
    expect(next).toContain('COALESCE(NEW."temInstagram", false)');
    expect(next).toContain('UPDATE "Company" SET "telefone" = "telefone"');
  });

  it('cria as colunas, o backfill e o índice', () => {
    expect(sql).toContain('ADD COLUMN "emailOsm"');
    expect(sql).toContain('ADD COLUMN "temContato" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('UPDATE "Company" SET "telefone" = "telefone"');
    expect(sql).toContain('CREATE INDEX "Company_temContato_scoreFinal_idx"');
  });
});
