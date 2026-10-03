/**
 * **Validates: Requirements 12.8, 14.1, 15.2, 15.10**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPrompt, type AiInput, type CnpjAiFields } from '@/lib/leads/ai';
import { buildApproachPrompt, type ApproachInput } from '@/lib/leads/approach';
import type { CategoryCode, CnpjData, PageSpeedResult, SinaisDigitais, TechHit } from '@/lib/leads/types';
import { arbSiteAnalysis } from '../lead-miner/support/arb-site';

// Feature: lead-miner-enrichment, Property 34: For any Empresa, Analise, Dados_CNPJ (com razão social marcada por um texto único), Sinais_Digitais e usuário da sessão (com e-mail e nome completo únicos), o prompt do Analisador_IA e o do Gerador_Abordagem não contêm a razão social, o e-mail nem o sobrenome do usuário, nem dados de outros usuários; contêm o primeiro nome do usuário (só no Gerador_Abordagem), e contêm nome fantasia, CNAE, porte, situação e início de atividade quando presentes, além da presença de Instagram/WhatsApp e das tecnologias.

// ---------------------------------------------------------------------------
// Geradores: cada campo recebe um marcador único (prefixo próprio + hex), só com
// caracteres que JSON.stringify não escapa, para que a busca por substring seja exata.
// ---------------------------------------------------------------------------

const hex = fc.stringMatching(/^[0-9a-f]{12}$/);
const marker = (tag: string) => hex.map((h) => `${tag}${h}`);
const digits = (n: number) => fc.stringMatching(new RegExp(`^[0-9]{${n}}$`));

const arbTech: fc.Arbitrary<TechHit> = fc.record({
  id: marker('techid'),
  label: marker('TechLabel'),
  group: fc.constantFrom('CMS', 'LOJA_VIRTUAL', 'ANALYTICS', 'MARKETING', 'FRAMEWORK'),
});

const arbSinais: fc.Arbitrary<SinaisDigitais> = fc.record({
  instagram: fc.option(marker('igHandle'), { nil: null }),
  instagramOrigem: fc.option(fc.constantFrom('SITE' as const, 'OSM' as const), { nil: null }),
  whatsapp: fc.option(digits(11).map((d) => `55${d}`), { nil: null }),
  whatsappOrigem: fc.option(fc.constantFrom('SITE' as const, 'OSM' as const), { nil: null }),
  tecnologias: fc.array(arbTech, { maxLength: 4 }),
});

/** Dados_CNPJ completos + campos extras que nunca podem chegar à IA. */
const arbCnpjFull = fc.record({
  cnpj: digits(14),
  razaoSocial: marker('RazaoSocialSecreta'),
  nomeFantasia: fc.option(marker('NomeFantasia'), { nil: null }),
  situacao: fc.option(marker('Situacao'), { nil: null }),
  situacaoData: fc.option(marker('SituacaoData'), { nil: null }),
  cnaeCodigo: fc.option(marker('Cnae'), { nil: null }),
  cnaeDescricao: fc.option(marker('CnaeDesc'), { nil: null }),
  porte: fc.option(marker('Porte'), { nil: null }),
  naturezaJuridica: fc.option(marker('NaturezaSecreta'), { nil: null }),
  mei: fc.option(fc.boolean(), { nil: null }),
  inicioAtividade: fc.option(marker('Inicio'), { nil: null }),
  municipio: fc.option(marker('MunicipioSecreto'), { nil: null }),
  uf: fc.option(marker('UfSecreta'), { nil: null }),
  consultadoEm: marker('ConsultadoSecreto'),
  qsa: fc.array(fc.record({ nome: marker('SocioSecreto'), qual: marker('QualSecreta') }), { minLength: 1, maxLength: 3 }),
  email: marker('emailcnpjsecreto').map((m) => `${m}@empresa.com.br`),
  telefone: digits(11).map((d) => `tel${d}`),
});

const arbUser = fc.record({
  first: marker('Primeiro'),
  surname: marker('Sobrenome'),
  email: marker('usuario').map((m) => `${m}@scitecjr.com`),
});

const arbPageSpeed: fc.Arbitrary<PageSpeedResult | null> = fc.option(
  fc.record({
    desempenho: fc.integer({ min: 0, max: 100 }),
    acessibilidade: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    boasPraticas: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    seo: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    lcpMs: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: null }),
    cls: fc.option(fc.double({ min: 0, max: 2, noNaN: true }), { nil: null }),
    tbtMs: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: null }),
    fcpMs: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: null }),
    urlAnalisada: marker('https://url').map((u) => `${u}.com.br/`),
  }),
  { nil: null },
);

const arbScenario = fc.record({
  nome: marker('EmpresaNome'),
  nicho: marker('Nicho'),
  bairro: fc.option(marker('Bairro'), { nil: null }),
  cidade: fc.option(marker('Cidade'), { nil: null }),
  site: arbSiteAnalysis,
  sinais: arbSinais,
  cnpj: arbCnpjFull,
  user: arbUser,
  others: fc.array(arbUser, { minLength: 1, maxLength: 3 }),
  categoria: fc.constantFrom<CategoryCode>('CRIAR_SITE', 'OTIMIZACAO_SEGURANCA', 'ANALISE_DADOS_BI'),
  motivos: fc.array(marker('Motivo'), { minLength: 1, maxLength: 3 }),
  pagespeed: arbPageSpeed,
  oportunidadeIa: fc.option(marker('Oportunidade'), { nil: null }),
  canal: fc.constantFrom('WHATSAPP' as const, 'EMAIL' as const),
});

type Scenario = typeof arbScenario extends fc.Arbitrary<infer T> ? T : never;

function prompts(s: Scenario): { ai: string; approach: string } {
  // O chamador repassa o objeto completo (com extras): os módulos devem reprojetar.
  const cnpjAsPassed = s.cnpj as unknown as CnpjData & CnpjAiFields;
  const aiInput: AiInput = {
    nome: s.nome,
    nicho: s.nicho,
    bairro: s.bairro,
    cidade: s.cidade,
    site: s.site,
    sinais: s.sinais,
    cnpj: cnpjAsPassed,
  };
  // Primeiro nome do usuário da sessão: split no 1º espaço de User.name (Req. 15.10).
  const fullName = `${s.user.first} ${s.user.surname}`;
  const approachInput: ApproachInput = {
    nomeExibicao: s.cnpj.nomeFantasia ?? s.nome,
    nicho: s.nicho,
    bairro: s.bairro,
    cidade: s.cidade,
    categoria: s.categoria,
    motivos: s.motivos,
    pagespeed: s.pagespeed,
    sinais: s.sinais,
    cnpj: cnpjAsPassed,
    oportunidadeIa: s.oportunidadeIa,
    canal: s.canal,
    remetente: fullName.split(' ')[0],
  };
  return { ai: buildPrompt(aiInput), approach: buildApproachPrompt(approachInput) };
}

function forbidden(s: Scenario): string[] {
  const c = s.cnpj;
  const list = [
    c.razaoSocial,
    c.cnpj,
    c.consultadoEm,
    c.email,
    c.telefone,
    ...c.qsa.flatMap((q) => [q.nome, q.qual]),
    s.user.surname,
    s.user.email,
    ...s.others.flatMap((o) => [o.first, o.surname, o.email]),
    ...s.sinais.tecnologias.map((t) => t.id),
  ];
  for (const v of [c.situacaoData, c.naturezaJuridica, c.municipio, c.uf, s.sinais.instagram, s.sinais.whatsapp]) {
    if (v !== null) list.push(v);
  }
  if (s.pagespeed) list.push(s.pagespeed.urlAnalisada);
  return list;
}

function required(s: Scenario): string[] {
  const c = s.cnpj;
  const list = [c.nomeFantasia, c.cnaeCodigo, c.cnaeDescricao, c.porte, c.situacao, c.inicioAtividade].filter(
    (v): v is string => v !== null,
  );
  list.push(...s.sinais.tecnologias.map((t) => t.label));
  list.push(
    `"presencaDigital":{"instagram":${s.sinais.instagram !== null},"whatsapp":${s.sinais.whatsapp !== null}`,
  );
  return list;
}

describe('Property 34: minimização dos dados enviados ao Gemini', () => {
  it('nenhum prompt contém dados proibidos; ambos contêm os campos permitidos', () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const { ai, approach } = prompts(s);
        for (const p of [ai, approach]) {
          for (const f of forbidden(s)) expect(p).not.toContain(f);
          for (const r of required(s)) expect(p).toContain(r);
        }
        // Primeiro nome do usuário: só no Gerador_Abordagem.
        expect(approach).toContain(JSON.stringify(s.user.first));
        expect(ai).not.toContain(s.user.first);
      }),
      { numRuns: 200 },
    );
  });
});
