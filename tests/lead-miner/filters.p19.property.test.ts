import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MSG, validateRunInput } from '@/lib/leads/filters';
import {
  PRESET_ID_LIST,
  arbInvalidNicheIds,
  arbInvalidText,
  arbInvalidUf,
  arbNicheIds,
  arbUf,
  arbValidText,
} from './support/arb-filters';

type Field<T> = { value: T; valid: boolean };
const ok = <T>(arb: fc.Arbitrary<T>) => arb.map((value): Field<T> => ({ value, valid: true }));
const bad = <T>(arb: fc.Arbitrary<T>) => arb.map((value): Field<T> => ({ value, valid: false }));
const ABSENT = Symbol('absent');

const arbTextField = fc.oneof(
  { weight: 3, arbitrary: ok(arbValidText()) },
  { weight: 1, arbitrary: bad(fc.oneof(arbInvalidText, fc.constant(ABSENT), fc.constant(123))) },
);

// Feature: lead-miner, Property 19: Validação dos parâmetros de mineração
// **Validates: Requirements 8.10, 10.3, 18.4, 18.5**
describe('Property 19: Validação dos parâmetros de mineração', () => {
  it('aceita sse todos os campos são válidos, aponta exatamente os inválidos e descarta ids de autor', () => {
    fc.assert(
      fc.property(
        arbTextField,
        arbTextField,
        fc.oneof(
          { weight: 3, arbitrary: ok(arbUf) },
          { weight: 1, arbitrary: bad(fc.oneof(arbInvalidUf, fc.constant(ABSENT))) },
        ),
        fc.oneof(
          { weight: 3, arbitrary: arbNicheIds.map((v) => ({ value: v as unknown, valid: true })) },
          { weight: 1, arbitrary: bad(arbInvalidNicheIds) },
          { weight: 1, arbitrary: fc.constant({ value: ABSENT as unknown, valid: false }) },
        ),
        fc.oneof(
          fc.constant<string | typeof ABSENT>(ABSENT),
          fc.constantFrom<string | typeof ABSENT>(...PRESET_ID_LIST),
          fc.constant<string | typeof ABSENT>('premium'),
        ),
        fc.oneof(fc.constant<unknown>(ABSENT), fc.boolean(), fc.constant<unknown>('true')),
        fc.oneof(fc.constant<unknown>(ABSENT), fc.boolean(), fc.constant<unknown>(1)),
        fc.record(
          { createdById: fc.uuid(), userId: fc.uuid(), authorId: fc.uuid(), id: fc.uuid() },
          { requiredKeys: [] },
        ),
        (bairro, cidade, uf, nichos, preset, excluirRedes, iaEnabled, extra) => {
          const raw: Record<string, unknown> = { ...extra };
          const put = (k: string, v: unknown) => {
            if (v !== ABSENT) raw[k] = v;
          };
          put('bairro', bairro.value);
          put('cidade', cidade.value);
          put('uf', uf.value);
          put('nichos', nichos.value);
          put('preset', preset);
          put('excluirRedes', excluirRedes);
          put('iaEnabled', iaEnabled);

          const presetValid = preset === ABSENT || (PRESET_ID_LIST as readonly unknown[]).includes(preset);
          // Sem `nichos`, um preset válido é expandido para a lista da configuração.
          const nichosValid =
            nichos.value === ABSENT ? preset !== ABSENT && presetValid : nichos.valid;

          const expectedInvalid = new Set<string>();
          if (!bairro.valid) expectedInvalid.add('bairro');
          if (!cidade.valid) expectedInvalid.add('cidade');
          if (!uf.valid) expectedInvalid.add('uf');
          if (!nichosValid) expectedInvalid.add('nichos');
          if (!presetValid) expectedInvalid.add('preset');
          if (excluirRedes !== ABSENT && typeof excluirRedes !== 'boolean') expectedInvalid.add('excluirRedes');
          if (iaEnabled !== ABSENT && typeof iaEnabled !== 'boolean') expectedInvalid.add('iaEnabled');

          const result = validateRunInput(raw);
          if (expectedInvalid.size === 0) {
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            const v = result.value;
            expect(Object.keys(v).sort()).toEqual(
              ['bairro', 'cidade', 'excluirRedes', 'iaEnabled', 'nichos', 'uf'],
            );
            expect(v.bairro).toBe((bairro.value as string).trim());
            expect(v.cidade).toBe((cidade.value as string).trim());
            expect(v.uf).toBe(uf.value);
            expect(v.nichos.length).toBeGreaterThanOrEqual(1);
            expect(v.nichos.length).toBeLessThanOrEqual(22);
            expect(new Set(v.nichos).size).toBe(v.nichos.length);
            if (nichos.value !== ABSENT) expect(v.nichos).toEqual(nichos.value);
            expect(v.excluirRedes).toBe(excluirRedes === ABSENT ? false : excluirRedes);
            expect(v.iaEnabled).toBe(iaEnabled === ABSENT ? false : iaEnabled);
          } else {
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(new Set(Object.keys(result.fields))).toEqual(expectedInvalid);
            if (expectedInvalid.has('bairro')) expect(result.fields.bairro).toBe(MSG.bairro);
            if (expectedInvalid.has('cidade')) expect(result.fields.cidade).toBe(MSG.cidade);
            if (expectedInvalid.has('uf')) expect(result.fields.uf).toBe(MSG.uf);
            if (expectedInvalid.has('nichos')) expect(result.fields.nichos).toBe(MSG.nichos);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
