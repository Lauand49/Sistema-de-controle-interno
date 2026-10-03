/**
 * Helpers das rotas do Minerador: permissão (403) e validação de query/corpo (400 com `fields`).
 * Requirements: 18.1, 18.3, 18.5, 18.6, 18.11
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-error';
import type { Person } from '@/lib/permissions';
import { companyListSchema, runInputSchema } from '@/lib/leads/filters';
import {
  INVALID_BODY_MESSAGE,
  NEGOCIOS_ONLY_MESSAGE,
  parseBody,
  parseQuery,
  requireNegocios,
} from '@/lib/leads/route-helpers';

const person = (over: Partial<Person> = {}): Person => ({
  id: 'u1',
  status: 'ATIVO',
  globalRole: null,
  departmentCode: null,
  departmentRole: null,
  sectors: [],
  ...over,
});

function catchError(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('esperava ApiError');
}

async function catchAsync(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('esperava ApiError');
}

const jsonReq = (body: string) =>
  new Request('http://localhost/api/tools/lead-miner/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

describe('requireNegocios', () => {
  it('permite Negócios ativo e Presidência', () => {
    expect(() => requireNegocios(person({ departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }))).not.toThrow();
    expect(() => requireNegocios(person({ globalRole: 'PRESIDENTE' }))).not.toThrow();
    expect(() => requireNegocios(person({ globalRole: 'VICE_PRESIDENTE' }))).not.toThrow();
  });

  it('rejeita outros departamentos, inativos e ausentes com 403 e mensagem do design', () => {
    for (const actor of [
      person({ departmentCode: 'GENTE', departmentRole: 'GERENTE' }),
      person({ departmentCode: 'NEGOCIOS', status: 'INATIVO' }),
      person({ departmentCode: 'NEGOCIOS', status: 'PENDENTE' }),
      null,
    ]) {
      const err = catchError(() => requireNegocios(actor));
      expect(err.status).toBe(403);
      expect(err.message).toBe(NEGOCIOS_ONLY_MESSAGE);
      expect(err.extra).toBeUndefined();
    }
  });
});

describe('parseQuery', () => {
  it('aceita string de URL, URL e URLSearchParams', () => {
    const url = 'http://localhost/api/tools/lead-miner/companies?uf=SP&scoreMin=10&page=2';
    for (const src of [url, new URL(url), new URL(url).searchParams]) {
      const q = parseQuery(companyListSchema, src);
      expect(q).toMatchObject({ uf: 'SP', scoreMin: 10, page: 2 });
    }
  });

  it('lança 400 com fields e mensagem do primeiro campo inválido', () => {
    const err = catchError(() =>
      parseQuery(companyListSchema, new URLSearchParams('scoreMin=80&scoreMax=10&uf=XX')),
    );
    expect(err.status).toBe(400);
    const fields = err.extra?.fields as Record<string, string>;
    expect(fields.uf).toBe('Selecione uma UF válida.');
    expect(fields.scoreMin).toBe('Faixa de score inválida (0 a 100, mínimo ≤ máximo)');
    expect(Object.values(fields)).toContain(err.message);
  });
});

describe('parseBody', () => {
  it('valida o corpo e descarta campos de autor', async () => {
    const body = await parseBody(
      runInputSchema,
      jsonReq(JSON.stringify({ bairro: ' Centro ', cidade: 'Santos', uf: 'SP', preset: 'icp', createdById: 'x' })),
    );
    expect(body.bairro).toBe('Centro');
    expect(body.nichos.length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('createdById');
  });

  it('JSON inválido ou corpo vazio → 400', async () => {
    for (const raw of ['{bairro:', '']) {
      const err = await catchAsync(parseBody(runInputSchema, jsonReq(raw)));
      expect(err.status).toBe(400);
      expect(err.message).toBe(INVALID_BODY_MESSAGE);
    }
  });

  it('parâmetros inválidos → 400 com fields', async () => {
    const err = await catchAsync(
      parseBody(runInputSchema, jsonReq(JSON.stringify({ bairro: '', cidade: 'Santos', uf: 'SP', nichos: [] }))),
    );
    expect(err.status).toBe(400);
    expect(err.extra?.fields).toMatchObject({ bairro: expect.any(String), nichos: expect.any(String) });
  });
});
