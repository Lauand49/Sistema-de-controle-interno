/**
 * Utilitários das rotas de API: sessão obrigatória, carregamento do ator a partir do
 * banco em toda requisição e tratamento padronizado de erros.
 */
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { auth } from '@/auth';
import { findUserDTO } from '@/lib/users';
import type { User as Actor } from '@/types';

export type { Actor };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new ApiError(403, message);
export const notFound = (message = 'Registro não encontrado.') => new ApiError(404, message);
export const badRequest = (message: string) => new ApiError(400, message);

/** Lança 403 se a condição for falsa. */
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw forbidden(message);
}

/** Usuário da sessão atual, lido do banco (status e cargos sempre atualizados). */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;
  return findUserDTO(uid);
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.errors[0]?.message || 'Dados inválidos.', details: error.errors },
      { status: 400 }
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
    }
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Registro duplicado ou conflito de unicidade.' }, { status: 409 });
    }
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }
  console.error('[api] erro inesperado:', error);
  return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
}

type RouteContext<P> = { params: P };
type Handler<P> = (req: Request, ctx: { params: P; actor: Actor }) => Promise<Response>;

/**
 * Envolve uma rota exigindo sessão e conta ATIVA.
 * `allowInactive` permite que PENDENTE acesse (ex.: /api/me).
 */
export function withAuth<P = Record<string, never>>(
  handler: Handler<P>,
  opts: { allowInactive?: boolean } = {}
) {
  return async (req: Request, ctx: RouteContext<P>) => {
    try {
      const actor = await getActor();
      if (!actor) throw new ApiError(401, 'Não autenticado.');
      if (actor.status !== 'ATIVO' && !opts.allowInactive) {
        throw new ApiError(
          403,
          actor.status === 'PENDENTE'
            ? 'Sua conta aguarda aprovação de um gerente.'
            : 'Sua conta está desativada.'
        );
      }
      return await handler(req, { params: ctx?.params, actor });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
