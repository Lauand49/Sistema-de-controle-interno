/**
 * GET /api/tools/lead-miner/config — Configuração visível ao cliente (Req. 2.6, 7.5).
 * Informa se a IA está disponível e o estado/uso do mês dos Servicos_Externos; nunca expõe chaves.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { getServicesStatus, isAiAvailable } from '@/lib/leads/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, { actor }) => {
  requireNegocios(actor);
  const services = await getServicesStatus();
  return NextResponse.json({ iaAvailable: isAiAvailable(), services });
});
