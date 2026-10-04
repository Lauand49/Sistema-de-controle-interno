/**
 * Validação de parâmetros e filtros do Minerador de Leads (funções puras).
 *
 * Arquivo isomórfico: usado pelas rotas de API e pelas telas. Não importa módulos de Node
 * nem a instância do Prisma — de `@prisma/client` vêm apenas tipos (apagados na compilação).
 */
import { z } from 'zod';
import type {
  ApproachChannel,
  CompanyCategory,
  LeadPriority,
  MiningSource,
  MiningStatus,
  Prisma,
} from '@prisma/client';
import { BULK_MAX, MAP_MAX, NICHES, PRESETS, UFS, type PresetId } from './config';
import { isValidCnpj, normalizeCnpj } from './cnpj';
import { isValidCoord } from './geo';
import { normalizeText } from './text';

// ---------------------------------------------------------------------------
// Constantes de domínio (valores em tempo de execução espelhando os enums do Prisma)
// ---------------------------------------------------------------------------

const PRESET_IDS = ['icp', 'produto', 'servico', 'todos'] as const satisfies readonly PresetId[];
const CATEGORIES = [
  'CRIAR_SITE',
  'OTIMIZACAO_SEGURANCA',
  'ANALISE_DADOS_BI',
] as const satisfies readonly CompanyCategory[];
const PRIORITIES = ['ALTA', 'MEDIA', 'BAIXA'] as const satisfies readonly LeadPriority[];
const SOURCES = ['OSM', 'GOOGLE', 'MISTA'] as const satisfies readonly MiningSource[];
const CHANNELS = ['WHATSAPP', 'EMAIL'] as const satisfies readonly ApproachChannel[];
const RUN_STATUSES = [
  'PENDENTE',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'ERRO',
  'CANCELADA',
] as const satisfies readonly MiningStatus[];
/** Status possíveis de `ProspectLead.status`. */
export const LEAD_STATUSES = ['RAW', 'PENDING', 'IN_PROGRESS', 'CONVERTED_TO_PIPE', 'DISCARDED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Valor especial "sem valor" para Responsável e status do lead. */
export const NONE = 'NONE' as const;
/** Valor especial "sem prioridade" (empresa não analisada). */
export const NO_PRIORITY = 'SEM' as const;

const NICHE_IDS = new Set(NICHES.map((n) => n.id));
const UF_SET = new Set(UFS);
const TEXT_MAX = 100;
const SCORE_MIN = 0;
const SCORE_MAX = 100;

export const MSG = {
  bairro: 'Informe o bairro (1 a 100 caracteres).',
  cidade: 'Informe a cidade (1 a 100 caracteres).',
  uf: 'Selecione uma UF válida.',
  nichos: 'Selecione de 1 a 22 nichos válidos, sem repetição.',
  preset: 'Preset inválido.',
  booleano: 'Valor inválido.',
  texto: 'Informe de 1 a 100 caracteres.',
  nicho: 'Nicho inválido.',
  categoria: 'Categoria inválida.',
  prioridade: 'Prioridade inválida.',
  fonte: 'Fonte inválida.',
  status: 'Status inválido.',
  leadStatus: 'Status do lead inválido.',
  responsavel: 'Responsável inválido.',
  mineracao: 'Mineração inválida.',
  score: 'Faixa de score inválida (0 a 100, mínimo ≤ máximo)',
  data: 'Data inválida (use AAAA-MM-DD).',
  intervaloDatas: 'Intervalo de datas inválido (data inicial posterior à final).',
  pagina: 'Página inválida.',
  bulk: 'Selecione de 1 a 200 empresas.',
  bulkRepetido: 'Há empresas repetidas na seleção.',
  bulkId: 'Identificador de empresa inválido.',
  nenhumNicho: 'Nenhum nicho pôde ser consultado no OpenStreetMap',
  canal: 'Canal inválido (use WhatsApp ou E-mail).',
  cnpj: 'CNPJ inválido',
  campoDesconhecido: 'Campo não permitido.',
} as const;

// ---------------------------------------------------------------------------
// Utilitários de schema
// ---------------------------------------------------------------------------

/** Converte `''`/só espaços/`null` em `undefined` (parâmetros de query vazios = filtro ausente). */
const blankToUndefined = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;

const optionalText = z.preprocess(
  blankToUndefined,
  z.string({ invalid_type_error: MSG.texto }).trim().min(1, MSG.texto).max(TEXT_MAX, MSG.texto).optional(),
);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess(blankToUndefined, z.enum(values, { errorMap: () => ({ message }) }).optional());

const optionalBool = z.preprocess(
  (v) => {
    const b = blankToUndefined(v);
    if (b === 'true') return true;
    if (b === 'false') return false;
    return b;
  },
  z.boolean({ invalid_type_error: MSG.booleano }).optional(),
);

/** Score inteiro 0–100, aceito como número ou string de dígitos. */
const optionalScore = z.preprocess(
  (v) => {
    const b = blankToUndefined(v);
    if (typeof b === 'string') return /^\s*\d+\s*$/.test(b) ? Number(b) : Number.NaN;
    return b;
  },
  z
    .number({ invalid_type_error: MSG.score })
    .int(MSG.score)
    .min(SCORE_MIN, MSG.score)
    .max(SCORE_MAX, MSG.score)
    .optional(),
);

/** `AAAA-MM-DD` com data de calendário real. */
export function isValidDateString(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const optionalDate = z.preprocess(
  blankToUndefined,
  z
    .string({ invalid_type_error: MSG.data })
    .trim()
    .refine(isValidDateString, MSG.data)
    .optional(),
);

const optionalUuid = (message: string) =>
  z.preprocess(blankToUndefined, z.string({ invalid_type_error: message }).trim().uuid(message).optional());

const pageParam = z.preprocess(
  (v) => {
    const b = blankToUndefined(v);
    if (typeof b === 'string') return /^\s*\d+\s*$/.test(b) ? Number(b) : Number.NaN;
    return b;
  },
  z.number({ invalid_type_error: MSG.pagina }).int(MSG.pagina).min(1, MSG.pagina).default(1),
);

/** Fuso das datas de filtro (Brasília, sem horário de verão desde 2019). */
const TZ_OFFSET = '-03:00';
const DAY_MS = 86_400_000;
/** Início do dia `AAAA-MM-DD` no fuso de Brasília. */
export function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000${TZ_OFFSET}`);
}
/** Início do dia seguinte a `AAAA-MM-DD` (limite exclusivo de intervalo inclusivo). */
export function startOfNextDay(date: string): Date {
  return new Date(startOfDay(date).getTime() + DAY_MS);
}

/** Converte `URLSearchParams` em objeto simples (última ocorrência vence) para os schemas. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** Mapeia os erros do zod em `{ campo: mensagem }` (primeira mensagem de cada campo). */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Parâmetros da mineração (Req. 8.10, 10.1–10.3, 18.4, 18.5, 18.7)
// ---------------------------------------------------------------------------

export interface RunInput {
  bairro: string;
  cidade: string;
  uf: string;
  nichos: string[];
  excluirRedes: boolean;
  iaEnabled: boolean;
  /** Modo_Fonte solicitado (padrão `MISTA`, Req. 4.3). */
  fonte: MiningSource;
  /** Analisar desempenho pelo PageSpeed (padrão `true`, Req. 10.1). */
  pagespeedEnabled: boolean;
  /** Consultar CNPJ na BrasilAPI (padrão `true`, Req. 12.7). */
  cnpjEnabled: boolean;
}

const nichosSchema = z
  .array(z.string({ invalid_type_error: MSG.nichos }), {
    invalid_type_error: MSG.nichos,
    required_error: MSG.nichos,
  })
  .min(1, MSG.nichos)
  .max(NICHES.length, MSG.nichos)
  .refine((ids) => ids.every((id) => NICHE_IDS.has(id)), MSG.nichos)
  .refine((ids) => new Set(ids).size === ids.length, MSG.nichos);

const runInputObject = z.object({
  bairro: z
    .string({ required_error: MSG.bairro, invalid_type_error: MSG.bairro })
    .trim()
    .min(1, MSG.bairro)
    .max(TEXT_MAX, MSG.bairro),
  cidade: z
    .string({ required_error: MSG.cidade, invalid_type_error: MSG.cidade })
    .trim()
    .min(1, MSG.cidade)
    .max(TEXT_MAX, MSG.cidade),
  uf: z
    .string({ required_error: MSG.uf, invalid_type_error: MSG.uf })
    .refine((uf) => UF_SET.has(uf), MSG.uf),
  nichos: nichosSchema,
  preset: z.enum(PRESET_IDS, { errorMap: () => ({ message: MSG.preset }) }).optional(),
  excluirRedes: z.boolean({ invalid_type_error: MSG.booleano }).default(false),
  iaEnabled: z.boolean({ invalid_type_error: MSG.booleano }).default(false),
  fonte: z.enum(SOURCES, { errorMap: () => ({ message: MSG.fonte }) }).default('MISTA'),
  pagespeedEnabled: z.boolean({ invalid_type_error: MSG.booleano }).default(true),
  cnpjEnabled: z.boolean({ invalid_type_error: MSG.booleano }).default(true),
});

const isPresetId = (v: unknown): v is PresetId =>
  typeof v === 'string' && (PRESET_IDS as readonly string[]).includes(v);

/**
 * Schema da criação de mineração. Campos desconhecidos (ex.: `createdById`, `userId`) são
 * descartados (Req. 18.4). `nichos` explícito tem precedência; sem ele, o preset válido é
 * expandido para a lista de nichos da configuração.
 */
export const runInputSchema: z.ZodType<RunInput, z.ZodTypeDef, unknown> = z.preprocess(
  (raw) => {
    const obj: Record<string, unknown> =
      raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as object) } : {};
    if (obj.nichos === undefined && isPresetId(obj.preset)) obj.nichos = [...PRESETS[obj.preset]];
    return obj;
  },
  runInputObject.transform(
    (v): RunInput => ({
      bairro: v.bairro,
      cidade: v.cidade,
      uf: v.uf,
      nichos: v.nichos,
      excluirRedes: v.excluirRedes,
      iaEnabled: v.iaEnabled,
      fonte: v.fonte,
      pagespeedEnabled: v.pagespeedEnabled,
      cnpjEnabled: v.cnpjEnabled,
    }),
  ),
);

export function validateRunInput(
  raw: unknown,
): { ok: true; value: RunInput } | { ok: false; fields: Record<string, string> } {
  const parsed = runInputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, fields: zodFieldErrors(parsed.error) };
}

/** Chave que identifica os parâmetros de uma mineração (Req. 10.4, 18.7). */
export function buildRunParamsKey(i: Pick<RunInput, 'bairro' | 'cidade' | 'uf' | 'nichos'>): string {
  const nichos = Array.from(new Set(i.nichos)).sort().join(',');
  // Escapa `\` e `|` no texto livre para que "a|b"+"c" e "a"+"b|c" não gerem a mesma chave.
  const esc = (s: string) => normalizeText(s).replace(/[\\|]/g, '\\$&');
  return `${esc(i.bairro)}|${esc(i.cidade)}|${i.uf}|${nichos}`;
}

// ---------------------------------------------------------------------------
// Corpos das rotas da Ficha (Req. 11.7, 20.3, 20.5)
// ---------------------------------------------------------------------------

/** Identificadores de autor que o cliente pode enviar; são descartados — o autor vem da sessão (Req. 20.3). */
const AUTHOR_ID_KEYS = ['createdById', 'authorId', 'userId', 'actorId'] as const;

const dropAuthorIds = (raw: unknown): unknown => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const key of AUTHOR_ID_KEYS) delete obj[key];
  return obj;
};

/** `POST /companies/[id]/approach`: `{ canal: 'WHATSAPP' | 'EMAIL' }`; outros campos → 400. */
export const approachBodySchema: z.ZodType<{ canal: ApproachChannel }, z.ZodTypeDef, unknown> = z.preprocess(
  dropAuthorIds,
  z
    .object({
      canal: z.enum(CHANNELS, { errorMap: () => ({ message: MSG.canal }) }),
    })
    .strict(MSG.campoDesconhecido),
);

/**
 * `PUT /companies/[id]/cnpj`: `{ cnpj }` aceito com ou sem máscara, validado pelo Validador_CNPJ
 * e devolvido normalizado (14 caracteres, maiúsculas). Inválido → "CNPJ inválido" (Req. 11.7).
 */
export const cnpjBodySchema: z.ZodType<{ cnpj: string }, z.ZodTypeDef, unknown> = z.preprocess(
  dropAuthorIds,
  z
    .object({
      cnpj: z
        .string({ required_error: MSG.cnpj, invalid_type_error: MSG.cnpj })
        .refine(isValidCnpj, MSG.cnpj)
        .transform(normalizeCnpj),
    })
    .strict(MSG.campoDesconhecido),
);

/** Desfecho do fim da descoberta (Req. 2.11, 2.13, 8.13). */
export function finalizeDiscovery(
  selecionados: string[],
  falhos: string[],
  total: number,
): { status: 'ERRO' | 'CONCLUIDA' | 'EM_ANDAMENTO'; errorMessage: string | null } {
  const failed = new Set(falhos);
  if (selecionados.every((id) => failed.has(id))) {
    return { status: 'ERRO', errorMessage: MSG.nenhumNicho };
  }
  return { status: total === 0 ? 'CONCLUIDA' : 'EM_ANDAMENTO', errorMessage: null };
}

/** Falso somente para `ERRO` com `processados = 0` (Req. 10.11, 10.12, 11.5, 11.9). */
export function canOpenRanking(r: { status: MiningStatus; processados: number }): boolean {
  return !(r.status === 'ERRO' && r.processados === 0);
}

// ---------------------------------------------------------------------------
// Histórico de minerações (Req. 11.2, 11.3, 11.7, 18.5)
// ---------------------------------------------------------------------------

export interface RunsListQuery {
  q?: string;
  uf?: string;
  status?: MiningStatus;
  fonte?: MiningSource;
  from?: string;
  to?: string;
  page: number;
}

export const runsListSchema: z.ZodType<RunsListQuery, z.ZodTypeDef, unknown> = z
  .object({
    q: optionalText,
    uf: z.preprocess(blankToUndefined, z.string().refine((uf) => UF_SET.has(uf), MSG.uf).optional()),
    status: optionalEnum(RUN_STATUSES, MSG.status),
    fonte: optionalEnum(SOURCES, MSG.fonte),
    from: optionalDate,
    to: optionalDate,
    page: pageParam,
  })
  .superRefine((v, ctx) => {
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: MSG.intervaloDatas });
    }
  });

/**
 * Busca do histórico: `q` (normalizado) é substring de bairro, cidade ou nome do autor
 * (normalizados). `q` vazio após trim casa com tudo (Req. 11.2).
 */
export function matchesRunSearch(
  run: { bairro: string; cidade: string },
  authorName: string,
  q: string,
): boolean {
  const term = normalizeText(q);
  if (term === '') return true;
  return [run.bairro, run.cidade, authorName].some((field) => normalizeText(field).includes(term));
}

// ---------------------------------------------------------------------------
// Filtros do ranking (Req. 12.1–12.3, 12.9–12.11, 13.1, 13.2, 18.5, 18.6, 18.9)
// ---------------------------------------------------------------------------

export interface CompanyFilters {
  q?: string;
  cidade?: string;
  bairro?: string;
  uf?: string;
  nicho?: string;
  categoria?: CompanyCategory;
  prioridade?: LeadPriority | typeof NO_PRIORITY;
  scoreMin?: number;
  scoreMax?: number;
  hasSite?: boolean;
  isHttps?: boolean;
  fonte?: MiningSource;
  /** id do usuário ou `NONE` (sem responsável). */
  assignedTo?: string;
  /** status do `ProspectLead` ou `NONE` (não enviada para triagem). */
  leadStatus?: LeadStatus | typeof NONE;
  /** `AAAA-MM-DD`, inclusivo. */
  analyzedFrom?: string;
  /** `AAAA-MM-DD`, inclusivo. */
  analyzedTo?: string;
  runId?: string;
  temInstagram?: boolean;
  temWhatsapp?: boolean;
  temCnpj?: boolean;
  situacao?: string;
  desempenhoRuim?: boolean;
}

const companyFiltersShape = {
  q: optionalText,
  cidade: optionalText,
  bairro: optionalText,
  uf: z.preprocess(blankToUndefined, z.string().refine((uf) => UF_SET.has(uf), MSG.uf).optional()),
  nicho: z.preprocess(
    blankToUndefined,
    z.string({ invalid_type_error: MSG.nicho }).refine((id) => NICHE_IDS.has(id), MSG.nicho).optional(),
  ),
  categoria: optionalEnum(CATEGORIES, MSG.categoria),
  prioridade: optionalEnum([...PRIORITIES, NO_PRIORITY] as const, MSG.prioridade),
  scoreMin: optionalScore,
  scoreMax: optionalScore,
  hasSite: optionalBool,
  isHttps: optionalBool,
  fonte: optionalEnum(SOURCES, MSG.fonte),
  assignedTo: z.preprocess(
    blankToUndefined,
    z.string({ invalid_type_error: MSG.responsavel }).trim().min(1, MSG.responsavel).max(TEXT_MAX, MSG.responsavel).optional(),
  ),
  leadStatus: optionalEnum([...LEAD_STATUSES, NONE] as const, MSG.leadStatus),
  analyzedFrom: optionalDate,
  analyzedTo: optionalDate,
  runId: optionalUuid(MSG.mineracao),
  temInstagram: optionalBool,
  temWhatsapp: optionalBool,
  temCnpj: optionalBool,
  situacao: optionalText,
  desempenhoRuim: optionalBool,
};

type FiltersShapeOutput = z.infer<z.ZodObject<typeof companyFiltersShape>>;

function refineCompanyFilters(v: FiltersShapeOutput, ctx: z.RefinementCtx) {
  if (v.scoreMin !== undefined && v.scoreMax !== undefined && v.scoreMin > v.scoreMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scoreMin'], message: MSG.score });
  }
  if (v.analyzedFrom && v.analyzedTo && v.analyzedFrom > v.analyzedTo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['analyzedFrom'], message: MSG.intervaloDatas });
  }
}

/** Filtros do ranking, mapa e exportação. Parâmetros vazios equivalem a filtro ausente. */
export const companyFiltersSchema: z.ZodType<CompanyFilters, z.ZodTypeDef, unknown> = z
  .object(companyFiltersShape)
  .superRefine(refineCompanyFilters);

/** `GET /companies`: filtros + `page` (inteiro ≥ 1, padrão 1). */
export const companyListSchema: z.ZodType<CompanyFilters & { page: number }, z.ZodTypeDef, unknown> = z
  .object({ ...companyFiltersShape, page: pageParam })
  .superRefine(refineCompanyFilters);

/** Seleção em lote: 1 a 200 uuids distintos (Req. 15.12, 16.7, 18.5). */
export const bulkIdsSchema: z.ZodType<string[], z.ZodTypeDef, unknown> = z
  .array(z.string({ invalid_type_error: MSG.bulkId }).uuid(MSG.bulkId), {
    required_error: MSG.bulk,
    invalid_type_error: MSG.bulk,
  })
  .min(1, MSG.bulk)
  .max(BULK_MAX, MSG.bulk)
  .refine((ids) => new Set(ids).size === ids.length, MSG.bulkRepetido);

/**
 * Converte filtros validados em `where` do Prisma. Todo texto usa `mode: 'insensitive'`.
 * O nome do Cache_Google só casa a busca `q` quando o cache ainda é válido (`expiraEm > now`),
 * para que Conteudo_Google expirado nunca apareça na listagem (Req. 6.5, 18.2).
 */
export function buildCompanyWhere(f: CompanyFilters, now: Date = new Date()): Prisma.CompanyWhereInput {
  const and: Prisma.CompanyWhereInput[] = [];
  const insensitive = 'insensitive' as const;

  if (f.q) {
    and.push({
      OR: [
        { nome: { contains: f.q, mode: insensitive } },
        { cnpjNomeFantasia: { contains: f.q, mode: insensitive } },
        { googleCache: { nome: { contains: f.q, mode: insensitive }, expiraEm: { gt: now } } },
        { endereco: { contains: f.q, mode: insensitive } },
        { telefone: { contains: f.q, mode: insensitive } },
      ],
    });
  }
  if (f.cidade) and.push({ cidade: { contains: f.cidade, mode: insensitive } });
  if (f.bairro) and.push({ bairro: { contains: f.bairro, mode: insensitive } });
  if (f.uf) and.push({ uf: { equals: f.uf, mode: insensitive } });
  if (f.nicho) and.push({ nicho: { equals: f.nicho, mode: insensitive } });
  if (f.categoria) and.push({ categoria: f.categoria });
  if (f.prioridade) and.push({ prioridade: f.prioridade === NO_PRIORITY ? null : f.prioridade });
  if (f.scoreMin !== undefined || f.scoreMax !== undefined) {
    and.push({
      scoreFinal: {
        ...(f.scoreMin !== undefined ? { gte: f.scoreMin } : {}),
        ...(f.scoreMax !== undefined ? { lte: f.scoreMax } : {}),
      },
    });
  }
  if (f.hasSite !== undefined) and.push({ hasSite: f.hasSite });
  if (f.isHttps !== undefined) and.push({ isHttps: f.isHttps });
  if (f.fonte) and.push({ fonte: f.fonte });
  if (f.assignedTo) and.push({ assignedTo: f.assignedTo === NONE ? null : f.assignedTo });
  if (f.leadStatus) {
    and.push({
      prospectLead:
        f.leadStatus === NONE
          ? { is: null }
          : { is: { status: { equals: f.leadStatus, mode: insensitive } } },
    });
  }
  if (f.analyzedFrom || f.analyzedTo) {
    and.push({
      lastAnalyzedAt: {
        ...(f.analyzedFrom ? { gte: startOfDay(f.analyzedFrom) } : {}),
        ...(f.analyzedTo ? { lt: startOfNextDay(f.analyzedTo) } : {}),
      },
    });
  }
  if (f.runId) and.push({ runs: { some: { runId: f.runId } } });
  if (f.temInstagram !== undefined) and.push({ temInstagram: f.temInstagram });
  if (f.temWhatsapp !== undefined) and.push({ temWhatsapp: f.temWhatsapp });
  if (f.temCnpj !== undefined) {
    and.push(f.temCnpj ? { cnpj: { not: null } } : { cnpj: null });
  }
  if (f.situacao) and.push({ situacaoCadastral: { equals: f.situacao, mode: insensitive } });
  if (f.desempenhoRuim !== undefined) and.push({ desempenhoRuim: f.desempenhoRuim });

  return and.length > 0 ? { AND: and } : {};
}

// ---------------------------------------------------------------------------
// Ordenação do ranking (Req. 12.1, 17.1)
// ---------------------------------------------------------------------------

/** Ordenação única de lista, mapa e CSV: score desc (sem análise ao final), nome asc, id asc. */
export const RANKING_ORDER: Prisma.CompanyOrderByWithRelationInput[] = [
  { scoreFinal: { sort: 'desc', nulls: 'last' } },
  { nomeExibicao: 'asc' },
  { id: 'asc' },
];

export interface RankKey {
  id: string;
  nomeExibicao: string;
  scoreFinal: number | null;
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Mesma regra de `RANKING_ORDER`, para ordenar em memória. */
export function compareRanking(a: RankKey, b: RankKey): number {
  const aNull = a.scoreFinal === null;
  const bNull = b.scoreFinal === null;
  if (aNull !== bNull) return aNull ? 1 : -1;
  if (!aNull && !bNull && a.scoreFinal !== b.scoreFinal) {
    return (b.scoreFinal as number) - (a.scoreFinal as number);
  }
  return cmpStr(a.nomeExibicao, b.nomeExibicao) || cmpStr(a.id, b.id);
}

/**
 * Pontos do mapa: empresas com coordenadas válidas (sem repetição de id), ordenadas pelo
 * ranking e limitadas a `max`. `total` conta todas as válidas; `shown` = `points.length`.
 */
export function selectMapPoints<T extends RankKey & { latitude: number | null; longitude: number | null }>(
  rows: T[],
  max: number = MAP_MAX,
): { points: T[]; shown: number; total: number } {
  const seen = new Set<string>();
  const valid: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id) || !isValidCoord(row.latitude, row.longitude)) continue;
    seen.add(row.id);
    valid.push(row);
  }
  valid.sort(compareRanking);
  const points = valid.slice(0, Math.max(0, max));
  return { points, shown: points.length, total: valid.length };
}

// ---------------------------------------------------------------------------
// Estado da Tela_Ranking → query string (Req. 12.9–12.11)
// ---------------------------------------------------------------------------

/** Valores crus dos controles da Tela_Ranking (`''` ou ausente = filtro não preenchido). */
export type RankingUiState = Partial<Record<keyof CompanyFilters, string>>;

const RANKING_KEYS: readonly Exclude<keyof CompanyFilters, 'scoreMin' | 'scoreMax'>[] = [
  'q',
  'cidade',
  'bairro',
  'uf',
  'nicho',
  'categoria',
  'prioridade',
  'hasSite',
  'isHttps',
  'fonte',
  'assignedTo',
  'leadStatus',
  'analyzedFrom',
  'analyzedTo',
  'runId',
  'temInstagram',
  'temWhatsapp',
  'temCnpj',
  'situacao',
  'desempenhoRuim',
];

/** Inteiro 0–100 a partir do texto do campo; `null` = vazio; `NaN` = inválido. */
function parseUiScore(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return Number.NaN;
  const n = Number(s);
  return n >= SCORE_MIN && n <= SCORE_MAX ? n : Number.NaN;
}

/**
 * Monta a query da Tela_Ranking. Faixa de score inválida (fora de 0–100, não inteira ou
 * mínimo > máximo) é omitida e sinalizada em `invalid`; os demais filtros e a busca seguem.
 */
export function buildRankingQuery(ui: RankingUiState): { query: URLSearchParams; invalid: 'score'[] } {
  const query = new URLSearchParams();
  for (const key of RANKING_KEYS) {
    const value = ui[key];
    if (value !== undefined && value.trim() !== '') query.set(key, value);
  }

  const invalid: 'score'[] = [];
  const min = parseUiScore(ui.scoreMin);
  const max = parseUiScore(ui.scoreMax);
  const bad = Number.isNaN(min) || Number.isNaN(max) || (min !== null && max !== null && min > max);
  if (bad) {
    invalid.push('score');
  } else {
    if (min !== null) query.set('scoreMin', String(min));
    if (max !== null) query.set('scoreMax', String(max));
  }
  return { query, invalid };
}
