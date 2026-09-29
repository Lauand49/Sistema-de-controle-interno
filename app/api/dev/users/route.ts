import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DEV_LOGIN_ENABLED } from '@/auth.config';
import { toUserDTO, userHierarchyInclude } from '@/lib/users';

export const dynamic = 'force-dynamic';

/**
 * Lista de contas para o seletor do login de desenvolvimento.
 * Só existe com NODE_ENV=development e DEV_LOGIN=true; caso contrário responde 404.
 */
export async function GET() {
  if (!DEV_LOGIN_ENABLED) {
    return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 });
  }
  const users = await prisma.user.findMany({
    include: userHierarchyInclude,
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json(
    users.map(toUserDTO).map((u) => ({
      email: u.email,
      name: u.name,
      title: u.title,
      status: u.status,
      avatar: u.avatar,
    }))
  );
}
