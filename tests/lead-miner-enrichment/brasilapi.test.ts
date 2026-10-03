import { describe, expect, it } from 'vitest';
import {
  brasilApiPath,
  lookupCnpj,
  needsLookup,
  parseBrasilApi,
  type BrasilApiDeps,
} from '@/lib/leads/brasilapi';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import { brasilApiJson, fakeBrasilApi } from './support/fake-brasilapi';
import type { ScriptStep } from './support/scripted';
import type { BrasilApiCall } from './support/fake-brasilapi';

const CNPJ = '11222333000181';
const NOW = new Date('2025-06-01T12:00:00.000Z');

/** Relógio virtual: `sleep` avança o tempo sem esperar. */
function setup(script: ReadonlyArray<ScriptStep<BrasilApiCall>>) {
  let t = NOW.getTime();
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
    t += ms;
  };
  const http = fakeBrasilApi(script, { sleep });
  const deps: BrasilApiDeps = {
    http,
    limiter: intervalLimiter(1000, { now: () => t, sleep }),
    sleep,
    now: () => new Date(t),
  };
  return { http, deps, sleeps, now: () => t };
}

describe('parseBrasilApi', () => {
  it('copia só os campos de CnpjData e descarta QSA/e-mail/telefone', () => {
    const data = parseBrasilApi(brasilApiJson(CNPJ), CNPJ, NOW);
    expect(data).toEqual({
      cnpj: CNPJ,
      razaoSocial: 'CLINICA SORRISO LTDA',
      nomeFantasia: 'CLINICA SORRISO',
      situacao: 'ATIVA',
      situacaoData: '2015-03-10',
      cnaeCodigo: '8630504',
      cnaeDescricao: 'Atividade odontológica',
      porte: 'MICRO EMPRESA',
      naturezaJuridica: 'Sociedade Empresária Limitada',
      mei: false,
      inicioAtividade: '2015-03-10',
      municipio: 'SAO PAULO',
      uf: 'SP',
      consultadoEm: NOW.toISOString(),
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain('FULANO');
    expect(text).not.toContain('contato@example.com');
    expect(text).not.toContain('1133334444');
  });

  it('campo ausente ou vazio vira null; corpo não-objeto → null', () => {
    const data = parseBrasilApi({ razao_social: '  ', uf: 'RJ' }, CNPJ, NOW);
    expect(data?.razaoSocial).toBeNull();
    expect(data?.mei).toBeNull();
    expect(data?.uf).toBe('RJ');
    expect(parseBrasilApi(null, CNPJ, NOW)).toBeNull();
    expect(parseBrasilApi([1], CNPJ, NOW)).toBeNull();
  });
});

describe('needsLookup', () => {
  const day = 86_400_000;
  it('ausente, de outro CNPJ ou com mais de 90 dias', () => {
    expect(needsLookup({ cnpjDadosCnpj: null, cnpjConsultadoEm: null }, CNPJ, NOW)).toBe(true);
    expect(needsLookup({ cnpjDadosCnpj: '00000000000191', cnpjConsultadoEm: NOW }, CNPJ, NOW)).toBe(true);
    expect(needsLookup({ cnpjDadosCnpj: CNPJ, cnpjConsultadoEm: new Date(NOW.getTime() - 90 * day) }, CNPJ, NOW)).toBe(false);
    expect(
      needsLookup({ cnpjDadosCnpj: CNPJ, cnpjConsultadoEm: new Date(NOW.getTime() - 90 * day - 1).toISOString() }, CNPJ, NOW),
    ).toBe(true);
  });
});

describe('brasilApiPath', () => {
  it('codifica o CNPJ como segmento', () => {
    expect(brasilApiPath(CNPJ)).toBe(`/api/cnpj/v1/${CNPJ}`);
    expect(new URL(brasilApiPath('a/../b?x#y'), 'https://brasilapi.com.br').origin).toBe('https://brasilapi.com.br');
  });
});

describe('lookupCnpj', () => {
  it('200 → dados, timeout de 8 s', async () => {
    const { http, deps } = setup([{ status: 200, json: brasilApiJson(CNPJ) }]);
    const out = await lookupCnpj(CNPJ, deps);
    expect(out.ok && out.data.razaoSocial).toBe('CLINICA SORRISO LTDA');
    expect(http.calls).toEqual([{ cnpj: CNPJ, timeoutMs: 8000 }]);
  });

  it('404 → NAO_ENCONTRADO sem retentativa', async () => {
    const { http, deps } = setup([{ status: 404 }]);
    expect(await lookupCnpj(CNPJ, deps)).toEqual({ ok: false, reason: 'NAO_ENCONTRADO' });
    expect(http.calls).toHaveLength(1);
  });

  it.each([429, 503])('%i → 1 retentativa após 2 s', async (status) => {
    const { http, deps, sleeps } = setup([{ status }, { status: 200, json: brasilApiJson(CNPJ) }]);
    const out = await lookupCnpj(CNPJ, deps);
    expect(out.ok).toBe(true);
    expect(http.calls).toHaveLength(2);
    expect(sleeps).toContain(2000);
  });

  it('timeout duas vezes → INDISPONIVEL', async () => {
    const { http, deps } = setup([{ error: 'timeout' }, { delayMs: 9000, status: 200 }]);
    expect(await lookupCnpj(CNPJ, deps)).toEqual({ ok: false, reason: 'INDISPONIVEL' });
    expect(http.calls).toHaveLength(2);
    expect(http.remaining()).toBe(0);
  });

  it('deadline vencido → não envia e devolve INDISPONIVEL', async () => {
    const { http, deps } = setup([]);
    expect(await lookupCnpj(CNPJ, deps, { deadline: NOW.getTime() })).toEqual({ ok: false, reason: 'INDISPONIVEL' });
    expect(http.calls).toHaveLength(0);
  });

  it('sem tempo para a retentativa → INDISPONIVEL após 1 chamada', async () => {
    const { http, deps } = setup([{ status: 500 }]);
    expect(await lookupCnpj(CNPJ, deps, { deadline: NOW.getTime() + 1500 })).toEqual({ ok: false, reason: 'INDISPONIVEL' });
    expect(http.calls).toEqual([{ cnpj: CNPJ, timeoutMs: 1500 }]);
  });

  it.each([429, 502])('%i duas vezes → INDISPONIVEL após 2 chamadas', async (status) => {
    const { http, deps } = setup([{ status }, { status }]);
    expect(await lookupCnpj(CNPJ, deps)).toEqual({ ok: false, reason: 'INDISPONIVEL' });
    expect(http.calls).toHaveLength(2);
  });

  it('espera do limitador ultrapassa o deadline → consulta não enviada', async () => {
    const { http, deps, now } = setup([{ status: 404 }]);
    await lookupCnpj(CNPJ, deps); // ocupa o limitador: próxima saída só em +1 s
    const deadline = now() + 500;
    expect(await lookupCnpj(CNPJ, deps, { deadline })).toEqual({ ok: false, reason: 'INDISPONIVEL' });
    expect(http.calls).toHaveLength(1);
  });

  it('consultas consecutivas respeitam 1 s entre inícios', async () => {
    const { deps, now } = setup([{ status: 404 }, { status: 404 }]);
    const t0 = now();
    await lookupCnpj(CNPJ, deps);
    await lookupCnpj(CNPJ, deps);
    expect(now() - t0).toBeGreaterThanOrEqual(1000);
  });
});
