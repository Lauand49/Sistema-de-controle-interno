import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, ApiError, assert, badRequest } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canManageManagers } from '@/lib/permissions';
import { getUnitByCode } from '@/lib/units';

type Params = { code: string };

async function currentManager(unit: { id: string; type: string }) {
  if (unit.type === 'DEPARTAMENTO') {
    return prisma.user.findFirst({
      where: { departmentId: unit.id, departmentRole: 'GERENTE' },
      select: { id: true, name: true },
    });
  }
  const m = await prisma.sectorMember.findFirst({
    where: { unitId: unit.id, role: 'GERENTE' },
    select: { user: { select: { id: true, name: true } } },
  });
  return m?.user ?? null;
}

/**
 * Nomeia o Gerente da unidade. Se já houver um, exige `confirmReplace: true`
 * (senão responde 409 com o gerente atual) e rebaixa o anterior a Assessor/Membro.
 */
export const PUT = withAuth<Params>(async (request, { params, actor }) => {
  assert(canManageManagers(actor), 'Apenas a Presidência nomeia gerentes.');
  const { userId, confirmReplace } = z
    .object({ userId: z.string().min(1), confirmReplace: z.boolean().optional() })
    .parse(await request.json());

  const unit = await getUnitByCode(params.code);
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, globalRole: true, departmentId: true },
  });
  if (!target || target.status !== 'ATIVO') throw badRequest('Apenas membros ativos podem ser gerentes.');
  if (target.globalRole) throw badRequest('Presidente e Vice não ocupam gerências.');
  if (unit.type === 'DEPARTAMENTO' && target.departmentId !== unit.id) {
    throw badRequest('O Gerente de Departamento precisa pertencer ao departamento.');
  }

  const previous = await currentManager(unit);
  if (previous?.id === target.id) throw badRequest('Este membro já é o gerente desta unidade.');
  if (previous && !confirmReplace) {
    throw new ApiError(409, `${previous.name} já é gerente desta unidade. Confirme para substituir.`, {
      requiresConfirmation: true,
      currentManager: previous,
    });
  }

  await prisma.$transaction(async (tx) => {
    if (unit.type === 'DEPARTAMENTO') {
      if (previous) {
        await tx.user.update({ where: { id: previous.id }, data: { departmentRole: 'ASSESSOR' } });
      }
      await tx.user.update({ where: { id: target.id }, data: { departmentRole: 'GERENTE' } });
    } else {
      if (previous) {
        await tx.sectorMember.update({
          where: { userId_unitId: { userId: previous.id, unitId: unit.id } },
          data: { role: 'MEMBRO' },
        });
      }
      await tx.sectorMember.upsert({
        where: { userId_unitId: { userId: target.id, unitId: unit.id } },
        create: { userId: target.id, unitId: unit.id, role: 'GERENTE' },
        update: { role: 'GERENTE' },
      });
    }

    if (previous) {
      await audit(tx, {
        actorId: actor.id,
        action: 'MANAGER_DEMOTED',
        targetUserId: previous.id,
        unitId: unit.id,
        before: { unit: unit.code, role: 'GERENTE' },
        after: { unit: unit.code, role: unit.type === 'DEPARTAMENTO' ? 'ASSESSOR' : 'MEMBRO', replacedBy: target.id },
      });
    }
    await audit(tx, {
      actorId: actor.id,
      action: 'MANAGER_APPOINTED',
      targetUserId: target.id,
      unitId: unit.id,
      before: previous ? { unit: unit.code, previousManager: previous.id } : null,
      after: { unit: unit.code, role: 'GERENTE' },
    });
  });

  return NextResponse.json({ success: true, replaced: previous ?? null });
});

/** Remove o Gerente atual (vira Assessor/Membro). */
export const DELETE = withAuth<Params>(async (_req, { params, actor }) => {
  assert(canManageManagers(actor), 'Apenas a Presidência remove gerentes.');
  const unit = await getUnitByCode(params.code);
  const previous = await currentManager(unit);
  if (!previous) throw badRequest('Esta unidade não tem gerente.');

  await prisma.$transaction(async (tx) => {
    if (unit.type === 'DEPARTAMENTO') {
      await tx.user.update({ where: { id: previous.id }, data: { departmentRole: 'ASSESSOR' } });
    } else {
      await tx.sectorMember.update({
        where: { userId_unitId: { userId: previous.id, unitId: unit.id } },
        data: { role: 'MEMBRO' },
      });
    }
    await audit(tx, {
      actorId: actor.id,
      action: 'MANAGER_REMOVED',
      targetUserId: previous.id,
      unitId: unit.id,
      before: { unit: unit.code, role: 'GERENTE' },
      after: { unit: unit.code, role: unit.type === 'DEPARTAMENTO' ? 'ASSESSOR' : 'MEMBRO' },
    });
  });

  return NextResponse.json({ success: true });
});
