import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api';
import { prismaDashboardRepository } from '@/lib/dashboards/repository';
import { getMemberDashboard } from '@/lib/dashboards/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Painel_Membro. Permissões decididas em `lib/dashboards/service.ts`. */
export const GET = withAuth<{ userId: string }>(async (req, { params, actor }) => {
  const periodo = new URL(req.url).searchParams.get('periodo');
  const dto = await getMemberDashboard(
    prismaDashboardRepository(prisma),
    actor,
    params.userId,
    periodo,
    new Date()
  );
  return NextResponse.json(dto);
});
