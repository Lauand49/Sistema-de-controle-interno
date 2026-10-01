/**
 * Property 23: ordem das respostas de erro do serviço dos painéis, sem consultas de métrica.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { PERIODS } from '@/lib/dashboards/period';
import {
  FORBIDDEN_MESSAGE,
  INVALID_PERIOD_MESSAGE,
  NOT_FOUND_MESSAGE,
  getMemberDashboard,
  getUnitDashboard,
} from '@/lib/dashboards/service';
import { canViewMemberDashboard, canViewUnitDashboard, isUnitCode, type Person } from '@/lib/permissions';
import { arbActivePerson, arbPerson, arbUnitCodeish, PERSON_IDS } from './support/arb-person';
import { createFakeRepo, defaultUnits, makePerson } from './support/fake-repo';

const NOW = new Date('2026-10-05T15:00:00.000Z');

// Geradores locais ------------------------------------------------------------

/** Períodos válidos, vazios/nulos (padrão 30d) e inválidos. */
const arbRawPeriodo: fc.Arbitrary<string | null> = fc.oneof(
  fc.constantFrom<string | null>(null, '', ...PERIODS),
  fc.constantFrom('30D', '1y', 'semana', ' 7d', '7d ', 'TUDO', '0d'),
  fc.string()
);

/** Pessoas semeadas (qualquer status), ids únicos dentre PERSON_IDS. */
const arbPeople = fc
  .uniqueArray(arbPerson, { selector: (p) => p.id, maxLength: PERSON_IDS.length })
  .map((people) =>
    people.map((p) =>
      makePerson({ ...p, sectors: p.sectors.map((s) => ({ code: s.code, role: s.role })) })
    )
  );

/** Subconjunto das Unidades no banco (simula seed incompleto). */
const arbUnits = fc.subarray(defaultUnits(), { minLength: 0 });

const arbTargetId = fc.oneof(fc.constantFrom<string>(...PERSON_IDS), fc.constantFrom('nao-existe', ''), fc.string());

// Oráculo --------------------------------------------------------------------

type Expected = { status: 400 | 403 | 404; message: string } | null;

function isInvalidPeriodo(raw: string | null): boolean {
  return raw !== null && raw !== '' && !(PERIODS as readonly string[]).includes(raw);
}

async function outcome(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (e: unknown) => e
  );
}

function checkOutcome(err: unknown, expected: Expected) {
  if (expected === null) {
    expect(err).toBeNull();
    return;
  }
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(expected.status);
  expect((err as ApiError).message).toBe(expected.message);
}

// Propriedades ---------------------------------------------------------------

describe('Property 23: ordem das respostas de erro sem consultas', () => {
  // Feature: dashboards, Property 23: Ordem das respostas de erro sem consultas
  it('getUnitDashboard: 400 → 404 → 403, sem consultas de métrica', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbActivePerson,
        arbUnitCodeish,
        arbRawPeriodo,
        arbUnits,
        async (actor: Person, rawCode, rawPeriodo, units) => {
          const repo = createFakeRepo({ units });
          const code = rawCode.toUpperCase();

          let expected: Expected = null;
          if (isInvalidPeriodo(rawPeriodo)) {
            expected = { status: 400, message: INVALID_PERIOD_MESSAGE };
          } else if (!isUnitCode(code) || !units.some((u) => u.code === code)) {
            expected = { status: 404, message: NOT_FOUND_MESSAGE };
          } else if (!canViewUnitDashboard(actor, code)) {
            expected = { status: 403, message: FORBIDDEN_MESSAGE };
          }

          const err = await outcome(getUnitDashboard(repo, actor, rawCode, rawPeriodo, NOW));
          checkOutcome(err, expected);

          if (expected !== null) {
            expect(repo.metricCalls()).toEqual([]);
            if (expected.status === 400) expect(repo.calls).toEqual([]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: dashboards, Property 23: Ordem das respostas de erro sem consultas
  it('getMemberDashboard: 400 → 404 → 403, sem consultas de métrica', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbActivePerson,
        arbTargetId,
        arbRawPeriodo,
        arbPeople,
        async (actor: Person, targetId, rawPeriodo, people) => {
          const repo = createFakeRepo({ people });
          const target = people.find((p) => p.id === targetId) ?? null;

          let expected: Expected = null;
          if (isInvalidPeriodo(rawPeriodo)) {
            expected = { status: 400, message: INVALID_PERIOD_MESSAGE };
          } else if (target === null) {
            expected = { status: 404, message: NOT_FOUND_MESSAGE };
          } else if (!canViewMemberDashboard(actor, target)) {
            expected = { status: 403, message: FORBIDDEN_MESSAGE };
          }

          const err = await outcome(getMemberDashboard(repo, actor, targetId, rawPeriodo, NOW));
          checkOutcome(err, expected);

          if (expected !== null) {
            expect(repo.metricCalls()).toEqual([]);
            if (expected.status === 400) expect(repo.calls).toEqual([]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
