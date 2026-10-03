/**
 * Apoio dos testes de integração dos painéis (`dashboards.int.test.ts`).
 *
 * - `sessionStore`: sessão simulada por requisição (AsyncLocalStorage), lida pelo `@/auth`
 *   mockado; o `withAuth` real carrega o ator do banco a partir desse id.
 * - `call`: invoca um handler de rota do App Router como um usuário (`null` = sem sessão).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export const sessionStore = new AsyncLocalStorage<string | null>();

type AnyHandler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;

export interface CallResult {
  status: number;
  body: any;
}

export async function call(
  userId: string | null,
  handler: unknown,
  opts: { method?: string; path?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<CallResult> {
  const method = opts.method ?? 'GET';
  const init: RequestInit = { method };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const req = new Request(`http://localhost${opts.path ?? '/api/dashboards'}`, init);
  const res = await sessionStore.run(userId, () =>
    (handler as AnyHandler)(req, { params: opts.params ?? {} })
  );
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* corpo não-JSON */
  }
  return { status: res.status, body };
}
