/**
 * Validação das variáveis de ambiente de PRODUÇÃO (Etapa 4, D2).
 *
 * Roda uma vez na inicialização do servidor (`instrumentation.ts`), só quando o app está em produção
 * (`NODE_ENV=production`) ou dentro do Cloud Run (`K_SERVICE` definida). Se algo obrigatório falta ou
 * é perigoso, o processo NÃO sobe e o log diz o que corrigir.
 *
 * REGRA DE OURO: as mensagens citam só o NOME da variável e o problema. Nunca imprimem valores
 * (nem parciais, nem o comprimento exato de segredos), para não vazar segredo em log.
 *
 * Função pura e isomórfica: nenhuma leitura de `process.env` fora do argumento `env`.
 */

export type EnvSeverity = 'error' | 'warning';

export interface EnvIssue {
  name: string;
  severity: EnvSeverity;
  /** Texto para humanos, sem valores. */
  problem: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Comprimento mínimo recomendado pela documentação do Auth.js para o AUTH_SECRET. */
export const AUTH_SECRET_MIN_LENGTH = 32;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const SECRET_NAME_RE = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE)/i;
const LIMIT_VARS = ['GEMINI_MONTHLY_LIMIT', 'PLACES_MONTHLY_LIMIT', 'PAGESPEED_MONTHLY_LIMIT'] as const;

const filled = (v: string | undefined): v is string => typeof v === 'string' && v.trim() !== '';

/** O app está em produção (ou num Cloud Run, que sempre define `K_SERVICE`)? */
export function isProductionRuntime(env: Env): boolean {
  return env.NODE_ENV === 'production' || filled(env.K_SERVICE);
}

/** Lista todos os problemas encontrados (vazia = configuração ok). Não lança e não imprime nada. */
export function validateProductionEnv(env: Env): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const add = (name: string, severity: EnvSeverity, problem: string) => issues.push({ name, severity, problem });

  // NODE_ENV: o Cloud Run não o define sozinho; sem "production" o login de desenvolvimento poderia ligar.
  if (env.NODE_ENV !== 'production') {
    add('NODE_ENV', 'error', 'deve ser "production" quando o app roda no Cloud Run (a imagem já define; não sobrescreva).');
  }

  // DEV_LOGIN nunca em produção (auth.config.ts já exige NODE_ENV=development; aqui é defesa extra).
  if (filled(env.DEV_LOGIN) && env.DEV_LOGIN.trim().toLowerCase() === 'true') {
    add('DEV_LOGIN', 'error', 'login de desenvolvimento não pode estar ligado em produção; remova a variável.');
  }

  // Banco
  if (!filled(env.DATABASE_URL)) {
    add('DATABASE_URL', 'error', 'ausente. Informe a URL do Postgres (Neon) via Secret Manager.');
  } else {
    let url: URL | null = null;
    try {
      url = new URL(env.DATABASE_URL.trim());
    } catch {
      /* tratado abaixo */
    }
    if (!url || (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:')) {
      add('DATABASE_URL', 'error', 'não é uma URL postgresql:// válida.');
    } else {
      if (url.pathname.replace(/^\/+/, '') === '') add('DATABASE_URL', 'error', 'não contém o nome do banco.');
      const host = url.hostname.toLowerCase();
      const ssl = url.searchParams.get('sslmode');
      if (!LOCAL_HOSTS.has(host) && (ssl === null || ssl === 'disable' || ssl === 'allow' || ssl === 'prefer')) {
        add('DATABASE_URL', 'warning', 'host remoto sem sslmode=require; o Neon exige conexão TLS.');
      }
    }
  }

  // Auth.js
  if (!filled(env.AUTH_SECRET)) {
    add('AUTH_SECRET', 'error', 'ausente. O Auth.js não funciona em produção sem ele (gere com: openssl rand -base64 33).');
  } else if (env.AUTH_SECRET.trim().length < AUTH_SECRET_MIN_LENGTH) {
    add('AUTH_SECRET', 'error', `curto demais; use pelo menos ${AUTH_SECRET_MIN_LENGTH} caracteres aleatórios.`);
  }
  if (!filled(env.AUTH_GOOGLE_ID)) {
    add('AUTH_GOOGLE_ID', 'error', 'ausente. Sem o login do Google ninguém consegue entrar em produção.');
  } else if (!env.AUTH_GOOGLE_ID.trim().endsWith('.apps.googleusercontent.com')) {
    add('AUTH_GOOGLE_ID', 'warning', 'não termina em ".apps.googleusercontent.com"; confira se é o ID do cliente OAuth.');
  }
  if (!filled(env.AUTH_GOOGLE_SECRET)) {
    add('AUTH_GOOGLE_SECRET', 'error', 'ausente. Informe o segredo do cliente OAuth via Secret Manager.');
  }
  if (filled(env.AUTH_URL)) {
    let ok = false;
    try {
      ok = new URL(env.AUTH_URL.trim()).protocol === 'https:';
    } catch {
      /* inválida */
    }
    if (!ok) add('AUTH_URL', 'error', 'se definida, deve ser uma URL https:// completa (ex.: https://sistema.scitecjr.com).');
  }

  // Domínio e administradores
  const domain = filled(env.ALLOWED_EMAIL_DOMAIN) ? env.ALLOWED_EMAIL_DOMAIN.trim().toLowerCase() : 'scitecjr.com';
  if (filled(env.ALLOWED_EMAIL_DOMAIN) && !DOMAIN_RE.test(domain)) {
    add('ALLOWED_EMAIL_DOMAIN', 'error', 'deve ser só o domínio, sem "@" nem espaços (ex.: scitecjr.com).');
  }
  if (!filled(env.ADMIN_EMAILS)) {
    add('ADMIN_EMAILS', 'warning', 'vazio: ninguém entra como Presidente automaticamente (necessário no primeiro acesso).');
  } else {
    const list = env.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (list.some((e) => !EMAIL_RE.test(e))) {
      add('ADMIN_EMAILS', 'error', 'contém item que não é um e-mail; separe os endereços por vírgula.');
    } else if (list.some((e) => !e.endsWith(`@${domain}`))) {
      add('ADMIN_EMAILS', 'warning', `contém e-mail fora do domínio @${domain}; essa pessoa não conseguirá entrar.`);
    }
  }

  // Limites mensais: definido e inválido não pode cair em silêncio no padrão (gasto imprevisto).
  for (const name of LIMIT_VARS) {
    const v = env[name];
    if (filled(v) && !/^[1-9]\d{0,8}$/.test(v.trim())) {
      add(name, 'error', 'se definida, deve ser um inteiro positivo (sem espaços nem pontos).');
    }
  }

  // Nenhuma chave pode ir para o navegador: variáveis NEXT_PUBLIC_* são embutidas no JavaScript do cliente.
  for (const name of Object.keys(env)) {
    if (name.startsWith('NEXT_PUBLIC_') && SECRET_NAME_RE.test(name)) {
      add(name, 'error', 'variável NEXT_PUBLIC_ com nome de segredo: iria para o navegador. Renomeie e use só no servidor.');
    }
  }

  return issues;
}

export class EnvConfigError extends Error {
  readonly issues: readonly EnvIssue[];
  constructor(issues: readonly EnvIssue[]) {
    super(formatEnvIssues(issues));
    this.name = 'EnvConfigError';
    this.issues = issues;
  }
}

/** Texto para o log: um item por linha, erros primeiro; sem valores. */
export function formatEnvIssues(issues: readonly EnvIssue[]): string {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`Configuração de produção inválida: ${errors.length} erro(s). O servidor não foi iniciado.`);
    for (const i of errors) lines.push(`  - ERRO   ${i.name}: ${i.problem}`);
  }
  for (const i of warnings) lines.push(`  - AVISO  ${i.name}: ${i.problem}`);
  if (errors.length > 0) lines.push('Veja docs/DEPLOY-VARIAVEIS.md para o significado de cada variável.');
  return lines.join('\n');
}

/**
 * Valida e lança `EnvConfigError` se houver qualquer erro. Fora de produção não faz nada.
 * Devolve os avisos (não fatais) para o chamador registrar.
 */
export function assertProductionEnv(env: Env): EnvIssue[] {
  if (!isProductionRuntime(env)) return [];
  const issues = validateProductionEnv(env);
  if (issues.some((i) => i.severity === 'error')) throw new EnvConfigError(issues);
  return issues;
}
