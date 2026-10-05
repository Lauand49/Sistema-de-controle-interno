/**
 * GET /api/health — verificação de saúde do contêiner (Etapa 4).
 *
 * - Padrão (sem parâmetros): responde `{ status: 'ok' }` sem tocar no banco, na sessão nem em
 *   serviços externos. Serve para "o processo está de pé".
 * - `?deep=1`: além disso faz `SELECT 1` no banco. RESTRITO a Presidente/Vice ativos (sessão
 *   verificada no servidor): sem sessão → 401; sem o cargo → 403. A falha do banco vira 503 com
 *   mensagem genérica (nunca a URL, o usuário nem o texto do erro).
 *
 * Observação: o `middleware.ts` ainda NÃO lista `/api/health` como rota pública, então sem sessão a
 * resposta é 401 do middleware (o servidor está de pé, mas um monitor externo não vê 200). Tornar a
 * rota pública é uma linha em `isPublicPath` e depende de autorização do dono (ver HANDOFF.md).
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';
  if (!deep) return NextResponse.json({ status: 'ok' }, { headers: NO_STORE });

  // Imports dinâmicos: o caminho simples nunca carrega Prisma nem Auth.js.
  const { getActor } = await import('@/lib/api');
  const actor = await getActor().catch(() => null);
  if (!actor) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers: NO_STORE });
  const { isGlobal } = await import('@/lib/permissions');
  if (!isGlobal(actor)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403, headers: NO_STORE });

  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'ok' }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unavailable' }, { status: 503, headers: NO_STORE });
  }
}
