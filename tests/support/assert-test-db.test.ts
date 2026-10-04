import { describe, expect, it } from 'vitest';
import { TEST_DB_SUFFIX, assertTestDatabase, databaseNameFromUrl } from './assert-test-db';
import { databaseName, seedRefusal } from '../../prisma/seed-guard';

const url = (db: string) => `postgresql://u:p@localhost:5432/${db}?schema=public`;

describe('databaseNameFromUrl', () => {
  it('extrai o nome do banco ignorando a query string', () => {
    expect(databaseNameFromUrl(url('scitec_test'))).toBe('scitec_test');
    expect(databaseNameFromUrl('postgres://localhost/scitec_dev')).toBe('scitec_dev');
  });

  it('devolve null para URL inválida ou sem banco', () => {
    for (const bad of [undefined, null, '', '   ', 'isso não é url', 'postgresql://u:p@localhost:5432', 'postgresql://u:p@localhost:5432/', 'postgresql://u@h/a/b']) {
      expect(databaseNameFromUrl(bad as string | null | undefined)).toBeNull();
    }
  });
});

describe('assertTestDatabase', () => {
  it('aceita scitec_test (e devolve a URL)', () => {
    const u = url('scitec_test');
    expect(assertTestDatabase(u)).toBe(u);
    expect(TEST_DB_SUFFIX).toBe('_test');
  });

  it('rejeita scitec_dev com mensagem clara', () => {
    expect(() => assertTestDatabase(url('scitec_dev'))).toThrow(/scitec_dev.*não termina em "_test"/);
  });

  it('rejeita bancos que só parecem de teste', () => {
    for (const name of ['scitec', 'scitec_test_backup', 'test', 'scitec_testing', 'scitec-test', 'SCITEC_TEST']) {
      expect(() => assertTestDatabase(url(name)), name).toThrow();
    }
  });

  it('rejeita URL sem nome de banco, vazia ou ausente', () => {
    for (const bad of ['postgresql://u:p@localhost:5432', 'postgresql://u:p@localhost:5432/', '', undefined, null, 'lixo']) {
      expect(() => assertTestDatabase(bad as string | undefined)).toThrow(/ausente ou não contém o nome do banco/);
    }
  });

  it('a mensagem de erro explica como configurar', () => {
    expect(() => assertTestDatabase(url('scitec_dev'))).toThrow(/TEST_DATABASE_URL|\.env\.test|createdb scitec_test/);
  });
});

describe('trava do seed', () => {
  const base = { nodeEnv: 'development' as string | undefined };

  it('banco *_test passa; outro exige SEED_CONFIRM_DB com o nome exato', () => {
    expect(seedRefusal({ ...base, url: url('scitec_test'), confirm: undefined })).toBeNull();
    expect(seedRefusal({ ...base, url: url('scitec_dev'), confirm: undefined })).toMatch(/SEED_CONFIRM_DB=scitec_dev/);
    expect(seedRefusal({ ...base, url: url('scitec_dev'), confirm: 'outro' })).not.toBeNull();
    expect(seedRefusal({ ...base, url: url('scitec_dev'), confirm: 'scitec_dev' })).toBeNull();
  });

  it('recusa produção e URL sem banco', () => {
    expect(seedRefusal({ nodeEnv: 'production', url: url('scitec_test'), confirm: 'scitec_test' })).toMatch(/production/);
    expect(seedRefusal({ ...base, url: undefined, confirm: 'x' })).toMatch(/nome do banco/);
    expect(databaseName('postgresql://h/')).toBeNull();
  });
});
