/**
 * Acesso a usuários no servidor: include padrão da hierarquia, conversão para DTO
 * e sincronização no login (bootstrap de ADMIN_EMAILS).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import {
  type DepartmentCode,
  type SectorCode,
  isDepartmentCode,
  isSectorCode,
  personTitle,
  personType,
} from '@/lib/permissions';
import type { User as UserDTO } from '@/types';

export const userHierarchyInclude = {
  department: { select: { code: true, name: true } },
  sectorMemberships: {
    select: { role: true, unit: { select: { code: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.UserInclude;

export type UserWithHierarchy = Prisma.UserGetPayload<{ include: typeof userHierarchyInclude }>;

export function toUserDTO(
  u: UserWithHierarchy & { _count?: UserDTO['_count'] }
): UserDTO {
  const departmentCode = isDepartmentCode(u.department?.code)
    ? (u.department!.code as DepartmentCode)
    : null;
  const sectors = u.sectorMemberships
    .filter((m) => isSectorCode(m.unit.code))
    .map((m) => ({ code: m.unit.code as SectorCode, name: m.unit.name, role: m.role }));

  const person = {
    id: u.id,
    status: u.status,
    globalRole: u.globalRole,
    departmentCode,
    departmentRole: u.departmentRole,
    sectors,
  };

  return {
    ...person,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    cargo: u.cargo,
    personType: personType(person),
    title: personTitle({ ...person, cargo: u.cargo }),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    ...(u._count ? { _count: u._count } : {}),
  };
}

export async function findUserDTO(id: string): Promise<UserDTO | null> {
  const u = await prisma.user.findUnique({ where: { id }, include: userHierarchyInclude });
  return u ? toUserDTO(u) : null;
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.trim().toLowerCase());
}

function defaultAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
    name
  )}&backgroundColor=7c3aed,4f46e5,6366f1&textColor=ffffff`;
}

/**
 * Chamado no primeiro login de cada sessão.
 * - Novo usuário → PENDENTE (ou Presidente/ATIVO se estiver em ADMIN_EMAILS).
 * - Usuário existente em ADMIN_EMAILS → garante Presidente/ATIVO (bootstrap).
 */
export async function syncUserOnLogin(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const isAdmin = isAdminEmail(email);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });

    if (!existing) {
      const name = input.name?.trim() || email.split('@')[0];
      const created = await tx.user.create({
        data: {
          email,
          name,
          avatar: input.image || defaultAvatar(name),
          status: isAdmin ? 'ATIVO' : 'PENDENTE',
          globalRole: isAdmin ? 'PRESIDENTE' : null,
          lastLoginAt: now,
        },
      });
      await audit(tx, {
        actorId: created.id,
        action: isAdmin ? 'BOOTSTRAP_ADMIN' : 'USER_REGISTERED',
        targetUserId: created.id,
        after: { status: created.status, globalRole: created.globalRole },
      });
      return created;
    }

    const data: Prisma.UserUpdateInput = { lastLoginAt: now };
    if (input.image && !existing.avatar) data.avatar = input.image;

    const needsBootstrap =
      isAdmin && (existing.globalRole !== 'PRESIDENTE' || existing.status !== 'ATIVO');
    if (needsBootstrap) {
      data.globalRole = 'PRESIDENTE';
      data.status = 'ATIVO';
      data.department = { disconnect: true };
      data.departmentRole = null;
    }

    const updated = await tx.user.update({ where: { id: existing.id }, data });

    if (needsBootstrap) {
      await audit(tx, {
        actorId: existing.id,
        action: 'BOOTSTRAP_ADMIN',
        targetUserId: existing.id,
        before: {
          status: existing.status,
          globalRole: existing.globalRole,
          departmentId: existing.departmentId,
          departmentRole: existing.departmentRole,
        },
        after: { status: 'ATIVO', globalRole: 'PRESIDENTE', departmentId: null, departmentRole: null },
      });
    }
    return updated;
  });
}
