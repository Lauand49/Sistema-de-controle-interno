import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, ApiError, assert, badRequest } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canManageSectorMembers, canViewUnit } from '@/lib/permissions';
import { toUserDTO, userHierarchyInclude } from '@/lib/users';
import { getUnitByCode } from '@/lib/units';

type Params = { code: string };

/** Membros ativos da unidade (departamento ou setor). */
export const GET = withAuth<Params>(async (_req, { params, actor }) => {
  const unit = await getUnitByCode(params.code);
  assert(canViewUnit(actor, unit.code), 'Você não tem acesso a esta unidade.');

  const users = await prisma.user.findMany({
    where:
      unit.type === 'DEPARTAMENTO'
        ? { status: 'ATIVO', departmentId: unit.id }
        : { status: 'ATIVO', sectorMemberships: { some: { unitId: unit.id } } },
    include: userHierarchyInclude,
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(users.map(toUserDTO));
});

/** Adiciona um membro ativo a um setor. */
export const POST = withAuth<Params>(async (request, { params, actor }) => {
  const { userId } = z.object({ userId: z.string().min(1) }).parse(await request.json());
  const unit = await getUnitByCode(params.code);
  if (unit.type !== 'SETOR') {
    throw badRequest('Departamentos recebem membros pela aprovação/transferência, não por aqui.');
  }
  assert(canManageSectorMembers(actor, unit.code), 'Apenas a Presidência ou o Gerente deste setor adiciona membros.');

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!target || target.status !== 'ATIVO') throw badRequest('Apenas membros ativos podem entrar em setores.');

  const existing = await prisma.sectorMember.findUnique({
    where: { userId_unitId: { userId, unitId: unit.id } },
  });
  if (existing) throw new ApiError(409, 'Este membro já participa do setor.');

  await prisma.$transaction(async (tx) => {
    await tx.sectorMember.create({ data: { userId, unitId: unit.id, role: 'MEMBRO' } });
    await audit(tx, {
      actorId: actor.id,
      action: 'SECTOR_MEMBER_ADDED',
      targetUserId: userId,
      unitId: unit.id,
      after: { sector: unit.code, role: 'MEMBRO' },
    });
  });

  return NextResponse.json({ success: true }, { status: 201 });
});
