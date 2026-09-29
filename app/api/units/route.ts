import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Departamentos e setores com gerente atual e total de membros ativos. */
export const GET = withAuth(async () => {
  const units = await prisma.unit.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    include: {
      departmentMembers: {
        where: { status: 'ATIVO' },
        select: { id: true, name: true, avatar: true, departmentRole: true },
      },
      sectorMembers: {
        where: { user: { status: 'ATIVO' } },
        select: { role: true, user: { select: { id: true, name: true, avatar: true } } },
      },
    },
  });

  return NextResponse.json(
    units.map((u) => {
      const manager =
        u.type === 'DEPARTAMENTO'
          ? u.departmentMembers.find((m) => m.departmentRole === 'GERENTE') ?? null
          : u.sectorMembers.find((m) => m.role === 'GERENTE')?.user ?? null;
      return {
        id: u.id,
        code: u.code,
        name: u.name,
        type: u.type,
        manager: manager ? { id: manager.id, name: manager.name, avatar: manager.avatar } : null,
        memberCount: u.type === 'DEPARTAMENTO' ? u.departmentMembers.length : u.sectorMembers.length,
      };
    })
  );
});
