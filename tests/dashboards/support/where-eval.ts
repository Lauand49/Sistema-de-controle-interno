/**
 * Avaliador em memória dos `where` de Prisma gerados por `lib/dashboards/filters.ts`.
 *
 * Cobre só os operadores usados lá: `AND`, `OR`, `in`, `not`, `lt`, `gte`, `lte`,
 * igualdade (escalar, `Date` ou `null`) e filtro de relação 1:1 (`unit: { code: ... }`).
 * Qualquer outro operador ou campo desconhecido lança erro, para que um filtro novo
 * não passe despercebido nas Properties 7 e 8.
 *
 * Semântica de nulos segue o SQL gerado pelo Prisma: `in`, `lt`, `gte`, `lte` e `not: valor`
 * nunca aceitam `null`; `campo: null` é `IS NULL`; relação nula não satisfaz filtro de relação.
 */
import type { LeadFact, RequestFact, TaskFact } from '@/lib/dashboards/metrics';

type Scalar = string | number | boolean | Date | null;
type Rec = Record<string, unknown>;

const SCALAR_OPERATORS = new Set(['in', 'not', 'lt', 'gte', 'lte', 'equals']);

function isPlainObject(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v);
}

function isScalar(v: unknown): v is Scalar {
  return v === null || v instanceof Date || ['string', 'number', 'boolean'].includes(typeof v);
}

function toComparable(v: Scalar): string | number | boolean | null {
  return v instanceof Date ? v.getTime() : v;
}

function scalarEquals(a: Scalar, b: Scalar): boolean {
  return toComparable(a) === toComparable(b);
}

function compare(value: Scalar, op: 'lt' | 'gte' | 'lte', bound: unknown): boolean {
  if (value === null) return false;
  if (!isScalar(bound) || bound === null) throw new Error(`where-eval: limite inválido para '${op}'`);
  const a = toComparable(value) as string | number;
  const b = toComparable(bound) as string | number;
  if (op === 'lt') return a < b;
  if (op === 'gte') return a >= b;
  return a <= b;
}

/** Filtro de campo escalar: valor direto (igualdade) ou objeto de operadores. */
function evalScalarFilter(value: Scalar, filter: unknown): boolean {
  if (isScalar(filter)) return scalarEquals(value, filter);
  if (!isPlainObject(filter)) throw new Error('where-eval: filtro escalar inválido');
  for (const [op, arg] of Object.entries(filter)) {
    if (arg === undefined) continue;
    switch (op) {
      case 'equals':
        if (!isScalar(arg)) throw new Error("where-eval: argumento inválido para 'equals'");
        if (!scalarEquals(value, arg)) return false;
        break;
      case 'in':
        if (!Array.isArray(arg)) throw new Error("where-eval: 'in' espera uma lista");
        if (value === null || !arg.some((x) => scalarEquals(value, x as Scalar))) return false;
        break;
      case 'not':
        if (isPlainObject(arg)) {
          if (evalScalarFilter(value, arg)) return false;
        } else if (isScalar(arg)) {
          // `not: null` → IS NOT NULL; `not: v` → `<> v` (NULL não passa).
          if (arg === null ? value === null : value === null || scalarEquals(value, arg)) return false;
        } else {
          throw new Error("where-eval: argumento inválido para 'not'");
        }
        break;
      case 'lt':
      case 'gte':
      case 'lte':
        if (!compare(value, op, arg)) return false;
        break;
      default:
        throw new Error(`where-eval: operador desconhecido '${op}'`);
    }
  }
  return true;
}

function evalList(list: unknown, record: Rec, op: 'AND' | 'OR'): boolean {
  const items = Array.isArray(list) ? list : [list];
  return op === 'AND' ? items.every((w) => evalWhere(w, record)) : items.some((w) => evalWhere(w, record));
}

/** Avalia um `where` (formato Prisma) sobre um registro em memória. */
export function evalWhere(where: unknown, record: Rec): boolean {
  if (where === undefined) return true;
  if (!isPlainObject(where)) throw new Error('where-eval: where deve ser um objeto');
  for (const [key, filter] of Object.entries(where)) {
    if (filter === undefined) continue;
    if (key === 'AND' || key === 'OR') {
      if (!evalList(filter, record, key)) return false;
      continue;
    }
    if (key === 'NOT' || key.startsWith('_')) throw new Error(`where-eval: operador desconhecido '${key}'`);
    if (!(key in record)) throw new Error(`where-eval: campo desconhecido '${key}'`);
    const value = record[key];
    if (value === null || isPlainObject(value)) {
      // Relação 1:1 (ex.: `unit`) ou escalar nulo. Filtro com chaves que não são operadores = relação.
      const isRelationFilter =
        isPlainObject(filter) && Object.keys(filter).some((k) => !SCALAR_OPERATORS.has(k));
      if (isRelationFilter) {
        if (value === null || !evalWhere(filter, value as Rec)) return false;
        continue;
      }
      if (isPlainObject(value)) throw new Error(`where-eval: filtro escalar sobre a relação '${key}'`);
    }
    if (!isScalar(value)) throw new Error(`where-eval: valor não suportado no campo '${key}'`);
    if (!evalScalarFilter(value, filter)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Fatos da Calculadora → registros com a forma das tabelas
// ---------------------------------------------------------------------------

/** `TaskFact.unitCode` vira a relação `unit: { code }` (null quando a tarefa não tem unidade). */
export function taskRecord(t: TaskFact): Rec {
  return {
    status: t.status,
    dueDate: t.dueDate,
    completedAt: t.completedAt,
    assigneeId: t.assigneeId,
    unit: t.unitCode === null ? null : { code: t.unitCode },
  };
}

export function requestRecord(r: RequestFact): Rec {
  return {
    status: r.status,
    fromDept: r.fromDept,
    toDept: r.toDept,
    handlerId: r.handlerId,
    dueDate: r.dueDate,
    updatedAt: r.updatedAt,
  };
}

export function leadRecord(l: LeadFact): Rec {
  return { status: l.status, assignedTo: l.assignedTo, createdAt: l.createdAt };
}

export const matchesTask = (where: unknown, t: TaskFact): boolean => evalWhere(where, taskRecord(t));
export const matchesRequest = (where: unknown, r: RequestFact): boolean => evalWhere(where, requestRecord(r));
export const matchesLead = (where: unknown, l: LeadFact): boolean => evalWhere(where, leadRecord(l));
