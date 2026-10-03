/**
 * Cliente falso da BrasilAPI (CNPJ) por roteiro — contrato `BrasilApiHttp` do design
 * (`brasilapi.ts`): `getCnpj(cnpj, timeoutMs)` resolve `{ status, json }`; rejeita em rede/timeout.
 */
import { scriptRunner, type ScriptStep, type Sleep } from './scripted';

export interface BrasilApiHttpLike {
  getCnpj(cnpj: string, timeoutMs: number): Promise<{ status: number; json: unknown }>;
}

export interface BrasilApiCall {
  cnpj: string;
  timeoutMs: number;
}

export interface FakeBrasilApi extends BrasilApiHttpLike {
  calls: BrasilApiCall[];
  remaining(): number;
}

/** @param log recebe `brasilapi:<cnpj>` a cada chamada (com o limitador, permite medir intervalos). */
export function fakeBrasilApi(
  script: ReadonlyArray<ScriptStep<BrasilApiCall>>,
  opts: { sleep?: Sleep; log?: string[] } = {},
): FakeBrasilApi {
  const runner = scriptRunner<BrasilApiCall>('fakeBrasilApi', script, opts.sleep);
  return {
    calls: runner.calls,
    remaining: runner.remaining,
    getCnpj(cnpj, timeoutMs) {
      opts.log?.push(`brasilapi:${cnpj}`);
      return runner.run({ cnpj, timeoutMs }, timeoutMs);
    },
  };
}

/** Corpo JSON no formato da BrasilAPI, incluindo campos que o parser deve descartar (QSA, e-mail, telefone). */
export function brasilApiJson(cnpj: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cnpj,
    razao_social: 'CLINICA SORRISO LTDA',
    nome_fantasia: 'CLINICA SORRISO',
    descricao_situacao_cadastral: 'ATIVA',
    data_situacao_cadastral: '2015-03-10',
    cnae_fiscal: 8630504,
    cnae_fiscal_descricao: 'Atividade odontológica',
    porte: 'MICRO EMPRESA',
    natureza_juridica: 'Sociedade Empresária Limitada',
    opcao_pelo_mei: false,
    data_inicio_atividade: '2015-03-10',
    municipio: 'SAO PAULO',
    uf: 'SP',
    email: 'contato@example.com',
    ddd_telefone_1: '1133334444',
    qsa: [{ nome_socio: 'FULANO DE TAL', qualificacao_socio: 'Sócio-Administrador' }],
    ...over,
  };
}
