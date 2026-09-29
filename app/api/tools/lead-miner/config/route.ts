/**
 * GET /api/tools/lead-miner/config — Configuração visível ao cliente (Req. 7.5).
 * Só informa se a IA está disponível; nunca expõe a chave.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { isAiAvailable } from '@/lib/leads/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, { actor }) => {
  requireNegocios(actor);
  return NextResponse.json({ iaAvailable: isAiAvailable() });
});
