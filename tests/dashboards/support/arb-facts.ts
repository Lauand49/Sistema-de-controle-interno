/**
 * Geradores (fast-check) de instantes, Periodo e fatos de entrada da Calculadora_Metricas.
 *
 * As formas dos fatos seguem o design (`TaskFact`, `RequestFact`, `LeadFact`). Elas são
 * declaradas aqui de forma estrutural para não depender de `lib/dashboards/metrics.ts`;
 * como são idênticas, os valores gerados são aceitos pelas funções de lá.
 */
import fc from 'fast-check';
import {
  PERIODS,
  addDays,
  periodWindow,
  saoPauloDayKey,
  type Periodo,
} from '@/lib/dashboards/period';

export interface TaskFact {
  status: string;
  dueDate: Date | null;
  completedAt: Date | null;
  assigneeId: string | null;
  unitCode: string | null;
}

export interface RequestFact {
  status: string;
  fromDept: string;
  toDept: string;
  handlerId: string | null;
  dueDate: Date | null;
  updatedAt: Date;
}

export const LEAD_STATUS_VALUES = ['RAW', 'PENDING', 'IN_PROGRESS', 'CONVERTED_TO_PIPE', 'DISCARDED'] as const;
export type LeadStatusValue = (typeof LEAD_STATUS_VALUES)[number];

export interface LeadFact {
  status: LeadStatusValue;
  assignedTo: string | null;
  createdAt: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_MS = Date.UTC(2020, 0, 1);
const MAX_MS = Date.UTC(2035, 11, 31, 23, 59, 59, 999);

/** Ids e códigos de conjuntos pequenos, para gerar colisões. */
export const FACT_PERSON_IDS = ['u1', 'u2', 'u3', 'u4'] as const;
export const FACT_UNIT_CODES = [
  'NEGOCIOS',
  'TECNOLOGIA',
  'GESTAO',
  'PRESIDENCIA',
  'TEC_SOFTWARE',
  'TEC_HARDWARE',
] as const;
const DEPT_CODES = ['NEGOCIOS', 'TECNOLOGIA', 'GESTAO', 'PRESIDENCIA'] as const;

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED'] as const;

/**
 * Instantes entre 2020 e 2035, com viés para 00:00–03:00 UTC (faixa em que o dia UTC
 * e o de São Paulo divergem).
 */
export const arbNow: fc.Arbitrary<Date> = fc.oneof(
  { weight: 1, arbitrary: fc.integer({ min: MIN_MS, max: MAX_MS }) },
  {
    weight: 2,
    arbitrary: fc
      .tuple(
        fc.integer({ min: 0, max: Math.floor((MAX_MS - MIN_MS) / DAY_MS) }),
        fc.integer({ min: 0, max: 3 * HOUR_MS - 1 }),
      )
      .map(([day, offset]) => MIN_MS + day * DAY_MS + offset),
  },
).map((ms) => new Date(ms));

export const arbPeriodo: fc.Arbitrary<Periodo> = fc.constantFrom(...PERIODS);

const arbPersonIdOrNull = fc.constantFrom<string | null>(null, ...FACT_PERSON_IDS);
const arbUnitCodeOrNull = fc.constantFrom<string | null>(null, ...FACT_UNIT_CODES);

/** Status do enum mais strings arbitrárias (valores fora do enum não contam). */
function arbStatusWith(values: readonly string[]): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom(...values) },
    { weight: 1, arbitrary: fc.string({ maxLength: 12 }) },
  );
}

/** Meia-noite UTC de uma chave 'AAAA-MM-DD' somada a `hourMs`. */
function utcAt(dayKey: string, hourMs = 0): Date {
  return new Date(new Date(`${dayKey}T00:00:00.000Z`).getTime() + hourMs);
}

/**
 * `dueDate` nas bordas do Dia_Referencia: nulo, ontem, hoje (meia-noite UTC e outra
 * hora), amanhã, ou qualquer instante.
 */
export function arbDueDate(now: Date): fc.Arbitrary<Date | null> {
  const today = saoPauloDayKey(now);
  const arbHour = fc.integer({ min: 0, max: DAY_MS - 1 });
  return fc.oneof(
    fc.constant(null),
    arbHour.map((h) => utcAt(addDays(today, -1), h)),
    fc.constant(utcAt(today)),
    arbHour.map((h) => utcAt(today, h)),
    arbHour.map((h) => utcAt(addDays(today, 1), h)),
    fc.integer({ min: MIN_MS, max: MAX_MS }).map((ms) => new Date(ms)),
  );
}

/**
 * Instantes nas bordas da janela do Periodo (`from` e `to` ±1 ms) ou arbitrários
 * dentro de ±120 dias de `now`.
 */
export function arbWindowInstant(now: Date, periodo: Periodo): fc.Arbitrary<Date> {
  const { from, to } = periodWindow(periodo, now);
  const edges = [to.getTime() - 1, to.getTime(), to.getTime() + 1];
  if (from) edges.push(from.getTime() - 1, from.getTime(), from.getTime() + 1);
  return fc.oneof(
    fc.constantFrom(...edges),
    fc.integer({ min: now.getTime() - 120 * DAY_MS, max: now.getTime() + DAY_MS }),
  ).map((ms) => new Date(ms));
}

export function arbTaskFact(now: Date, periodo: Periodo): fc.Arbitrary<TaskFact> {
  return fc.record({
    status: arbStatusWith(TASK_STATUSES),
    dueDate: arbDueDate(now),
    completedAt: fc.option(arbWindowInstant(now, periodo), { nil: null }),
    assigneeId: arbPersonIdOrNull,
    unitCode: arbUnitCodeOrNull,
  });
}

export function arbRequestFact(now: Date, periodo: Periodo): fc.Arbitrary<RequestFact> {
  return fc.record({
    status: arbStatusWith(REQUEST_STATUSES),
    fromDept: fc.constantFrom(...DEPT_CODES),
    toDept: fc.constantFrom(...DEPT_CODES),
    handlerId: arbPersonIdOrNull,
    dueDate: arbDueDate(now),
    updatedAt: arbWindowInstant(now, periodo),
  });
}

export function arbLeadFact(now: Date, periodo: Periodo): fc.Arbitrary<LeadFact> {
  return fc.record({
    status: fc.constantFrom(...LEAD_STATUS_VALUES),
    assignedTo: arbPersonIdOrNull,
    createdAt: arbWindowInstant(now, periodo),
  });
}

/** `now` e Periodo junto com listas de fatos gerados em torno deles. */
export const arbScenario = fc
  .tuple(arbNow, arbPeriodo)
  .chain(([now, periodo]) =>
    fc.record({
      now: fc.constant(now),
      periodo: fc.constant(periodo),
      tasks: fc.array(arbTaskFact(now, periodo), { maxLength: 20 }),
      requests: fc.array(arbRequestFact(now, periodo), { maxLength: 20 }),
      leads: fc.array(arbLeadFact(now, periodo), { maxLength: 20 }),
    }),
  );
