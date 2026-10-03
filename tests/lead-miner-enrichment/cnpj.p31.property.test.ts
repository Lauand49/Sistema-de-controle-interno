/**
 * **Validates: Requirements 11.4, 11.5, 11.9, 12.3, 12.4, 12.7**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CNPJ_STATUS,
  cnpjCheckDigits,
  formatCnpj,
  mergeCandidates,
  planCnpj,
  resolveSiteCnpj,
  type CnpjLookupOutcome,
} from '@/lib/leads/cnpj';
import type { CandidateReason, CnpjCandidate, CnpjData, CnpjOrigin } from '@/lib/leads/types';
// Feature: lead-miner-enrichment, Property 31: For any estado de Empresa (sem CNPJ, CNPJ SITE, CNPJ MANUAL), lista de CNPJs encontrados, opção de consulta e desfecho da BrasilAPI, planCnpj + resolveSiteCnpj coincide com o modelo: um encontrado e sem CNPJ → aplicado (SITE) salvo 404 (NAO_ENCONTRADO) ou UF divergente (UF_DIVERGENTE); indisponível → aplicado sem dados; dois ou mais → MULTIPLOS; MANUAL → mantido e demais MANUAL_PRESERVADO; consulta desabilitada → nada aplicado nem consultado; o CNPJ aplicado nunca aparece entre os candidatos.

const validCnpj = fc
  .oneof(fc.stringMatching(/^[0-9]{12}$/), fc.stringMatching(/^[0-9A-Z]{12}$/))
  .map((base) => base + cnpjCheckDigits(base))
  .filter((c) => !/^(.)\1{13}$/.test(c));

const UFS = ['SP', 'RJ', 'MG'] as const;

function makeData(cnpj: string, uf: string | null): CnpjData {
  return {
    cnpj,
    razaoSocial: 'Empresa Teste LTDA',
    nomeFantasia: null,
    situacao: 'ATIVA',
    situacaoData: null,
    cnaeCodigo: null,
    cnaeDescricao: null,
    porte: null,
    naturezaJuridica: null,
    mei: null,
    inicioAtividade: null,
    municipio: null,
    uf,
    consultadoEm: '2024-01-01T00:00:00.000Z',
  };
}

type LookupKind = 'OK_SAME' | 'OK_DIFF' | 'NAO_ENCONTRADO' | 'INDISPONIVEL';

const scenario = fc
  .record({
    pool: fc.uniqueArray(validCnpj, { minLength: 4, maxLength: 4 }),
    origin: fc.constantFrom<'NONE' | CnpjOrigin>('NONE', 'SITE', 'MANUAL'),
    // índices no pool (com repetição) + strings inválidas; formatado ou não
    picks: fc.array(
      fc.oneof(
        fc.record({ idx: fc.integer({ min: 0, max: 3 }), formatted: fc.boolean(), lower: fc.boolean() }),
        fc.constantFrom('00000000000000', '12345678000100', 'abc', ''),
      ),
      { maxLength: 6 },
    ),
    enrich: fc.boolean(),
    companyUf: fc.option(fc.constantFrom(...UFS), { nil: null }),
    lookupKind: fc.constantFrom<LookupKind>('OK_SAME', 'OK_DIFF', 'NAO_ENCONTRADO', 'INDISPONIVEL'),
    existing: fc.array(
      fc.record({
        idx: fc.integer({ min: 0, max: 3 }),
        motivo: fc.constantFrom<CandidateReason>('MULTIPLOS', 'CONFLITO', 'UF_DIVERGENTE'),
      }),
      { maxLength: 3 },
    ),
  })
  .map((s) => {
    // CNPJ atual da Empresa é sempre pool[0] (quando houver)
    const current = s.origin === 'NONE' ? null : s.pool[0];
    const found = s.picks.map((p) => {
      if (typeof p === 'string') return p;
      let c = s.pool[p.idx];
      if (p.formatted) c = formatCnpj(c);
      return p.lower ? c.toLowerCase() : c;
    });
    const existing: CnpjCandidate[] = s.existing
      .map((e) => ({ cnpj: s.pool[e.idx], motivo: e.motivo }))
      .filter((c) => c.cnpj !== current);
    return { ...s, current, found, existingCands: existing };
  });

describe('Property 31: plano e resolução do CNPJ', () => {
  it('planCnpj + resolveSiteCnpj coincidem com o modelo de referência', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const company = {
          cnpj: s.current,
          cnpjOrigem: s.origin === 'NONE' ? null : (s.origin as CnpjOrigin),
          cnpjCandidatos: s.existingCands,
        };

        // ---------------- Sistema real ----------------
        let lookupCalls = 0;
        const doLookup = (cnpj: string): CnpjLookupOutcome => {
          lookupCalls++;
          const otherUf = UFS.find((u) => u !== s.companyUf) ?? 'BA';
          switch (s.lookupKind) {
            case 'OK_SAME':
              return { ok: true, data: makeData(cnpj, s.companyUf) };
            case 'OK_DIFF':
              return { ok: true, data: makeData(cnpj, s.companyUf ? otherUf : 'BA') };
            case 'NAO_ENCONTRADO':
              return { ok: false, reason: 'NAO_ENCONTRADO' };
            default:
              return { ok: false, reason: 'INDISPONIVEL' };
          }
        };

        const plan = planCnpj(company, s.found, { enrich: s.enrich });
        let applied: string | null = s.current;
        let origin: CnpjOrigin | null = company.cnpjOrigem;
        let data: CnpjData | null = null;
        let status: string | null = null;
        let newCands: CnpjCandidate[] = [];
        if (plan.kind === 'APPLY_SITE') {
          // o pipeline só consulta quando a consulta está habilitada
          const r = resolveSiteCnpj(plan, s.companyUf, doLookup(plan.cnpj));
          if (r.apply) {
            applied = plan.cnpj;
            origin = 'SITE';
          }
          data = r.data;
          status = r.status;
          if (r.candidate) newCands = [r.candidate];
        } else if (plan.kind === 'CANDIDATES') {
          newCands = plan.candidates;
        }
        const finalCands = mergeCandidates(newCands, s.existingCands, applied);

        // ---------------- Modelo ----------------
        const distinct: string[] = [];
        for (const f of s.found) {
          const n = f.toUpperCase().replace(/[./\-\s]/g, '');
          if (s.pool.includes(n) && !distinct.includes(n)) distinct.push(n);
        }
        const others = distinct.filter((c) => c !== s.current);

        let expApplied = s.current;
        let expOrigin = company.cnpjOrigem;
        let expData = false;
        let expStatus: string | null = null;
        let expCands: CnpjCandidate[] = [];
        let expLookup = 0;
        if (others.length === 0) {
          // nada novo
        } else if (s.origin === 'MANUAL') {
          expCands = others.map((cnpj) => ({ cnpj, motivo: 'MANUAL_PRESERVADO' }));
        } else if (!s.enrich) {
          expCands = others.map((cnpj) => ({ cnpj, motivo: 'CONSULTA_DESABILITADA' }));
        } else if (distinct.length >= 2 || s.current !== null) {
          expCands = others.map((cnpj) => ({ cnpj, motivo: 'MULTIPLOS' }));
        } else {
          const c = others[0];
          expLookup = 1;
          const ufDiff = s.lookupKind === 'OK_DIFF' && s.companyUf !== null;
          if (s.lookupKind === 'NAO_ENCONTRADO') {
            expCands = [{ cnpj: c, motivo: 'NAO_ENCONTRADO' }];
            expStatus = CNPJ_STATUS.NAO_ENCONTRADO;
          } else if (ufDiff) {
            expCands = [{ cnpj: c, motivo: 'UF_DIVERGENTE' }];
            expStatus = CNPJ_STATUS.UF_DIVERGENTE;
          } else {
            expApplied = c;
            expOrigin = 'SITE';
            if (s.lookupKind === 'INDISPONIVEL') expStatus = CNPJ_STATUS.INDISPONIVEL;
            else expData = true;
          }
        }
        const expFinal = mergeExpected(expCands, s.existingCands, expApplied);

        expect(lookupCalls).toBe(expLookup);
        expect(applied).toBe(expApplied);
        expect(origin).toBe(expOrigin);
        expect(data !== null).toBe(expData);
        if (data) expect(data.cnpj).toBe(expApplied);
        expect(status).toBe(expStatus);
        expect(newCands).toEqual(expCands);
        expect(finalCands).toEqual(expFinal);
        // Invariante: o CNPJ aplicado nunca aparece entre os candidatos
        if (applied) expect(finalCands.some((c) => c.cnpj === applied)).toBe(false);
        // Consulta desabilitada: nada novo aplicado nem consultado
        if (!s.enrich) {
          expect(applied).toBe(s.current);
          expect(lookupCalls).toBe(0);
        }
        // MANUAL: sempre mantido
        if (s.origin === 'MANUAL') {
          expect(applied).toBe(s.current);
          expect(origin).toBe('MANUAL');
        }
      }),
      { numRuns: 200 },
    );
  });
});

/** Modelo independente do merge: novos primeiro, sem repetição, sem o aplicado. */
function mergeExpected(a: CnpjCandidate[], b: CnpjCandidate[], applied: string | null): CnpjCandidate[] {
  const out: CnpjCandidate[] = [];
  for (const c of [...a, ...b]) {
    if (c.cnpj === applied || out.some((o) => o.cnpj === c.cnpj)) continue;
    out.push(c);
  }
  return out;
}
