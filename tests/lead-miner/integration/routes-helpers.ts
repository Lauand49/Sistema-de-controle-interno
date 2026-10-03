/**
 * Apoio dos testes de integração das rotas (`routes.int.test.ts`).
 *
 * - `sessionStore`: sessão simulada por requisição (AsyncLocalStorage), para que chamadas
 *   concorrentes com atores diferentes não compartilhem estado global.
 * - `auditFault`: injeção de falha na N-ésima chamada de `audit` (testes de rollback).
 * - `fakePipelineDeps`: dependências do pipeline sem rede; qualquer acesso externo lança.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';
import type { PipelineDeps } from '@/lib/leads/pipeline';

export const sessionStore = new AsyncLocalStorage<string | null>();

export const auditFault = {
  /** 0 = desligado; N = a N-ésima chamada (contada desde `arm`) lança. */
  failAt: 0,
  calls: 0,
  arm(n: number) {
    this.failAt = n;
    this.calls = 0;
  },
  disarm() {
    this.failAt = 0;
    this.calls = 0;
  },
};

export const SIMULATED_FAILURE = 'falha simulada de gravação';

export function fakePipelineDeps(db: PrismaClient): PipelineDeps {
  const noNetwork = () => {
    throw new Error('rede proibida nos testes de rotas');
  };
  return {
    db,
    osm: { http: { getJson: noNetwork }, limiter: { acquire: noNetwork }, sleep: async () => undefined } as never,
    site: { resolver: { resolveAll: async () => noNetwork() }, transport: { request: noNetwork }, now: () => Date.now() } as never,
    ai: { client: null, usage: {} as never, limit: 0, now: () => new Date() },
    google: { http: null, usage: {} as never, limit: 0, now: () => new Date(), sleep: async () => undefined },
    pagespeed: { http: { run: noNetwork }, usage: {} as never, limit: 0, now: () => new Date(), hasKey: false },
    cnpj: { http: { getCnpj: noNetwork }, limiter: { schedule: noNetwork }, sleep: async () => undefined, now: () => new Date() } as never,
    now: () => Date.now(),
    newToken: () => crypto.randomUUID(),
  };
}

type AnyHandler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;

export interface CallResult {
  status: number;
  body: any;
}

/** Invoca um handler de rota como o usuário `userId` (`null` = sem sessão). */
export async function call(
  userId: string | null,
  handler: unknown,
  opts: { method?: string; path?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<CallResult> {
  const method = opts.method ?? 'GET';
  const init: RequestInit = { method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const req = new Request(`http://localhost${opts.path ?? '/api/tools/lead-miner'}`, init);
  const res = await sessionStore.run(userId, () =>
    (handler as AnyHandler)(req, { params: opts.params ?? {} }),
  );
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* corpo não-JSON (CSV) */
  }
  return { status: res.status, body };
}
