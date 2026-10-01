import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api';
import { prismaDashboardRepository } from '@/lib/dashboards/repository';
import { getUnitDashboard } from '@/lib/dashboards/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Painel_Departamento / Painel_Setor. Permissões decididas em `lib/dashboards/service.ts`. */
export const GET = withAuth<{ code: string }>(async (req, { params, actor }) => {
  const periodo = new URL(req.url).searchParams.get('periodo');
  const dto = await getUnitDashboard(
    prismaDashboardRepository(prisma),
    actor,
    params.code,
    periodo,
    new Date()
  );
  return NextResponse.json(dto);
});
