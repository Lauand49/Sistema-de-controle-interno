/**
 * Helpers comuns das rotas `/api/tools/lead-miner/**`: checagem de permissão e validação de
 * query/corpo com zod (Req. 18.1, 18.3, 18.5, 18.6, 18.11).
 *
 * Importa só `lib/api-error.ts` (sem Next/auth) para ser testável fora do runtime do Next.
 * Os erros lançados aqui são serializados por `errorResponse` de `lib/api.ts`, que espalha
 * `extra` no corpo (`{ error, fields }`).
 */
import type { z } from 'zod';
import { ApiError, forbidden } from '@/lib/api-error';
import { canUseNegociosTools, type Person } from '@/lib/permissions';
import { searchParamsToObject, zodFieldErrors } from './filters';

export const NEGOCIOS_ONLY_MESSAGE = 'O Minerador de Leads é exclusivo de Negócios e da Presidência.';
export const INVALID_BODY_MESSAGE = 'Corpo da requisição inválido.';
export const INVALID_PARAMS_MESSAGE = 'Parâmetros inválidos.';

/**
 * Lança 403 se o ator não pode usar as ferramentas de Negócios. Deve ser a primeira instrução
 * do handler, antes de qualquer leitura ou escrita (Req. 18.1, 18.3, 18.11).
 */
export function requireNegocios(actor: Person | null | undefined): asserts actor is Person {
  if (!canUseNegociosTools(actor)) throw forbidden(NEGOCIOS_ONLY_MESSAGE);
}

/** 400 `{ error, fields }`; `error` é a mensagem do primeiro campo inválido (Req. 18.6). */
function validationError(error: z.ZodError): ApiError {
  const fields = zodFieldErrors(error);
  const first = Object.values(fields)[0];
  return new ApiError(400, first ?? INVALID_PARAMS_MESSAGE, { fields });
}

/** Valida um valor já extraído; lança 400 com `fields` se inválido. */
export function parseWith<O>(schema: z.ZodType<O, z.ZodTypeDef, unknown>, raw: unknown): O {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

/** Valida a query string (`Request.url`, `URL`, string de URL ou `URLSearchParams`). */
export function parseQuery<O>(
  schema: z.ZodType<O, z.ZodTypeDef, unknown>,
  source: string | URL | URLSearchParams,
): O {
  const params =
    source instanceof URLSearchParams
      ? source
      : (source instanceof URL ? source : new URL(source)).searchParams;
  return parseWith(schema, searchParamsToObject(params));
}

/** Lê o corpo JSON e valida; corpo ausente ou JSON inválido → 400. */
export async function parseBody<O>(
  schema: z.ZodType<O, z.ZodTypeDef, unknown>,
  req: Request,
): Promise<O> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, INVALID_BODY_MESSAGE, { fields: { _: INVALID_BODY_MESSAGE } });
  }
  return parseWith(schema, raw);
}
