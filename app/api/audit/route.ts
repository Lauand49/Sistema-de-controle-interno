import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth, assert } from '@/lib/api';
import { canViewAudit, isDepartmentManager, isGlobal, managedSectors } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * Log de auditoria de cargos/vínculos.
 * Presidência: tudo. Gerente de Departamento: seu departamento e seus membros.
 * Gerente de Setor: seus setores. ?userId= e ?unit= filtram; ?limit= (máx. 200).
 */
export const GET = withAuth(async (request, { actor }) => {
  assert(canViewAudit(actor), 'Você não tem acesso à auditoria.');
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const unit = searchParams.get('unit')?.toUpperCase();
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);

  const and: Prisma.AuditLogWhereInput[] = [];
  if (!isGlobal(actor)) {
    const or: Prisma.AuditLogWhereInput[] = [];
    const units = [...managedSectors(actor)] as string[];
    if (isDepartmentManager(actor) && actor.departmentCode) {
      units.push(actor.departmentCode);
      or.push({ targetUser: { department: { code: actor.departmentCode } } });
    }
    if (units.length > 0) or.push({ unit: { code: { in: units } } });
    and.push({ OR: or });
  }
  if (userId) and.push({ targetUserId: userId });
  if (unit) and.push({ unit: { code: unit } });

  const logs = await prisma.auditLog.findMany({
    where: { AND: and },
    include: {
      actor: { select: { id: true, name: true, avatar: true } },
      targetUser: { select: { id: true, name: true, avatar: true } },
      unit: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return NextResponse.json(logs);
});
