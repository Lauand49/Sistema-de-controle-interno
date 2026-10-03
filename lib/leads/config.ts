/**
 * Configuração do Minerador de Leads (Req. 1).
 *
 * Arquivo isomórfico: sem imports de Node, Prisma ou `server-only`. Pode ser importado
 * tanto no servidor quanto na interface.
 *
 * `CategoryCode`, `PriorityCode` e `NicheTier` têm como fonte única `./types` e são apenas
 * reexportados aqui (ver comentário em `types.ts`).
 */

import type { CategoryCode, NicheTier, PriorityCode, TechGroup } from './types';

export type { CategoryCode, PriorityCode, NicheTier, TechGroup } from './types';

// ---------------------------------------------------------------------------
// Nichos e presets (Req. 1.1–1.3)
// ---------------------------------------------------------------------------

/** Natureza do negócio: prestação de serviço ou venda de produto. */
export type NicheKind = 'servico' | 'produto';

/** Par chave/valor de tag do OpenStreetMap. */
export interface OsmTag {
  key: string;
  value: string;
}

export interface Niche {
  id: string;
  label: string;
  tier: NicheTier;
  kind: NicheKind;
  /** Tags OSM equivalentes usadas na busca (mínimo 1). */
  tags: OsmTag[];
}

const tag = (key: string, value: string): OsmTag => ({ key, value });

/** Os 22 nichos pesquisáveis. */
export const NICHES: readonly Niche[] = [
  // Tier 1 (ICP)
  { id: 'clinica_odontologica', label: 'Clínica odontológica', tier: 1, kind: 'servico', tags: [tag('amenity', 'dentist')] },
  {
    id: 'clinica_medica',
    label: 'Clínica médica',
    tier: 1,
    kind: 'servico',
    tags: [tag('amenity', 'clinic'), tag('healthcare', 'clinic')],
  },
  { id: 'advocacia', label: 'Escritório de advocacia', tier: 1, kind: 'servico', tags: [tag('office', 'lawyer')] },
  { id: 'contabilidade', label: 'Escritório de contabilidade', tier: 1, kind: 'servico', tags: [tag('office', 'accountant')] },
  { id: 'imobiliaria', label: 'Imobiliária', tier: 1, kind: 'servico', tags: [tag('office', 'estate_agent')] },
  { id: 'veterinaria', label: 'Clínica veterinária', tier: 1, kind: 'servico', tags: [tag('amenity', 'veterinary')] },
  { id: 'academia', label: 'Academia', tier: 1, kind: 'servico', tags: [tag('leisure', 'fitness_centre')] },
  { id: 'escola_idiomas', label: 'Escola de idiomas', tier: 1, kind: 'servico', tags: [tag('amenity', 'language_school')] },

  // Tier 2
  { id: 'restaurante', label: 'Restaurante', tier: 2, kind: 'servico', tags: [tag('amenity', 'restaurant')] },
  { id: 'cafeteria', label: 'Cafeteria', tier: 2, kind: 'servico', tags: [tag('amenity', 'cafe')] },
  { id: 'padaria', label: 'Padaria', tier: 2, kind: 'produto', tags: [tag('shop', 'bakery')] },
  { id: 'salao_beleza', label: 'Salão de beleza', tier: 2, kind: 'servico', tags: [tag('shop', 'hairdresser')] },
  { id: 'estetica', label: 'Clínica de estética', tier: 2, kind: 'servico', tags: [tag('shop', 'beauty')] },
  { id: 'otica', label: 'Ótica', tier: 2, kind: 'produto', tags: [tag('shop', 'optician')] },
  { id: 'farmacia', label: 'Farmácia', tier: 2, kind: 'produto', tags: [tag('amenity', 'pharmacy')] },
  { id: 'pet_shop', label: 'Pet shop', tier: 2, kind: 'produto', tags: [tag('shop', 'pet')] },
  { id: 'hotel', label: 'Hotel', tier: 2, kind: 'servico', tags: [tag('tourism', 'hotel')] },

  // Tier 3
  { id: 'oficina_mecanica', label: 'Oficina mecânica', tier: 3, kind: 'servico', tags: [tag('shop', 'car_repair')] },
  { id: 'loja_roupas', label: 'Loja de roupas', tier: 3, kind: 'produto', tags: [tag('shop', 'clothes')] },
  {
    id: 'materiais_construcao',
    label: 'Materiais de construção',
    tier: 3,
    kind: 'produto',
    tags: [tag('shop', 'hardware'), tag('shop', 'doityourself')],
  },
  { id: 'floricultura', label: 'Floricultura', tier: 3, kind: 'produto', tags: [tag('shop', 'florist')] },
  { id: 'mercearia', label: 'Mercearia', tier: 3, kind: 'produto', tags: [tag('shop', 'convenience')] },
];

export type PresetId = 'icp' | 'produto' | 'servico' | 'todos';

const nicheIds = (pred: (n: Niche) => boolean): readonly string[] => NICHES.filter(pred).map((n) => n.id);

/** icp = tier 1; produto = kind 'produto'; servico = kind 'servico'; todos = os 22. */
export const PRESETS: Record<PresetId, readonly string[]> = {
  icp: nicheIds((n) => n.tier === 1),
  produto: nicheIds((n) => n.kind === 'produto'),
  servico: nicheIds((n) => n.kind === 'servico'),
  todos: nicheIds(() => true),
};

/** 27 unidades federativas. */
export const UFS: readonly string[] = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

// ---------------------------------------------------------------------------
// Timeouts e limites (Req. 1.4–1.6, 2, 3, 4, 7)
// ---------------------------------------------------------------------------

/** Orçamento total da análise de um site. */
export const SITE_TIMEOUT_MS = 10_000;
/** Sub-limite da tentativa https:// de um website sem esquema (Req. 3.2, 3.9). */
export const HTTPS_ATTEMPT_TIMEOUT_MS = 6_000;
/** Site é lento se a latência for estritamente maior que este valor. */
export const SLOW_THRESHOLD_MS = 2_500;
/** Status HTTP maior ou igual a este valor é erro. */
export const HTTP_ERROR_MIN_STATUS = 400;
export const MAX_REDIRECTS = 3;
export const MAX_BODY_BYTES = 1_048_576;
export const OVERPASS_TIMEOUT_MS = 60_000;
export const NOMINATIM_TIMEOUT_MS = 15_000;
/** Esperas antes da 1ª e da 2ª retentativa. */
export const RETRY_DELAYS_MS = [2_000, 4_000] as const;
export const GEMINI_TIMEOUT_MS = 20_000;
export const GEMINI_MONTHLY_LIMIT_DEFAULT = 1_000;

/**
 * Limite mensal de chamadas ao Gemini (Req. 1.9): o valor de `GEMINI_MONTHLY_LIMIT`
 * quando é um inteiro positivo; caso contrário, `GEMINI_MONTHLY_LIMIT_DEFAULT`.
 */
export function geminiMonthlyLimit(env?: string): number {
  return monthlyLimit(env, GEMINI_MONTHLY_LIMIT_DEFAULT);
}

/**
 * Regra comum dos limites mensais (Req. 1.2, Etapa 1 Req. 1.9): o valor de `env` quando é
 * um inteiro positivo (apenas dígitos, após `trim`, e seguro em ponto flutuante); caso
 * contrário, `fallback`.
 */
export function monthlyLimit(env: string | undefined, fallback: number): number {
  if (typeof env !== 'string') return fallback;
  const trimmed = env.trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export const PLACES_MONTHLY_LIMIT_DEFAULT = 1_000;
export const PAGESPEED_MONTHLY_LIMIT_DEFAULT = 5_000;

/** Limite mensal de chamadas à Places API (`PLACES_MONTHLY_LIMIT`, Req. 1.2). */
export const placesMonthlyLimit = (env?: string): number => monthlyLimit(env, PLACES_MONTHLY_LIMIT_DEFAULT);
/** Limite mensal de chamadas à PageSpeed Insights API (`PAGESPEED_MONTHLY_LIMIT`, Req. 1.2). */
export const pagespeedMonthlyLimit = (env?: string): number => monthlyLimit(env, PAGESPEED_MONTHLY_LIMIT_DEFAULT);

/** Timeouts por requisição dos serviços externos (Req. 1.3). */
export const PLACES_TIMEOUT_MS = 15_000;
export const PAGESPEED_TIMEOUT_MS = 30_000;
export const BRASILAPI_TIMEOUT_MS = 8_000;
export const BRASILAPI_RETRY_DELAY_MS = 2_000;
/** Intervalo mínimo entre requisições à BrasilAPI (1 req/s). */
export const BRASILAPI_MIN_INTERVAL_MS = 1_000;
/** Timeout do Gemini na geração da Mensagem_Abordagem. */
export const APPROACH_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Fonte_Google (Req. 1.1, 1.4, 1.5)
// ---------------------------------------------------------------------------

export interface GoogleQuery {
  /** Texto de busca em português (não vazio). */
  text: string;
  /** Tipo de lugar da Places API, quando há equivalente. */
  includedType?: string;
}

/** Um texto em português por Nicho (22 entradas), com o tipo da Places API quando há equivalente. */
export const GOOGLE_QUERIES: Readonly<Record<string, GoogleQuery>> = {
  // Tier 1 (ICP)
  clinica_odontologica: { text: 'clínica odontológica', includedType: 'dentist' },
  clinica_medica: { text: 'clínica médica', includedType: 'doctor' },
  advocacia: { text: 'escritório de advocacia', includedType: 'lawyer' },
  contabilidade: { text: 'escritório de contabilidade', includedType: 'accounting' },
  imobiliaria: { text: 'imobiliária', includedType: 'real_estate_agency' },
  veterinaria: { text: 'clínica veterinária', includedType: 'veterinary_care' },
  academia: { text: 'academia', includedType: 'gym' },
  escola_idiomas: { text: 'escola de idiomas' },

  // Tier 2
  restaurante: { text: 'restaurante', includedType: 'restaurant' },
  cafeteria: { text: 'cafeteria', includedType: 'cafe' },
  padaria: { text: 'padaria', includedType: 'bakery' },
  salao_beleza: { text: 'salão de beleza', includedType: 'hair_salon' },
  estetica: { text: 'clínica de estética', includedType: 'beauty_salon' },
  otica: { text: 'ótica' },
  farmacia: { text: 'farmácia', includedType: 'pharmacy' },
  pet_shop: { text: 'pet shop', includedType: 'pet_store' },
  hotel: { text: 'hotel', includedType: 'hotel' },

  // Tier 3
  oficina_mecanica: { text: 'oficina mecânica', includedType: 'car_repair' },
  loja_roupas: { text: 'loja de roupas', includedType: 'clothing_store' },
  materiais_construcao: { text: 'loja de materiais de construção', includedType: 'hardware_store' },
  floricultura: { text: 'floricultura', includedType: 'florist' },
  mercearia: { text: 'mercearia', includedType: 'convenience_store' },
};

/** Máximo de páginas por Nicho (até GOOGLE_MAX_PAGES × GOOGLE_PAGE_SIZE = 60 lugares). */
export const GOOGLE_MAX_PAGES = 3;
export const GOOGLE_PAGE_SIZE = 20;
/** Validade_Cache_Google, em dias. */
export const GOOGLE_CACHE_DAYS = 30;
/** Validade dos Dados_CNPJ, em dias. */
export const CNPJ_DATA_DAYS = 90;
export const GOOGLE_ATTRIBUTION_TEXT = 'Google Maps';
/** Nome exibido quando o Conteudo_Google expirou e foi apagado. */
export const GOOGLE_EXPIRED_NAME = 'Empresa do Google (dados expirados)';

// ---------------------------------------------------------------------------
// Reanálise e Mensagem_Abordagem (Req. 1.8)
// ---------------------------------------------------------------------------

/** Intervalo mínimo entre duas reanálises da mesma Empresa. */
export const REANALYSIS_MIN_GAP_MS = 10 * 60_000;
export const REANALYSIS_LEASE_SECONDS = 90;

/** Limites de caracteres da Mensagem_Abordagem. */
export const APPROACH_LIMITS = { whatsapp: 700, emailSubject: 120, emailBody: 2_000 } as const;

// ---------------------------------------------------------------------------
// Categorias (Req. 1.7, 5)
// ---------------------------------------------------------------------------

export const CATEGORY_LABEL: Record<CategoryCode, string> = {
  CRIAR_SITE: 'Criar Site do Zero',
  OTIMIZACAO_SEGURANCA: 'Otimização / Segurança',
  ANALISE_DADOS_BI: 'Análise de Dados / BI',
};

/** Plano de ação sugerido ao converter uma empresa em lead, por categoria. */
export const ACTION_PLAN_BY_CATEGORY: Record<CategoryCode, string> = {
  CRIAR_SITE: 'Apresentar proposta de criação de site institucional com presença digital básica',
  OTIMIZACAO_SEGURANCA: 'Apresentar diagnóstico do site atual e proposta de otimização, HTTPS e segurança',
  ANALISE_DADOS_BI: 'Apresentar proposta de análise de dados e dashboards de BI para o negócio',
};

export const ACTION_PLAN_DEFAULT = 'Aguardando definição de abordagem comercial';

// ---------------------------------------------------------------------------
// Pontuação (Req. 1.8, 6)
// ---------------------------------------------------------------------------

/** Pontos de cada critério do componente de presença digital (soma limitada a DIGITAL_MAX). */
export const DIGITAL_POINTS: {
  semSite: number;
  offline: number;
  httpErro: number;
  semHttps: number;
  sslInvalido: number;
  lento: number;
} = {
  semSite: 40,
  offline: 20,
  httpErro: 10,
  semHttps: 10,
  sslInvalido: 8,
  lento: 7,
};

/** Desempenho_Ruim: nota de desempenho do PageSpeed estritamente menor que este valor (Req. 1.6). */
export const PAGESPEED_POOR_THRESHOLD = 50;

/** Pontos da presença digital na versão 2 da pontuação: inclui o critério de Desempenho_Ruim. */
export const DIGITAL_POINTS_V2 = { ...DIGITAL_POINTS, desempenhoRuim: 7 } as const;

export const DIGITAL_MAX = 40;
/** Pontos ICP por tier (tier 1 = 25; não crescente). */
export const ICP_POINTS: Record<NicheTier, number> = { 1: 25, 2: 15, 3: 8 };
export const ICP_MAX = 25;
export const AI_MAX = 35;
export const OBJECTIVE_MAX = 65;

export const PRIORITY_LABEL: Record<PriorityCode, string> = {
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

// ---------------------------------------------------------------------------
// Lotes, paginação e limites de listas
// ---------------------------------------------------------------------------

export const BATCH_SIZE = 10;
/** Margem sob os 60 s do Req. 8.4. */
export const BATCH_BUDGET_MS = 55_000;
export const DISCOVERY_BUDGET_MS = 50_000;
export const BULK_MAX = 200;
export const EXPORT_MAX = 5_000;
export const MAP_MAX = 2_000;
export const RUNS_PAGE_SIZE = 20;
export const RANKING_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// OpenStreetMap
// ---------------------------------------------------------------------------

export const OSM_USER_AGENT = 'SciTecJr-SistemaInterno/1.0 (contato@scitecjr.com)';
export const ODBL_TEXT = '© Colaboradores do OpenStreetMap';
export const ODBL_URL = 'https://www.openstreetmap.org/copyright';

// ---------------------------------------------------------------------------
// Catalogo_Tecnologias (Req. 1.7)
// ---------------------------------------------------------------------------

/** Ordem de exibição dos grupos de tecnologia. */
export const TECH_GROUP_ORDER: readonly TechGroup[] = ['CMS', 'LOJA_VIRTUAL', 'ANALYTICS', 'MARKETING', 'FRAMEWORK'];

export const TECH_GROUP_LABEL: Record<TechGroup, string> = {
  CMS: 'CMS',
  LOJA_VIRTUAL: 'Loja virtual',
  ANALYTICS: 'Analytics',
  MARKETING: 'Marketing',
  FRAMEWORK: 'Framework',
};

export interface TechPattern {
  /** Onde procurar: meta generator, src/href de script/link, script inline, atributo/HTML bruto. */
  where: 'generator' | 'asset' | 'inline' | 'html';
  /** Fonte da RegExp (string, para manter o config serializável e isomórfico); usar sempre com flag i. */
  regex: string;
}

export interface TechEntry {
  id: string;
  label: string;
  group: TechGroup;
  patterns: TechPattern[];
}

const p = (where: TechPattern['where'], regex: string): TechPattern => ({ where, regex });

/** Tecnologias detectáveis no Corpo_HTML (mínimo as 15 do Req. 1.7). */
export const TECH_CATALOG: readonly TechEntry[] = [
  // CMS / construtores de site
  {
    id: 'wordpress',
    label: 'WordPress',
    group: 'CMS',
    patterns: [p('generator', '^WordPress'), p('asset', '/wp-content/|/wp-includes/')],
  },
  {
    id: 'wix',
    label: 'Wix',
    group: 'CMS',
    patterns: [p('generator', 'Wix\\.com'), p('asset', 'static\\.wixstatic\\.com|parastorage\\.com')],
  },
  {
    id: 'squarespace',
    label: 'Squarespace',
    group: 'CMS',
    patterns: [p('asset', 'squarespace(-cdn)?\\.com'), p('generator', 'Squarespace')],
  },
  {
    id: 'webflow',
    label: 'Webflow',
    group: 'CMS',
    patterns: [p('html', 'data-wf-page|data-wf-site'), p('generator', 'Webflow')],
  },

  // Lojas virtuais
  {
    id: 'shopify',
    label: 'Shopify',
    group: 'LOJA_VIRTUAL',
    patterns: [p('asset', 'cdn\\.shopify\\.com'), p('inline', 'Shopify\\.shop')],
  },
  {
    id: 'nuvemshop',
    label: 'Nuvemshop',
    group: 'LOJA_VIRTUAL',
    patterns: [p('asset', '(nuvemshop|tiendanube)\\.com|d26lpennugtm8s\\.cloudfront\\.net')],
  },
  {
    id: 'loja_integrada',
    label: 'Loja Integrada',
    group: 'LOJA_VIRTUAL',
    patterns: [p('asset', 'lojaintegrada\\.com\\.br')],
  },
  {
    id: 'tray',
    label: 'Tray',
    group: 'LOJA_VIRTUAL',
    patterns: [p('asset', 'tray\\.com\\.br|traycdn')],
  },

  // Analytics
  {
    id: 'google_analytics',
    label: 'Google Analytics',
    group: 'ANALYTICS',
    patterns: [p('asset', 'google-analytics\\.com/(analytics|ga)\\.js|googletagmanager\\.com/gtag/js')],
  },
  {
    id: 'google_tag_manager',
    label: 'Google Tag Manager',
    group: 'ANALYTICS',
    patterns: [p('asset', 'googletagmanager\\.com/gtm\\.js'), p('inline', 'GTM-[A-Z0-9]+')],
  },

  // Marketing
  {
    id: 'meta_pixel',
    label: 'Meta Pixel',
    group: 'MARKETING',
    patterns: [p('asset', 'connect\\.facebook\\.net/[^"\']*/fbevents\\.js'), p('inline', 'fbq\\([\'"]init')],
  },

  // Frameworks e bibliotecas
  {
    id: 'jquery',
    label: 'jQuery',
    group: 'FRAMEWORK',
    patterns: [p('asset', 'jquery(\\.min)?\\.js|code\\.jquery\\.com')],
  },
  {
    id: 'react',
    label: 'React',
    group: 'FRAMEWORK',
    patterns: [p('html', 'data-reactroot|__REACT_DEVTOOLS'), p('asset', 'react(-dom)?(\\.production)?(\\.min)?\\.js')],
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    group: 'FRAMEWORK',
    patterns: [p('html', '__NEXT_DATA__|/_next/static/')],
  },
  {
    id: 'bootstrap',
    label: 'Bootstrap',
    group: 'FRAMEWORK',
    patterns: [p('asset', 'bootstrap(\\.bundle)?(\\.min)?\\.(css|js)')],
  },
];
