import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, badRequest, notFound } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canManageManagers, canManageSectorMembers } from '@/lib/permissions';
import { getUnitByCode } from '@/lib/units';

type Params = { code: string; userId: string };

/** Remove um membro de um setor. Remover o Gerente do setor exige a Presidência. */
export const DELETE = withAuth<Params>(async (_req, { params, actor }) => {
  const unit = await getUnitByCode(params.code);
  if (unit.type !== 'SETOR') throw badRequest('Só é possível remover membros de setores.');
  assert(canManageSectorMembers(actor, unit.code), 'Apenas a Presidência ou o Gerente deste setor remove membros.');

  const membership = await prisma.sectorMember.findUnique({
    where: { userId_unitId: { userId: params.userId, unitId: unit.id } },
  });
  if (!membership) throw notFound('Este membro não participa do setor.');
  if (membership.role === 'GERENTE') {
    assert(canManageManagers(actor), 'Apenas a Presidência remove o Gerente do setor.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.sectorMember.delete({ where: { id: membership.id } });
    await audit(tx, {
      actorId: actor.id,
      action: 'SECTOR_MEMBER_REMOVED',
      targetUserId: params.userId,
      unitId: unit.id,
      before: { sector: unit.code, role: membership.role },
    });
  });

  return NextResponse.json({ success: true });
});
