/**
 * **Validates: Requirements 8.8, 9.5, 11.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { INSTAGRAM_RESERVED, parseSinais, serializeSinais } from '@/lib/leads/signals';
import { cnpjCheckDigits, isValidCnpj, parseCandidates, serializeCandidates } from '@/lib/leads/cnpj';
import { TECH_GROUP_ORDER } from '@/lib/leads/config';
import type { CandidateReason, CnpjCandidate, SinaisDigitais, TechHit } from '@/lib/leads/types';

// Feature: lead-miner-enrichment, Property 22: For any SinaisDigitais e lista de CnpjCandidate válidos, parseSinais(serializeSinais(s)) e parseCandidates(serializeCandidates(c)) devolvem valores profundamente iguais aos originais; e for any valor JSON arbitrário, os parsers devolvem null/lista vazia ou um valor válido, sem lançar.

const RUNS = { numRuns: 150 };

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

const RESERVED: ReadonlySet<string> = new Set(INSTAGRAM_RESERVED);
const handleArb = fc
  .stringMatching(/^[a-z0-9._]{1,30}$/)
  .filter((h) => !RESERVED.has(h));
const whatsappArb = fc.stringMatching(/^55[0-9]{10,11}$/);
const originArb = fc.constantFrom('SITE' as const, 'OSM' as const);
const groupArb = fc.constantFrom(...TECH_GROUP_ORDER);

/** Ordem esperada (Req. 9.3): grupo, rótulo (pt-BR), id. */
function modelCompare(a: TechHit, b: TechHit): number {
  return (
    TECH_GROUP_ORDER.indexOf(a.group) - TECH_GROUP_ORDER.indexOf(b.group) ||
    a.label.localeCompare(b.label, 'pt-BR') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

const techListArb = fc
  .uniqueArray(
    fc.record({ id: fc.string({ minLength: 1, maxLength: 12 }), label: fc.string({ maxLength: 12 }), group: groupArb }),
    { selector: (t) => t.id, maxLength: 8 },
  )
  .map((list) => [...list].sort(modelCompare));

const sinaisArb: fc.Arbitrary<SinaisDigitais> = fc
  .record({
    instagram: fc.option(fc.tuple(handleArb, originArb), { nil: null }),
    whatsapp: fc.option(fc.tuple(whatsappArb, originArb), { nil: null }),
    tecnologias: techListArb,
  })
  .map(({ instagram, whatsapp, tecnologias }) => ({
    instagram: instagram ? instagram[0] : null,
    instagramOrigem: instagram ? instagram[1] : null,
    whatsapp: whatsapp ? whatsapp[0] : null,
    whatsappOrigem: whatsapp ? whatsapp[1] : null,
    tecnologias,
  }));

const REASONS: CandidateReason[] = [
  'MULTIPLOS',
  'CONFLITO',
  'UF_DIVERGENTE',
  'NAO_ENCONTRADO',
  'MANUAL_PRESERVADO',
  'CONSULTA_DESABILITADA',
];

const cnpjArb = fc
  .stringMatching(/^[0-9A-Z]{12}$/)
  .map((base) => base + cnpjCheckDigits(base))
  .filter((c) => isValidCnpj(c));

const candidateArb: fc.Arbitrary<CnpjCandidate> = fc
  .record({
    cnpj: cnpjArb,
    motivo: fc.constantFrom(...REASONS),
    conflitoCompanyId: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
  })
  .map(({ cnpj, motivo, conflitoCompanyId }) =>
    conflitoCompanyId === undefined ? { cnpj, motivo } : { cnpj, motivo, conflitoCompanyId },
  );

/** Valores arbitrários: JSON qualquer, strings soltas e objetos “quase válidos”. */
const anyValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.jsonValue(),
  fc.string(),
  fc.json(),
  fc.constant(undefined),
  sinaisArb.map((s) => ({ ...serializeSinais(s), extra: 1 })),
  fc.array(candidateArb).map((c) => [...serializeCandidates(c), { cnpj: 1 }, null, 'x']),
  fc.record({
    instagram: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
    instagramOrigem: fc.oneof(originArb, fc.string()),
    whatsapp: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
    whatsappOrigem: fc.oneof(originArb, fc.string()),
    tecnologias: fc.array(fc.oneof(fc.jsonValue(), fc.record({ id: fc.string(), label: fc.string(), group: fc.string() }))),
  }),
);

// ---------------------------------------------------------------------------
// Verificadores de validade
// ---------------------------------------------------------------------------

function expectValidSinais(s: SinaisDigitais): void {
  expect((s.instagram === null) === (s.instagramOrigem === null)).toBe(true);
  expect((s.whatsapp === null) === (s.whatsappOrigem === null)).toBe(true);
  if (s.instagram !== null) {
    expect(s.instagram).toMatch(/^[a-z0-9._]{1,30}$/);
    expect(RESERVED.has(s.instagram)).toBe(false);
  }
  if (s.whatsapp !== null) expect(s.whatsapp).toMatch(/^[0-9]{12,13}$/);
  const ids = s.tecnologias.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const t of s.tecnologias) expect(TECH_GROUP_ORDER).toContain(t.group);
  expect(s.tecnologias).toEqual([...s.tecnologias].sort(modelCompare));
}

function expectValidCandidates(list: CnpjCandidate[]): void {
  for (const c of list) {
    expect(isValidCnpj(c.cnpj)).toBe(true);
    expect(c.cnpj).toMatch(/^[0-9A-Z]{12}[0-9]{2}$/);
    expect(REASONS).toContain(c.motivo);
    if ('conflitoCompanyId' in c) expect(typeof c.conflitoCompanyId).toBe('string');
  }
}

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe('Property 22: round-trip da gravação de sinais, tecnologias e candidatos', () => {
  it('parseSinais(serializeSinais(s)) é profundamente igual a s (direto e via JSON)', () => {
    fc.assert(
      fc.property(sinaisArb, (s) => {
        const ser = serializeSinais(s);
        expect(parseSinais(ser)).toEqual(s);
        expect(parseSinais(JSON.parse(JSON.stringify(ser)))).toEqual(s);
        expect(parseSinais(JSON.stringify(ser))).toEqual(s);
      }),
      RUNS,
    );
  });

  it('parseCandidates(serializeCandidates(c)) é profundamente igual a c (direto e via JSON)', () => {
    fc.assert(
      fc.property(fc.array(candidateArb, { maxLength: 8 }), (list) => {
        const ser = serializeCandidates(list);
        expect(parseCandidates(ser)).toEqual(list);
        expect(parseCandidates(JSON.parse(JSON.stringify(ser)))).toEqual(list);
        expect(parseCandidates(JSON.stringify(ser))).toEqual(list);
      }),
      RUNS,
    );
  });

  it('parseSinais nunca lança e devolve null ou um valor válido estável', () => {
    fc.assert(
      fc.property(anyValueArb, (v) => {
        const r = parseSinais(v);
        if (r === null) return;
        expectValidSinais(r);
        expect(parseSinais(serializeSinais(r))).toEqual(r);
      }),
      RUNS,
    );
  });

  it('parseCandidates nunca lança e devolve uma lista (possivelmente vazia) de candidatos válidos', () => {
    fc.assert(
      fc.property(anyValueArb, (v) => {
        const r = parseCandidates(v);
        expect(Array.isArray(r)).toBe(true);
        expectValidCandidates(r);
        expect(parseCandidates(serializeCandidates(r))).toEqual(r);
      }),
      RUNS,
    );
  });
});
