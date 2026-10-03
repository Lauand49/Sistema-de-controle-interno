/**
 * Tipos compartilhados do Minerador de Leads.
 *
 * Arquivo isomórfico: somente tipos, sem imports de Node, Prisma ou módulos de servidor.
 *
 * Decisão sobre `CategoryCode`, `PriorityCode` e `NicheTier`:
 * esses tipos são "donos" conceituais de `config.ts` (junto com CATEGORY_LABEL, PRIORITY_LABEL,
 * ICP_POINTS etc.), mas são definidos AQUI como fonte única para evitar dependência circular
 * (`config.ts` precisará importar tipos deste arquivo e vice-versa). `config.ts` deve apenas
 * reexportá-los — `export type { CategoryCode, PriorityCode, NicheTier } from './types';` —
 * e nunca redeclará-los, para que ambos os caminhos de import resolvam para o mesmo tipo.
 */

/** Tier de ICP do nicho (1 = mais aderente). */
export type NicheTier = 1 | 2 | 3;

/** Categoria de serviço sugerida pelo Classificador (Req. 5). */
export type CategoryCode = 'CRIAR_SITE' | 'OTIMIZACAO_SEGURANCA' | 'ANALISE_DADOS_BI';

/** Prioridade derivada da pontuação final (>=70 ALTA, >=40 MEDIA, senão BAIXA). */
export type PriorityCode = 'ALTA' | 'MEDIA' | 'BAIXA';

/** Coordenada geográfica em graus decimais. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Empresa encontrada pela Fonte_OSM. */
export interface FoundCompany {
  /** "node/123" | "way/…" | "relation/…" */
  osmId: string;
  nome: string;
  nicho: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  marcaRede: string | null;
  /**
   * Tag OSM `contact:instagram` (bruta). Opcional para manter compatíveis os construtores da
   * Etapa 1; ausente equivale a `null`.
   */
  instagramOsm?: string | null;
  /** Tag OSM `contact:whatsapp` (bruta). Opcional; ausente equivale a `null`. */
  whatsappOsm?: string | null;
}

// ---------------------------------------------------------------------------
// Serviços externos e fontes (Etapa 2 — enriquecimento)
// ---------------------------------------------------------------------------

/** Serviço externo com cota mensal controlada. */
export type ExternalProvider = 'places' | 'pagespeed' | 'gemini';

/** Motivo pelo qual um serviço externo não está disponível. */
export type UnavailableReason = 'SEM_CHAVE' | 'COTA_ESGOTADA' | 'ERRO' | 'DESABILITADO_NA_MINERACAO';

/** Fonte de descoberta de uma Mineração. */
export type SourceMode = 'OSM' | 'GOOGLE' | 'MISTA';

/** Lugar devolvido pela Fonte_Google (Conteudo_Google, exceto `placeId`). */
export interface GooglePlace {
  placeId: string;
  nome: string;
  nicho: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  mapsUri: string | null;
  businessStatus: string | null;
  tipos: string[];
}

// ---------------------------------------------------------------------------
// Sinais digitais (Detector_Sinais)
// ---------------------------------------------------------------------------

/** Grupo do Catalogo_Tecnologias (definido aqui para evitar ciclo; reexportado por `config.ts`). */
export type TechGroup = 'CMS' | 'LOJA_VIRTUAL' | 'ANALYTICS' | 'MARKETING' | 'FRAMEWORK';

/** Origem de um sinal digital. */
export type SignalOrigin = 'SITE' | 'OSM';

/** Tecnologia detectada no site. */
export interface TechHit {
  id: string;
  label: string;
  group: TechGroup;
}

export interface SinaisDigitais {
  instagram: string | null;
  instagramOrigem: SignalOrigin | null;
  /** Somente dígitos, 12–13, iniciando com 55. */
  whatsapp: string | null;
  whatsappOrigem: SignalOrigin | null;
  /** Ordenadas por grupo (TECH_GROUP_ORDER) e rótulo; origem sempre SITE. */
  tecnologias: TechHit[];
}

// ---------------------------------------------------------------------------
// PageSpeed
// ---------------------------------------------------------------------------

export interface PageSpeedResult {
  /** 0..100 */
  desempenho: number;
  acessibilidade: number | null;
  boasPraticas: number | null;
  seo: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  urlAnalisada: string;
}

/** Motivo pelo qual não há resultado do PageSpeed. */
export type PageSpeedAbsence =
  | 'ERRO'
  | 'TIMEOUT'
  | 'RESPOSTA_INVALIDA'
  | 'COTA_ESGOTADA'
  | 'DESABILITADO_NA_MINERACAO'
  | 'SITE_OFFLINE'
  | 'SEM_SITE';

export type PageSpeedOutcome = { ok: true; result: PageSpeedResult } | { ok: false; reason: PageSpeedAbsence };

// ---------------------------------------------------------------------------
// CNPJ
// ---------------------------------------------------------------------------

/** Origem do CNPJ associado à Empresa. */
export type CnpjOrigin = 'SITE' | 'MANUAL';

/** Dados_CNPJ consultados na BrasilAPI. */
export interface CnpjData {
  /** 14 dígitos. */
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;
  situacaoData: string | null;
  cnaeCodigo: string | null;
  cnaeDescricao: string | null;
  porte: string | null;
  naturezaJuridica: string | null;
  mei: boolean | null;
  inicioAtividade: string | null;
  municipio: string | null;
  uf: string | null;
  /** ISO 8601. */
  consultadoEm: string;
}

/** Motivo pelo qual um CNPJ ficou como candidato (não associado automaticamente). */
export type CandidateReason =
  | 'MULTIPLOS'
  | 'CONFLITO'
  | 'UF_DIVERGENTE'
  | 'NAO_ENCONTRADO'
  | 'MANUAL_PRESERVADO'
  | 'CONSULTA_DESABILITADA';

export interface CnpjCandidate {
  cnpj: string;
  motivo: CandidateReason;
  /** Empresa que já possui o CNPJ (motivo CONFLITO). */
  conflitoCompanyId?: string;
}

/** Motivo de falha da análise do site (Req. 3). */
export type FailureReason =
  | 'TIMEOUT'
  | 'DNS'
  | 'CONEXAO_RECUSADA'
  | 'CONEXAO_ENCERRADA'
  | 'URL_INVALIDA'
  | 'DESTINO_BLOQUEADO'
  | 'EXCESSO_REDIRECIONAMENTOS'
  | 'HTTP_ERRO'
  | 'SSL';

/** Problema de certificado detectado. */
export type SslProblem = 'NAO_CONFIAVEL' | 'EXPIRADO' | 'DOMINIO_DIVERGENTE';

/** Resultado da análise técnica do site (Req. 3.1). */
export interface SiteAnalysis {
  hasSite: boolean;
  online: boolean;
  statusCode: number | null;
  /** Esquema da URL final. */
  isHttps: boolean;
  /** true só se a URL final é https e o certificado foi validado. */
  sslValid: boolean;
  /** Mantido mesmo após fallback http (Req. 3.4). */
  sslProblem: SslProblem | null;
  responseTimeMs: number | null;
  slow: boolean;
  failure: FailureReason | null;
  /** Ex.: "HTTP 503", "destino bloqueado". */
  failureDetail: string | null;
  finalUrl: string | null;
}

/**
 * Saída do Classificador (Etapa 1 Req. 5.6; Etapa 2 Req. 13.2): `motivos` tem de 1 a 6 itens.
 */
export interface ClassificationResult {
  category: CategoryCode;
  motivos: string[];
}

/** Resposta válida da IA. */
export interface AiResult {
  score: number;
  oportunidade: string;
  justificativa: string;
}

/** Motivo pelo qual a IA não produziu resultado. */
export type AiFailureReason = 'IA desabilitada' | 'sem resposta' | 'resposta inválida' | 'cota esgotada';

/** Resultado da chamada à IA. */
export type AiOutcome = { ok: true; result: AiResult } | { ok: false; reason: AiFailureReason };

/** Critério individual que contribuiu para um componente da pontuação. */
export interface ScoreCriterion {
  id: string;
  label: string;
  points: number;
}

/** Componente da pontuação (digital, ICP ou IA). */
export interface ScoreComponent {
  value: number;
  max: number;
  raw: number;
  criteria: ScoreCriterion[];
}

/**
 * Detalhamento da pontuação (Req. 6.9).
 * `'cota esgotada'` é reportado como `'sem resposta'` em `iaNaoUsadaMotivo`.
 */
export interface ScoreBreakdown {
  /** max 40 */
  digital: ScoreComponent;
  /** max 25 */
  icp: ScoreComponent;
  /** max 35; null quando não usada. */
  ia: ScoreComponent | null;
  iaNaoUsadaMotivo: Exclude<AiFailureReason, 'cota esgotada'> | null;
  /** 0..65 */
  objetivo: number;
  /** 0..100 */
  final: number;
  prioridade: PriorityCode;
  formula: 'OBJETIVO_MAIS_IA' | 'OBJETIVO_REESCALADO';
  /** Versão da pontuação: ausente = 1 (Análises antigas); 2 inclui Desempenho_Ruim. */
  versao?: 1 | 2;
}
