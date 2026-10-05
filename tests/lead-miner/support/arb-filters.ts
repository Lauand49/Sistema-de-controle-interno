/**
 * Geradores fast-check para as propriedades de `lib/leads/filters.ts`.
 */
import fc from 'fast-check';
import { NICHES, UFS } from '@/lib/leads/config';

export const NICHE_ID_LIST: string[] = NICHES.map((n) => n.id);
export const PRESET_ID_LIST = ['icp', 'produto', 'servico', 'todos'] as const;
export const RUN_STATUS_LIST = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'ERRO'] as const;
export const CATEGORY_LIST = ['CRIAR_SITE', 'OTIMIZACAO_SEGURANCA', 'ANALISE_DADOS_BI'] as const;
export const PRIORITY_LIST = ['ALTA', 'MEDIA', 'BAIXA', 'SEM'] as const;
export const SOURCE_LIST = ['OSM', 'GOOGLE', 'MISTA'] as const;
export const LEAD_STATUS_LIST = ['RAW', 'PENDING', 'IN_PROGRESS', 'CONVERTED_TO_PIPE', 'DISCARDED', 'NONE'] as const;

/** Espaços nas extremidades (ASCII e Unicode que `String.prototype.trim` remove). */
const arbPad = fc.constantFrom('', ' ', '  ', '\t', '\u00a0');

/** Texto com 1–`max` caracteres após `trim`, possivelmente com espaços nas extremidades. */
export const arbValidText = (max = 100) =>
  fc
    .tuple(arbPad, fc.string({ minLength: 1, maxLength: max }), arbPad)
    .map(([a, s, b]) => a + s + b)
    .filter((s) => s.trim().length >= 1 && s.trim().length <= max);

/** Texto inválido: vazio, só espaços ou com mais de 100 caracteres após `trim`. */
export const arbInvalidText = fc.oneof(
  fc.constantFrom('', ' ', '   ', '\t\n'),
  fc.string({ minLength: 101, maxLength: 140 }).filter((s) => s.trim().length > 100),
);

export const arbUf = fc.constantFrom(...UFS);
export const arbInvalidUf = fc.constantFrom('sp', 'XX', '', 'S P', 'BR', 'São Paulo');

/** Lista válida de nichos: 1–22 ids existentes, sem repetição, em ordem aleatória. */
export const arbNicheIds = fc
  .shuffledSubarray(NICHE_ID_LIST, { minLength: 1, maxLength: NICHE_ID_LIST.length });

/** Lista inválida de nichos: vazia, com repetição, com id inexistente ou com tipo errado. */
export const arbInvalidNicheIds: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant([]),
  arbNicheIds.map((ids) => [...ids, ids[0]]),
  arbNicheIds.map((ids) => [...ids, 'nicho_inexistente']),
  arbNicheIds.map((ids) => [...ids, 42]),
  fc.constant('restaurante'),
);

/** `AAAA-MM-DD` válido (2000–2099). */
export const arbDateString = fc
  .date({ min: new Date(Date.UTC(2000, 0, 1)), max: new Date(Date.UTC(2099, 11, 31)) })
  .map((d) => d.toISOString().slice(0, 10));

export const arbInvalidDateString = fc.constantFrom(
  '2024-02-30',
  '2023-02-29',
  '2024-13-01',
  '2024-00-10',
  '2024/01/01',
  '01-01-2024',
  '2024-1-1',
  'ontem',
);

/** Par de datas válidas ordenadas (inicial ≤ final). */
export const arbOrderedDates = fc
  .tuple(arbDateString, arbDateString)
  .map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [string, string]);

/** Valor de score como chega na query/corpo: número, string, vazio ou ausente. */
export const arbScoreParam: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.integer({ min: -10, max: 110 }),
  fc.integer({ min: -10, max: 110 }).map(String),
  fc.integer({ min: 0, max: 100 }).map((n) => ` ${n} `),
  fc.constantFrom(1.5, 99.9, '1.5', 'abc', '10a', Number.NaN),
);

/** Item de ranking com colisões frequentes de nome e score. */
export const arbRankKey = fc.record({
  id: fc.uuid(),
  nomeExibicao: fc.stringOf(fc.constantFrom('a', 'B', 'c', 'á', ' '), { minLength: 0, maxLength: 3 }),
  scoreFinal: fc.option(fc.constantFrom(0, 10, 39, 40, 70, 100), { nil: null }),
});

/** Coordenada válida, nula, não finita ou fora da faixa. */
export const arbCoord = fc.oneof(
  { weight: 3, arbitrary: fc.tuple(fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true })) },
  { weight: 1, arbitrary: fc.constantFrom<[number | null, number | null]>([null, null], [null, -46.6], [-23.5, null], [Number.NaN, 10], [10, Number.POSITIVE_INFINITY], [91, 0], [0, -180.5], [-90.0001, 0]) },
);

/** Filtros válidos já parseados (`CompanyFilters`), campos presentes aleatoriamente. */
export const arbCompanyFilters = fc.record(
  {
    q: arbValidText().map((s) => s.trim()),
    cidade: arbValidText().map((s) => s.trim()),
    bairro: arbValidText().map((s) => s.trim()),
    uf: arbUf,
    nicho: fc.constantFrom(...NICHE_ID_LIST),
    categoria: fc.constantFrom(...CATEGORY_LIST),
    prioridade: fc.constantFrom(...PRIORITY_LIST),
    scoreMin: fc.integer({ min: 0, max: 50 }),
    scoreMax: fc.integer({ min: 50, max: 100 }),
    hasSite: fc.boolean(),
    isHttps: fc.boolean(),
    fonte: fc.constantFrom(...SOURCE_LIST),
    assignedTo: fc.oneof(fc.uuid(), fc.constant('NONE')),
    leadStatus: fc.constantFrom(...LEAD_STATUS_LIST),
    analyzedFrom: arbDateString,
    analyzedTo: arbDateString,
    runId: fc.uuid(),
  },
  { requiredKeys: [] },
);

/** Valor cru (não vazio) de um controle da Tela_Ranking, válido para `companyFiltersSchema`. */
const optionalUi = <T extends string>(arb: fc.Arbitrary<T>) =>
  fc.oneof(fc.constant(undefined), fc.constantFrom('', '  '), arb);

/** Estado da Tela_Ranking: demais filtros válidos (ou vazios) e faixa de score arbitrária. */
export const arbRankingUiState = fc
  .record({
    q: optionalUi(arbValidText(90)),
    cidade: optionalUi(arbValidText(90)),
    bairro: optionalUi(arbValidText(90)),
    uf: optionalUi(arbUf),
    nicho: optionalUi(fc.constantFrom(...NICHE_ID_LIST)),
    categoria: optionalUi(fc.constantFrom(...CATEGORY_LIST)),
    prioridade: optionalUi(fc.constantFrom(...PRIORITY_LIST)),
    hasSite: optionalUi(fc.constantFrom('true', 'false')),
    isHttps: optionalUi(fc.constantFrom('true', 'false')),
    fonte: optionalUi(fc.constantFrom(...SOURCE_LIST)),
    assignedTo: optionalUi(fc.oneof(fc.uuid(), fc.constant('NONE'))),
    leadStatus: optionalUi(fc.constantFrom(...LEAD_STATUS_LIST)),
    dates: fc.tuple(fc.boolean(), fc.boolean(), arbOrderedDates),
    runId: optionalUi(fc.uuid()),
    scoreMin: fc.oneof(
      fc.constant(undefined),
      fc.constantFrom('', ' '),
      fc.integer({ min: -5, max: 105 }).map(String),
      fc.integer({ min: 0, max: 100 }).map((n) => ` ${n} `),
      fc.constantFrom('1.5', 'abc', '-0', '+5', '007'),
    ),
    scoreMax: fc.oneof(
      fc.constant(undefined),
      fc.constantFrom('', ' '),
      fc.integer({ min: -5, max: 105 }).map(String),
      fc.integer({ min: 0, max: 100 }).map((n) => ` ${n} `),
      fc.constantFrom('1.5', 'abc', '-0', '+5', '100'),
    ),
  })
  .map(({ dates: [useFrom, useTo, [from, to]], ...rest }) => {
    const ui: Record<string, string | undefined> = { ...rest };
    if (useFrom) ui.analyzedFrom = from;
    if (useTo) ui.analyzedTo = to;
    return ui;
  });
