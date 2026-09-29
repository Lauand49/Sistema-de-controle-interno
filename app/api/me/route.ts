import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Usuário da sessão (inclusive PENDENTE/INATIVO, para a interface mostrar o estado). */
export const GET = withAuth(async (_req, { actor }) => NextResponse.json(actor), {
  allowInactive: true,
});
