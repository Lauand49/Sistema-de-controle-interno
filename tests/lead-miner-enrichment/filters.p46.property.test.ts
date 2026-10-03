/**
 * **Validates: Requirements 11.7, 20.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NICHES, UFS } from '@/lib/leads/config';
import { cnpjCheckDigits, formatCnpj, isValidCnpj } from '@/lib/leads/cnpj';
import {
  MSG,
  approachBodySchema,
  cnpjBodySchema,
  validateRunInput,
  zodFieldErrors,
} from '@/lib/leads/filters';

// Feature: lead-miner-enrichment, Property 46: For any corpo com `fonte` fora de OSM/GOOGLE/MISTA, `pagespeedEnabled`/`cnpjEnabled` não booleanos, `canal` fora de WHATSAPP/EMAIL ou `cnpj` que não passa no Validador_CNPJ, a validação correspondente rejeita com o campo inválido em `fields` (e "CNPJ inválido" para o CNPJ); e for any corpo válido, a validação aceita e preserva os valores.

const SOURCES = ['OSM', 'GOOGLE', 'MISTA'] as const;
const CHANNELS = ['WHATSAPP', 'EMAIL'] as const;
const AUTHOR_KEYS = ['createdById', 'authorId', 'userId', 'actorId'] as const;
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

/** Corpo base válido da mineração (bairro, cidade, UF e nichos válidos). */
const baseRunArb = fc.record({
  bairro: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  cidade: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  uf: fc.constantFrom(...UFS),
  nichos: fc.uniqueArray(fc.constantFrom(...NICHES.map((n) => n.id)), {
    minLength: 1,
    maxLength: NICHES.length,
  }),
});

/** Qualquer valor JSON que não seja booleano (e não `undefined`, que aplica o padrão). */
const nonBooleanArb = fc.oneof(
  fc.string(),
  fc.constantFrom('true', 'false', '1', '0', ''),
  fc.integer(),
  fc.double(),
  fc.constant(null),
  fc.array(fc.boolean(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 5 }), fc.boolean(), { maxKeys: 2 }),
);

/** Valor que não é um dos enums permitidos (inclui variações de caixa e espaços). */
const notInEnum = (values: readonly string[]) =>
  fc
    .oneof(
      fc.string({ maxLength: 12 }),
      fc.constantFrom(...values).map((v) => v.toLowerCase()),
      fc.constantFrom(...values).map((v) => ` ${v} `),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.constantFrom(...values), { minLength: 1, maxLength: 2 }),
    )
    .filter((v) => !(typeof v === 'string' && (values as readonly string[]).includes(v)));

const base12Arb = fc
  .array(fc.constantFrom(...ALNUM.split('')), { minLength: 12, maxLength: 12 })
  .map((a) => a.join(''));

/** CNPJ válido (numérico ou alfanumérico), com ou sem máscara, em maiúsculas ou minúsculas. */
const validCnpjArb = fc
  .tuple(base12Arb, fc.boolean(), fc.boolean())
  .map(([base, masked, lower]) => {
    const raw = base + cnpjCheckDigits(base);
    return { raw, masked, lower };
  })
  .filter(({ raw }) => isValidCnpj(raw))
  .map(({ raw, masked, lower }) => {
    const s = masked ? formatCnpj(raw) : raw;
    return { input: lower ? s.toLowerCase() : s, normalized: raw };
  });

/** Entradas rejeitadas pelo Validador_CNPJ, construídas por categoria de defeito. */
const invalidCnpjArb: fc.Arbitrary<unknown> = fc.oneof(
  // DV alterado
  fc.tuple(base12Arb, fc.integer({ min: 0, max: 1 }), fc.integer({ min: 1, max: 9 })).map(([base, pos, delta]) => {
    const dv = cnpjCheckDigits(base).split('');
    dv[pos] = String((Number(dv[pos]) + delta) % 10);
    return base + dv.join('');
  }),
  // tamanho ≠ 14
  fc
    .array(fc.constantFrom(...ALNUM.split('')), { maxLength: 20 })
    .map((a) => a.join(''))
    .filter((s) => s.length !== 14),
  // todos iguais
  fc.constantFrom(...ALNUM.split('')).map((c) => c.repeat(14)),
  // DV com letra
  fc.tuple(base12Arb, fc.constantFrom(...'ABCXYZ'.split(''))).map(([b, l]) => `${b}${l}0`),
  // texto arbitrário que o validador recusa
  fc.string({ maxLength: 20 }).filter((s) => !isValidCnpj(s)),
  // tipos não string
  fc.oneof(fc.integer(), fc.constant(null), fc.boolean(), fc.array(fc.string(), { maxLength: 2 })),
);

/** Ids de autor opcionais enviados pelo cliente (descartados pelos schemas). */
const authorIdsArb = fc
  .subarray([...AUTHOR_KEYS])
  .chain((keys) =>
    fc.tuple(...keys.map(() => fc.string({ maxLength: 10 }))).map((vals) =>
      Object.fromEntries(keys.map((k, i) => [k, vals[i]])),
    ),
  );

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe('Property 46: Validação dos parâmetros novos', () => {
  it('mineração: fonte inválida é rejeitada com o campo em fields', () => {
    fc.assert(
      fc.property(baseRunArb, notInEnum(SOURCES), (base, fonte) => {
        const r = validateRunInput({ ...base, fonte });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.fields.fonte).toBe(MSG.fonte);
      }),
      { numRuns: 200 },
    );
  });

  it('mineração: pagespeedEnabled/cnpjEnabled não booleanos são rejeitados com o campo em fields', () => {
    fc.assert(
      fc.property(
        baseRunArb,
        fc.constantFrom('pagespeedEnabled', 'cnpjEnabled'),
        nonBooleanArb,
        (base, field, value) => {
          const r = validateRunInput({ ...base, [field]: value });
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.fields[field]).toBe(MSG.booleano);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('mineração: corpo válido é aceito preservando fonte e opções (padrões MISTA/true/true)', () => {
    fc.assert(
      fc.property(
        baseRunArb,
        fc.option(fc.constantFrom(...SOURCES), { nil: undefined }),
        fc.option(fc.boolean(), { nil: undefined }),
        fc.option(fc.boolean(), { nil: undefined }),
        (base, fonte, pagespeedEnabled, cnpjEnabled) => {
          const body: Record<string, unknown> = { ...base };
          if (fonte !== undefined) body.fonte = fonte;
          if (pagespeedEnabled !== undefined) body.pagespeedEnabled = pagespeedEnabled;
          if (cnpjEnabled !== undefined) body.cnpjEnabled = cnpjEnabled;
          const r = validateRunInput(body);
          expect(r.ok).toBe(true);
          if (r.ok) {
            expect(r.value.fonte).toBe(fonte ?? 'MISTA');
            expect(r.value.pagespeedEnabled).toBe(pagespeedEnabled ?? true);
            expect(r.value.cnpjEnabled).toBe(cnpjEnabled ?? true);
            expect(r.value.uf).toBe(base.uf);
            expect(r.value.nichos).toEqual(base.nichos);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('abordagem: canal fora de WHATSAPP/EMAIL é rejeitado com o campo em fields', () => {
    fc.assert(
      fc.property(notInEnum(CHANNELS), authorIdsArb, (canal, ids) => {
        const parsed = approachBodySchema.safeParse({ ...ids, canal });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(zodFieldErrors(parsed.error).canal).toBe(MSG.canal);
      }),
      { numRuns: 200 },
    );
  });

  it('abordagem: canal válido é aceito e preservado (ids de autor descartados)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CHANNELS), authorIdsArb, (canal, ids) => {
        const parsed = approachBodySchema.safeParse({ ...ids, canal });
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data).toEqual({ canal });
      }),
      { numRuns: 100 },
    );
  });

  it('CNPJ: entrada recusada pelo Validador_CNPJ é rejeitada com "CNPJ inválido" em fields.cnpj', () => {
    fc.assert(
      fc.property(invalidCnpjArb, authorIdsArb, (cnpj, ids) => {
        if (typeof cnpj === 'string') expect(isValidCnpj(cnpj)).toBe(false);
        const parsed = cnpjBodySchema.safeParse({ ...ids, cnpj });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(zodFieldErrors(parsed.error).cnpj).toBe('CNPJ inválido');
      }),
      { numRuns: 300 },
    );
  });

  it('CNPJ: CNPJ válido (com ou sem máscara) é aceito e devolvido normalizado', () => {
    fc.assert(
      fc.property(validCnpjArb, authorIdsArb, ({ input, normalized }, ids) => {
        const parsed = cnpjBodySchema.safeParse({ ...ids, cnpj: input });
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data).toEqual({ cnpj: normalized });
      }),
      { numRuns: 200 },
    );
  });
});
