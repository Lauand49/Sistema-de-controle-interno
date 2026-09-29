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

/** Saída do Classificador (Req. 5.6): `motivos` tem de 1 a 5 itens. */
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
}
