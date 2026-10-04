/**
 * Montagem do `CompanyDetail` v2 (Etapa 3) a partir do banco, no servidor.
 *
 * Centraliza a leitura da Empresa com Cache_Google, análises, mensagens de abordagem,
 * CNPJ e candidatos, e devolve o DTO exibido pela Ficha_Empresa — nunca o objeto de cache
 * cru (Req. 6.3, 6.8–6.11, 17). Reutilizado pela rota `GET /companies/[id]` e pelas rotas
 * de reanálise/CNPJ/abordagem (Req. 11, 15, 16).
 */
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { whatsappOpenLink } from './approach';
import { formatCnpj, parseCandidates } from './cnpj';
import {
  displayCompany,
  parsePageSpeedJson,
  type DisplaySource,
  type GoogleField,
  type NameOrigin,
} from './display';
import { isValidCoord } from './geo';
import type { CnpjCandidate, CnpjData, CnpjOrigin, PageSpeedAbsence, SinaisDigitais } from './types';

type Db = PrismaClient | Prisma.TransactionClient;

/** Aviso sobre o Conteudo_Google na ficha, derivado do último refresh (Req. 6.9, 6.10). */
export type GoogleNotice = 'INDISPONIVEL' | 'NAO_ENCONTRADO' | null;

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const PAGESPEED_ABSENCES: readonly PageSpeedAbsence[] = [
  'ERRO',
  'TIMEOUT',
  'RESPOSTA_INVALIDA',
  'COTA_ESGOTADA',
  'DESABILITADO_NA_MINERACAO',
  'SITE_OFFLINE',
  'SEM_SITE',
];
const asPageSpeedAbsence = (v: unknown): PageSpeedAbsence | null =>
  typeof v === 'string' ? PAGESPEED_ABSENCES.find((x) => x === v) ?? null : null;

/** Leitura defensiva de `CompanyAnalysis.sinais`; forma inesperada → null. */
function parseSinais(v: unknown): SinaisDigitais | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const tecnologias = Array.isArray(o.tecnologias)
    ? o.tecnologias.filter(
      (t): t is { group: string; label: string } =>
        !!t && typeof t === 'object' && typeof (t as { label?: unknown }).label === 'string',
    )
    : [];
  return {
    instagram: typeof o.instagram === 'string' ? o.instagram : null,
    instagramOrigem: (o.instagramOrigem as SinaisDigitais['instagramOrigem']) ?? null,
    whatsapp: typeof o.whatsapp === 'string' ? o.whatsapp : null,
    whatsappOrigem: (o.whatsappOrigem as SinaisDigitais['whatsappOrigem']) ?? null,
    tecnologias: tecnologias as SinaisDigitais['tecnologias'],
  };
}

/** `include` padrão para carregar tudo que a ficha v2 precisa. */
export const companyDetailInclude = {
  googleCache: true,
  assignedUser: { select: { id: true, name: true } },
  prospectLead: { select: { id: true, status: true, assignedTo: true, createdAt: true } },
  analyses: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] as const },
  approachMessages: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] as const,
    include: { author: { select: { id: true, name: true } } },
  },
  runs: {
    orderBy: [{ run: { createdAt: 'desc' } }, { id: 'desc' }] as const,
    select: {
      isNew: true,
      nicho: true,
      run: {
        select: {
          id: true,
          bairro: true,
          cidade: true,
          uf: true,
          status: true,
          processados: true,
          total: true,
          nichosFalhos: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.CompanyInclude;

type CompanyWithDetail = Prisma.CompanyGetPayload<{ include: typeof companyDetailInclude }>;

/** Converte a linha do Cache_Google do Prisma na forma que `displayCompany` espera (`tipos: string[]`). */
function toGoogleCacheRow(cache: CompanyWithDetail['googleCache']): DisplaySource['googleCache'] {
  if (!cache) return null;
  return {
    nome: cache.nome,
    endereco: cache.endereco,
    bairro: cache.bairro,
    cidade: cache.cidade,
    uf: cache.uf,
    telefone: cache.telefone,
    website: cache.website,
    latitude: cache.latitude,
    longitude: cache.longitude,
    mapsUri: cache.mapsUri,
    businessStatus: cache.businessStatus,
    tipos: toStringArray(cache.tipos),
    obtidoEm: cache.obtidoEm,
    expiraEm: cache.expiraEm,
  };
}

/** Nome mais recente conhecido do WhatsApp (OSM ou último `sinais`), só dígitos; para o link (Req. 15.7). */
function latestWhatsapp(company: CompanyWithDetail): string | null {
  if (company.whatsappOsm) return company.whatsappOsm;
  for (const a of company.analyses) {
    const s = parseSinais(a.sinais);
    if (s?.whatsapp) return s.whatsapp;
  }
  return null;
}

/**
 * Monta o DTO v2 da Ficha_Empresa. `googleNotice` reflete um refresh recém-executado (Req. 6.9, 6.10);
 * sem refresh é `null`. `now` controla a validade do Cache_Google.
 */
export async function buildCompanyDetail(
  db: Db,
  company: CompanyWithDetail,
  now: Date,
  googleNotice: GoogleNotice = null,
): Promise<Record<string, unknown>> {
  const display = displayCompany(
    {
      nome: company.nome,
      endereco: company.endereco,
      bairro: company.bairro,
      cidade: company.cidade,
      uf: company.uf,
      telefone: company.telefone,
      website: company.website,
      latitude: company.latitude,
      longitude: company.longitude,
      googlePlaceId: company.googlePlaceId,
      cnpjNomeFantasia: company.cnpjNomeFantasia,
      googleCache: toGoogleCacheRow(company.googleCache),
    },
    now,
  );

  // CNPJ formatado + Dados_CNPJ (quando os dados são do CNPJ aplicado).
  let cnpj: Record<string, unknown> | null = null;
  if (company.cnpj && company.cnpjOrigem) {
    const dados = company.cnpjDadosCnpj === company.cnpj ? cnpjDataFromCompany(company) : null;
    cnpj = {
      valor: company.cnpj,
      formatado: safeFormat(company.cnpj),
      origem: company.cnpjOrigem as CnpjOrigin,
      dados,
      status: company.cnpjStatus,
    };
  }

  // Candidatos: forma mascarada + nome da Empresa em conflito (Req. 17.3).
  const candidates = parseCandidates(company.cnpjCandidatos);
  const conflitoIds = candidates
    .map((c) => c.conflitoCompanyId)
    .filter((id): id is string => typeof id === 'string');
  const conflitoNomes = new Map<string, string>();
  if (conflitoIds.length > 0) {
    const rows = await db.company.findMany({
      where: { id: { in: conflitoIds } },
      select: { id: true, nome: true, nomeExibicao: true },
    });
    for (const r of rows) conflitoNomes.set(r.id, r.nomeExibicao || r.nome || r.id);
  }
  const cnpjCandidatos = candidates.map((c: CnpjCandidate) => ({
    ...c,
    formatado: safeFormat(c.cnpj),
    conflito: c.conflitoCompanyId
      ? { id: c.conflitoCompanyId, nome: conflitoNomes.get(c.conflitoCompanyId) ?? c.conflitoCompanyId }
      : null,
  }));

  const analyses = company.analyses.map((a) => ({
    id: a.id,
    runId: a.runId,
    hasSite: a.hasSite,
    online: a.online,
    statusCode: a.statusCode,
    isHttps: a.isHttps,
    sslValid: a.sslValid,
    sslProblem: a.sslProblem,
    responseTime: a.responseTime,
    lento: a.lento,
    motivoFalha: a.motivoFalha,
    finalUrl: a.finalUrl,
    categoria: a.categoria,
    motivos: toStringArray(a.motivos),
    scoreDigital: a.scoreDigital,
    scoreIcp: a.scoreIcp,
    scoreObjetivo: a.scoreObjetivo,
    scoreIa: a.scoreIa,
    scoreFinal: a.scoreFinal,
    prioridade: a.prioridade,
    iaAplicada: a.iaAplicada,
    iaMotivo: a.iaMotivo,
    oportunidadeIa: a.oportunidadeIa,
    justificativaIa: a.justificativaIa,
    detalhamento: a.detalhamento,
    versaoScore: a.versaoScore === 1 ? 1 : 2,
    sinais: parseSinais(a.sinais),
    pagespeed: parsePageSpeedJson(a.pagespeed),
    pagespeedMotivo: asPageSpeedAbsence(a.pagespeedMotivo),
    tecnologias: toStringArray(a.tecnologias),
  }));

  const whats = latestWhatsapp(company);
  const mensagens = company.approachMessages.map((m) => ({
    id: m.id,
    canal: m.canal,
    origem: m.origem,
    assunto: m.assunto,
    texto: m.texto,
    fallback: m.fallback,
    analysisId: m.analysisId,
    author: { id: m.author.id, name: m.author.name },
    createdAt: m.createdAt,
    whatsappLink: m.canal === 'WHATSAPP' ? whatsappOpenLink(whats, m.texto) : null,
  }));

  const coordsOk = isValidCoord(display.latitude, display.longitude);
  const google = display.google
    ? { ...display.google, aviso: googleNotice }
    : googleNotice !== null && company.googlePlaceId
      ? { placeId: company.googlePlaceId, mapsLink: '', cacheStatus: 'AUSENTE' as const, aviso: googleNotice }
      : null;

  return {
    id: company.id,
    nome: display.nome,
    nomeOrigem: display.nomeOrigem as NameOrigin,
    googleFields: display.googleFields as GoogleField[],
    nicho: company.nicho,
    endereco: display.endereco,
    bairro: display.bairro,
    cidade: display.cidade,
    uf: display.uf,
    telefone: display.telefone,
    website: display.website,
    latitude: coordsOk ? display.latitude : null,
    longitude: coordsOk ? display.longitude : null,
    marcaRede: company.marcaRede,
    fonte: company.fonte,
    categoria: company.categoria,
    scoreFinal: company.scoreFinal,
    prioridade: company.prioridade,
    hasSite: company.hasSite,
    isHttps: company.isHttps,
    lastAnalyzedAt: company.lastAnalyzedAt,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    google,
    osmId: company.osmId,
    cnpj,
    cnpjCandidatos,
    temInstagram: company.temInstagram,
    temWhatsapp: company.temWhatsapp,
    situacaoCadastral: company.situacaoCadastral,
    assignedUser: company.assignedUser ? { id: company.assignedUser.id, name: company.assignedUser.name } : null,
    prospectLead: company.prospectLead,
    analyses,
    mensagens,
    runs: company.runs.map(({ isNew, nicho, run }) => ({
      isNew,
      nicho,
      run: { ...run, nichosFalhos: toStringArray(run.nichosFalhos) },
    })),
  };
}

/** Carrega a Empresa e monta o DTO; `null` se não existir. */
export async function loadCompanyDetail(
  db: Db,
  id: string,
  now: Date,
  googleNotice: GoogleNotice = null,
): Promise<Record<string, unknown> | null> {
  const company = await db.company.findUnique({ where: { id }, include: companyDetailInclude });
  if (!company) return null;
  return buildCompanyDetail(db, company, now, googleNotice);
}

function safeFormat(cnpj: string): string {
  try {
    return formatCnpj(cnpj);
  } catch {
    return cnpj;
  }
}

/** Reconstrói `CnpjData` a partir das colunas da Empresa (quando os dados são do CNPJ aplicado). */
function cnpjDataFromCompany(c: CompanyWithDetail): CnpjData | null {
  if (!c.cnpj) return null;
  return {
    cnpj: c.cnpj,
    razaoSocial: c.cnpjRazaoSocial,
    nomeFantasia: c.cnpjNomeFantasia,
    situacao: c.situacaoCadastral,
    situacaoData: c.cnpjSituacaoData,
    cnaeCodigo: c.cnpjCnaeCodigo,
    cnaeDescricao: c.cnpjCnaeDescricao,
    porte: c.cnpjPorte,
    naturezaJuridica: c.cnpjNatureza,
    mei: c.cnpjMei,
    inicioAtividade: c.cnpjInicioAtividade,
    municipio: c.cnpjMunicipio,
    uf: c.cnpjUf,
    consultadoEm: (c.cnpjConsultadoEm ?? c.updatedAt).toISOString(),
  };
}
