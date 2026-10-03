/**
 * **Validates: Requirements 12.1, 12.2**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { needsLookup, parseBrasilApi } from '@/lib/leads/brasilapi';
// Feature: lead-miner-enrichment, Property 32: For any CNPJ e estado dos Dados_CNPJ (ausentes, de outro CNPJ, com idade entre 0 e 200 dias), needsLookup é verdadeiro exatamente quando os dados estão ausentes, pertencem a outro CNPJ ou têm mais de 90 dias; e for any JSON de resposta com campos extras (QSA, e-mail, telefone, campos aleatórios), parseBrasilApi devolve somente as chaves de CnpjData, com valores copiados dos campos correspondentes ou null.

const DAY_MS = 86_400_000;
const NOW = new Date('2025-06-01T12:00:00.000Z');

const arbCnpj = fc.stringMatching(/^[0-9]{14}$/);

const CNPJ_DATA_KEYS = [
  'cnpj',
  'razaoSocial',
  'nomeFantasia',
  'situacao',
  'situacaoData',
  'cnaeCodigo',
  'cnaeDescricao',
  'porte',
  'naturezaJuridica',
  'mei',
  'inicioAtividade',
  'municipio',
  'uf',
  'consultadoEm',
].sort();

/** Campo de texto da BrasilAPI → chave de CnpjData. */
const STRING_FIELDS: Array<[string, string]> = [
  ['razao_social', 'razaoSocial'],
  ['nome_fantasia', 'nomeFantasia'],
  ['descricao_situacao_cadastral', 'situacao'],
  ['data_situacao_cadastral', 'situacaoData'],
  ['cnae_fiscal', 'cnaeCodigo'],
  ['cnae_fiscal_descricao', 'cnaeDescricao'],
  ['porte', 'porte'],
  ['natureza_juridica', 'naturezaJuridica'],
  ['data_inicio_atividade', 'inicioAtividade'],
  ['municipio', 'municipio'],
  ['uf', 'uf'],
];

/** Valor bruto + valor esperado após a cópia (string aparada, número → string, resto → null). */
type Raw = { present: boolean; value: unknown; expected: string | boolean | null };

const arbStrRaw: fc.Arbitrary<Raw> = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 .\-/]{0,20}[A-Za-z0-9]$/).map((s) => ({ present: true, value: s, expected: s })),
  fc.integer({ min: 0, max: 99_999_999 }).map((n) => ({ present: true, value: n, expected: String(n) })),
  fc.constantFrom('', '   ').map((s) => ({ present: true, value: s, expected: null })),
  fc.constantFrom<unknown>(null, true, [], {}).map((v) => ({ present: true, value: v, expected: null })),
  fc.constant({ present: false, value: undefined, expected: null }),
);

const arbBoolRaw: fc.Arbitrary<Raw> = fc.oneof(
  fc.boolean().map((b) => ({ present: true, value: b, expected: b })),
  fc.constantFrom<unknown>(null, 'S', 1, 'true').map((v) => ({ present: true, value: v, expected: null })),
  fc.constant({ present: false, value: undefined, expected: null }),
);

/** Campos extras que nunca podem vazar: QSA, contato e chaves aleatórias. */
const arbExtras = fc.record({
  qsa: fc.array(fc.record({ nome_socio: fc.string(), cnpj_cpf_do_socio: fc.string() }), { maxLength: 3 }),
  email: fc.emailAddress(),
  ddd_telefone_1: fc.stringMatching(/^[0-9]{10,11}$/),
  ddd_telefone_2: fc.stringMatching(/^[0-9]{10,11}$/),
  random: fc.dictionary(fc.stringMatching(/^x_[a-z]{1,8}$/), fc.jsonValue(), { maxKeys: 5 }),
});

describe('Property 32: Consulta e minimização dos Dados_CNPJ', () => {
  it('needsLookup ⇔ ausente, de outro CNPJ ou mais de 90 dias', () => {
    const arbState = fc.oneof(
      fc.constant({ kind: 'ausente' as const }),
      fc.record({ kind: fc.constant('outro' as const), other: arbCnpj, ageMs: fc.integer({ min: 0, max: 200 * DAY_MS }) }),
      fc.record({ kind: fc.constant('mesmo' as const), ageMs: fc.integer({ min: 0, max: 200 * DAY_MS }) }),
      // Fronteira exata de 90 dias (± 1 ms).
      fc.record({ kind: fc.constant('mesmo' as const), ageMs: fc.constantFrom(90 * DAY_MS - 1, 90 * DAY_MS, 90 * DAY_MS + 1) }),
    );
    fc.assert(
      fc.property(arbCnpj, arbState, fc.boolean(), (cnpj, st, asString) => {
        let input: { cnpjDadosCnpj: string | null; cnpjConsultadoEm: Date | string | null };
        let expected: boolean;
        if (st.kind === 'ausente') {
          input = { cnpjDadosCnpj: null, cnpjConsultadoEm: null };
          expected = true;
        } else {
          const at = new Date(NOW.getTime() - st.ageMs);
          const owner = st.kind === 'outro' ? st.other : cnpj;
          input = { cnpjDadosCnpj: owner, cnpjConsultadoEm: asString ? at.toISOString() : at };
          expected = owner !== cnpj || st.ageMs > 90 * DAY_MS;
        }
        expect(needsLookup(input, cnpj, NOW)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('parseBrasilApi devolve só as chaves de CnpjData, copiadas ou null', () => {
    const arbFields = fc.tuple(fc.array(arbStrRaw, { minLength: STRING_FIELDS.length, maxLength: STRING_FIELDS.length }), arbBoolRaw);
    fc.assert(
      fc.property(arbCnpj, arbFields, arbExtras, (cnpj, [strs, mei], extras) => {
        const json: Record<string, unknown> = { ...extras.random, qsa: extras.qsa, email: extras.email, ddd_telefone_1: extras.ddd_telefone_1, ddd_telefone_2: extras.ddd_telefone_2 };
        STRING_FIELDS.forEach(([src], i) => {
          if (strs[i].present) json[src] = strs[i].value;
        });
        if (mei.present) json.opcao_pelo_mei = mei.value;

        const out = parseBrasilApi(json, cnpj, NOW);
        expect(out).not.toBeNull();
        const rec = out as unknown as Record<string, unknown>;
        expect(Object.keys(rec).sort()).toEqual(CNPJ_DATA_KEYS);
        expect(rec.cnpj).toBe(cnpj);
        expect(rec.consultadoEm).toBe(NOW.toISOString());
        STRING_FIELDS.forEach(([, dst], i) => expect(rec[dst]).toBe(strs[i].expected));
        expect(rec.mei).toBe(mei.expected);

        // Nada de QSA, e-mail ou telefone no resultado serializado.
        const serialized = JSON.stringify(rec);
        expect(serialized).not.toContain(extras.email);
        expect(serialized).not.toContain(extras.ddd_telefone_1);
        expect(serialized).not.toContain(extras.ddd_telefone_2);
      }),
      { numRuns: 200 },
    );
  });
});
