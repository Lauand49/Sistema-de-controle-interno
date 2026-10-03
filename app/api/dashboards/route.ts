import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api';
import { prismaDashboardRepository } from '@/lib/dashboards/repository';
import { getHub } from '@/lib/dashboards/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tela_Hub: painéis de Unidade e de Membro que o ator pode abrir. */
export const GET = withAuth(async (_req, { actor }) => {
  const dto = await getHub(prismaDashboardRepository(prisma), actor);
  return NextResponse.json(dto);
});
