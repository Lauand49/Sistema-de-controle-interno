/** Etapa 4 (D2) — validação das variáveis de produção: regras, mensagens sem valores e DEV_LOGIN. */
import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_SECRET_MIN_LENGTH,
  EnvConfigError,
  assertProductionEnv,
  formatEnvIssues,
  isProductionRuntime,
  validateProductionEnv,
} from '@/lib/env';
import { enforceProductionEnv } from '../../instrumentation-node';

const SECRET = 'x'.repeat(AUTH_SECRET_MIN_LENGTH);
const GOOD: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pw-secreta@ep-abc-pooler.sa-east-1.aws.neon.tech/scitec?sslmode=require',
  AUTH_SECRET: SECRET,
  AUTH_GOOGLE_ID: '123-abc.apps.googleusercontent.com',
  AUTH_GOOGLE_SECRET: 'GOCSPX-fake',
  ALLOWED_EMAIL_DOMAIN: 'scitecjr.com',
  ADMIN_EMAILS: 'joao.vaz@scitecjr.com',
};
const errors = (env: Record<string, string | undefined>) => validateProductionEnv(env).filter((i) => i.severity === 'error');
const names = (env: Record<string, string | undefined>) => errors(env).map((i) => i.name);
const without = (...keys: string[]) => Object.fromEntries(Object.entries(GOOD).filter(([k]) => !keys.includes(k)));

describe('isProductionRuntime', () => {
  it('NODE_ENV=production ou K_SERVICE (Cloud Run)', () => {
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ K_SERVICE: 'scitec' })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: 'development' })).toBe(false);
    expect(isProductionRuntime({})).toBe(false);
  });
});

describe('validateProductionEnv', () => {
  it('configuração completa: nenhum erro', () => {
    expect(errors(GOOD)).toEqual([]);
  });

  it.each(['DATABASE_URL', 'AUTH_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'])('%s obrigatória', (name) => {
    expect(names(without(name))).toEqual([name]);
    expect(names({ ...GOOD, [name]: '   ' })).toEqual([name]);
  });

  it('AUTH_SECRET curto é erro', () => {
    expect(names({ ...GOOD, AUTH_SECRET: 'curto' })).toEqual(['AUTH_SECRET']);
    expect(names({ ...GOOD, AUTH_SECRET: 'y'.repeat(AUTH_SECRET_MIN_LENGTH) })).toEqual([]);
  });

  it('DATABASE_URL: só postgres, com nome de banco; TLS ausente em host remoto é aviso', () => {
    expect(names({ ...GOOD, DATABASE_URL: 'mysql://u:p@h/db' })).toEqual(['DATABASE_URL']);
    expect(names({ ...GOOD, DATABASE_URL: 'não é url' })).toEqual(['DATABASE_URL']);
    expect(names({ ...GOOD, DATABASE_URL: 'postgresql://u:p@host.neon.tech/' })).toEqual(['DATABASE_URL']);
    const noSsl = validateProductionEnv({ ...GOOD, DATABASE_URL: 'postgresql://u:p@host.neon.tech/scitec' });
    expect(noSsl.filter((i) => i.severity === 'error')).toEqual([]);
    expect(noSsl.some((i) => i.name === 'DATABASE_URL' && i.severity === 'warning')).toBe(true);
    expect(validateProductionEnv({ ...GOOD, DATABASE_URL: 'postgresql://u:p@localhost:5432/scitec' })).toEqual([]);
  });

  it('DEV_LOGIN ligado em produção é erro; desligado/ausente passa', () => {
    expect(names({ ...GOOD, DEV_LOGIN: 'true' })).toEqual(['DEV_LOGIN']);
    expect(names({ ...GOOD, DEV_LOGIN: ' TRUE ' })).toEqual(['DEV_LOGIN']);
    expect(names({ ...GOOD, DEV_LOGIN: 'false' })).toEqual([]);
    expect(names({ ...GOOD, DEV_LOGIN: '' })).toEqual([]);
  });

  it('Cloud Run (K_SERVICE) com NODE_ENV diferente de production é erro', () => {
    expect(names({ ...GOOD, NODE_ENV: 'development', K_SERVICE: 'scitec' })).toEqual(['NODE_ENV']);
    expect(names({ ...without('NODE_ENV'), K_SERVICE: 'scitec' })).toEqual(['NODE_ENV']);
  });

  it('AUTH_URL, se definida, precisa ser https', () => {
    expect(names({ ...GOOD, AUTH_URL: 'http://sistema.scitecjr.com' })).toEqual(['AUTH_URL']);
    expect(names({ ...GOOD, AUTH_URL: 'sistema.scitecjr.com' })).toEqual(['AUTH_URL']);
    expect(names({ ...GOOD, AUTH_URL: 'https://sistema.scitecjr.com' })).toEqual([]);
  });

  it('ALLOWED_EMAIL_DOMAIN e ADMIN_EMAILS', () => {
    expect(names({ ...GOOD, ALLOWED_EMAIL_DOMAIN: '@scitecjr.com' })).toEqual(['ALLOWED_EMAIL_DOMAIN']);
    expect(names({ ...GOOD, ADMIN_EMAILS: 'não-é-email' })).toEqual(['ADMIN_EMAILS']);
    const vazio = validateProductionEnv({ ...GOOD, ADMIN_EMAILS: '' });
    expect(vazio).toEqual([{ name: 'ADMIN_EMAILS', severity: 'warning', problem: expect.any(String) }]);
    const fora = validateProductionEnv({ ...GOOD, ADMIN_EMAILS: 'alguem@gmail.com' });
    expect(fora.map((i) => i.severity)).toEqual(['warning']);
  });

  it('limites mensais: inteiro positivo ou erro (não cai em silêncio no padrão)', () => {
    for (const name of ['GEMINI_MONTHLY_LIMIT', 'PLACES_MONTHLY_LIMIT', 'PAGESPEED_MONTHLY_LIMIT']) {
      expect(names({ ...GOOD, [name]: '500' })).toEqual([]);
      for (const bad of ['0', '-1', '1.5', 'mil', '1e3', '1000000000']) {
        expect(names({ ...GOOD, [name]: bad }), `${name}=${bad}`).toEqual([name]);
      }
    }
  });

  it('variável NEXT_PUBLIC_ com nome de segredo é erro (iria para o navegador)', () => {
    expect(names({ ...GOOD, NEXT_PUBLIC_GEMINI_API_KEY: 'x' })).toEqual(['NEXT_PUBLIC_GEMINI_API_KEY']);
    expect(names({ ...GOOD, NEXT_PUBLIC_APP_NAME: 'SciTec' })).toEqual([]);
  });

  it('chaves opcionais ausentes (Gemini, Places, PageSpeed) não são erro', () => {
    expect(errors(GOOD)).toEqual([]);
  });
});

describe('mensagens não vazam valores', () => {
  it('nenhum segredo aparece no texto, mesmo com tudo errado', () => {
    const env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://usuario:SENHA-DO-BANCO@host/db',
      AUTH_SECRET: 'segredo-curto-123',
      AUTH_GOOGLE_ID: 'ID-DE-CLIENTE-FAKE',
      AUTH_GOOGLE_SECRET: '',
      AUTH_URL: 'http://SEGREDO-NA-URL.exemplo',
      DEV_LOGIN: 'true',
      ADMIN_EMAILS: 'quebrado-SEGREDO',
      GEMINI_MONTHLY_LIMIT: 'VALOR-RUIM',
      NEXT_PUBLIC_API_KEY: 'CHAVE-NO-NAVEGADOR',
    };
    const text = formatEnvIssues(validateProductionEnv(env));
    for (const leak of ['SENHA-DO-BANCO', 'usuario', 'segredo-curto-123', 'ID-DE-CLIENTE-FAKE', 'SEGREDO-NA-URL', 'quebrado-SEGREDO', 'VALOR-RUIM', 'CHAVE-NO-NAVEGADOR']) {
      expect(text).not.toContain(leak);
    }
    expect(text).toContain('DATABASE_URL');
    expect(text).toContain('AUTH_SECRET');
    expect(text).toContain('DEV_LOGIN');
  });
});

describe('assertProductionEnv', () => {
  it('fora de produção não valida nada', () => {
    expect(assertProductionEnv({ NODE_ENV: 'development' })).toEqual([]);
    expect(assertProductionEnv({})).toEqual([]);
  });

  it('em produção lança EnvConfigError com a lista; com config boa devolve só avisos', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production' })).toThrow(EnvConfigError);
    try {
      assertProductionEnv({ NODE_ENV: 'production' });
    } catch (e) {
      expect((e as Error).message).toMatch(/DATABASE_URL.*AUTH_SECRET/s);
      expect((e as Error).message).toMatch(/O servidor não foi iniciado/);
    }
    expect(assertProductionEnv(GOOD)).toEqual([]);
    expect(assertProductionEnv({ ...GOOD, ADMIN_EMAILS: '' }).map((i) => i.name)).toEqual(['ADMIN_EMAILS']);
  });
});

describe('enforceProductionEnv (instrumentation)', () => {
  it('erro: registra a lista e encerra com código 1', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    enforceProductionEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(error.mock.calls[0][0])).toContain('AUTH_SECRET');
    exit.mockRestore();
    error.mockRestore();
  });

  it('ok: não encerra; avisos vão para console.warn', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    enforceProductionEnv({ ...GOOD, ADMIN_EMAILS: '' } as NodeJS.ProcessEnv);
    expect(exit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    exit.mockRestore();
    warn.mockRestore();
  });

  it('desenvolvimento: silencioso', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    enforceProductionEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(exit).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    exit.mockRestore();
    warn.mockRestore();
  });
});
