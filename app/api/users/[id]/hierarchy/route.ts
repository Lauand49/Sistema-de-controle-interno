import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, badRequest, notFound } from '@/lib/api';
import { audit } from '@/lib/audit';
import {
  DEPARTMENT_CODES,
  canApproveUserInto,
  canChangeDepartment,
  canDeactivate,
  canManageVice,
} from '@/lib/permissions';
import { findUserDTO } from '@/lib/users';
import { getUnitByCode } from '@/lib/units';

type Params = { id: string };

const dept = z.enum(DEPARTMENT_CODES as [string, ...string[]], {
  errorMap: () => ({ message: 'Departamento inválido.' }),
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APPROVE'), departmentCode: dept }),
  z.object({ action: z.literal('SET_DEPARTMENT'), departmentCode: dept }),
  z.object({ action: z.literal('SET_VICE') }),
  z.object({ action: z.literal('REMOVE_VICE'), departmentCode: dept }),
  z.object({ action: z.literal('DEACTIVATE') }),
  z.object({ action: z.literal('REACTIVATE'), departmentCode: dept.optional() }),
]);

/** Retrato do vínculo para o AuditLog (antes/depois). */
function snapshot(u: NonNullable<Awaited<ReturnType<typeof findUserDTO>>>) {
  return {
    status: u.status,
    globalRole: u.globalRole,
    departmentCode: u.departmentCode,
    departmentRole: u.departmentRole,
    sectors: u.sectors.map((s) => ({ code: s.code, role: s.role })),
  };
}

/**
 * Mudanças de vínculo/cargo de um usuário. Cada ação verifica a matriz (lib/permissions)
 * e grava AuditLog na mesma transação.
 * Gerentes de departamento/setor: ver /api/units/[code]/manager.
 */
export const POST = withAuth<Params>(async (request, { params, actor }) => {
  const input = actionSchema.parse(await request.json());
  const target = await findUserDTO(params.id);
  if (!target) throw notFound('Membro não encontrado.');
  const before = snapshot(target);

  await prisma.$transaction(async (tx) => {
    switch (input.action) {
      case 'APPROVE': {
        if (target.status !== 'PENDENTE') throw badRequest('Este usuário não está pendente.');
        assert(canApproveUserInto(actor, input.departmentCode), 'Você só pode aprovar pessoas para o seu departamento.');
        const unit = await getUnitByCode(input.departmentCode);
        await tx.user.update({
          where: { id: target.id },
          data: { status: 'ATIVO', departmentId: unit.id, departmentRole: 'ASSESSOR' },
        });
        await audit(tx, { actorId: actor.id, action: 'USER_APPROVED', targetUserId: target.id, unitId: unit.id, before, after: { status: 'ATIVO', departmentCode: unit.code, departmentRole: 'ASSESSOR' } });
        break;
      }

      case 'SET_DEPARTMENT': {
        assert(canChangeDepartment(actor), 'Apenas a Presidência transfere membros de departamento.');
        if (target.status !== 'ATIVO' || target.globalRole) {
          throw badRequest('Apenas membros ativos fora da Presidência têm departamento.');
        }
        if (target.departmentCode === input.departmentCode) throw badRequest('O membro já está neste departamento.');
        const unit = await getUnitByCode(input.departmentCode);
        // Quem troca de departamento entra como Assessor (a gerência anterior fica vaga).
        await tx.user.update({
          where: { id: target.id },
          data: { departmentId: unit.id, departmentRole: 'ASSESSOR' },
        });
        await audit(tx, { actorId: actor.id, action: 'DEPARTMENT_CHANGED', targetUserId: target.id, unitId: unit.id, before, after: { departmentCode: unit.code, departmentRole: 'ASSESSOR' } });
        break;
      }

      case 'SET_VICE': {
        assert(canManageVice(actor), 'Apenas o Presidente nomeia a Vice-presidência.');
        if (target.status !== 'ATIVO') throw badRequest('Apenas membros ativos podem ser nomeados.');
        if (target.globalRole) throw badRequest('Este membro já faz parte da Presidência.');
        // Presidência não tem departamento; gerências de setor passam a Membro.
        await tx.user.update({
          where: { id: target.id },
          data: { globalRole: 'VICE_PRESIDENTE', departmentId: null, departmentRole: null },
        });
        await tx.sectorMember.updateMany({ where: { userId: target.id, role: 'GERENTE' }, data: { role: 'MEMBRO' } });
        await audit(tx, { actorId: actor.id, action: 'VICE_APPOINTED', targetUserId: target.id, before, after: { globalRole: 'VICE_PRESIDENTE', departmentCode: null } });
        break;
      }

      case 'REMOVE_VICE': {
        assert(canManageVice(actor), 'Apenas o Presidente remove a Vice-presidência.');
        if (target.globalRole !== 'VICE_PRESIDENTE') throw badRequest('Este membro não é Vice-presidente.');
        const unit = await getUnitByCode(input.departmentCode);
        await tx.user.update({
          where: { id: target.id },
          data: { globalRole: null, departmentId: unit.id, departmentRole: 'ASSESSOR' },
        });
        await audit(tx, { actorId: actor.id, action: 'VICE_REMOVED', targetUserId: target.id, unitId: unit.id, before, after: { globalRole: null, departmentCode: unit.code, departmentRole: 'ASSESSOR' } });
        break;
      }

      case 'DEACTIVATE': {
        assert(canDeactivate(actor, target), 'Você não pode desativar esta conta.');
        if (target.status === 'INATIVO') throw badRequest('A conta já está desativada.');
        // Desativação libera cargos (os índices únicos de gerência ficam livres).
        await tx.user.update({
          where: { id: target.id },
          data: {
            status: 'INATIVO',
            globalRole: null,
            departmentRole: target.departmentCode ? 'ASSESSOR' : null,
          },
        });
        await tx.sectorMember.updateMany({ where: { userId: target.id, role: 'GERENTE' }, data: { role: 'MEMBRO' } });
        await audit(tx, { actorId: actor.id, action: 'USER_DEACTIVATED', targetUserId: target.id, before, after: { status: 'INATIVO' } });
        break;
      }

      case 'REACTIVATE': {
        if (target.status !== 'INATIVO') throw badRequest('A conta não está desativada.');
        const departmentCode = input.departmentCode || target.departmentCode;
        if (!departmentCode) throw badRequest('Informe o departamento para reativar a conta.');
        assert(
          canApproveUserInto(actor, departmentCode) &&
          (departmentCode === target.departmentCode
            ? canDeactivate(actor, target)
            : canChangeDepartment(actor)),
          'Você não pode reativar esta conta neste departamento.'
        );
        const unit = await getUnitByCode(departmentCode);
        await tx.user.update({
          where: { id: target.id },
          data: { status: 'ATIVO', departmentId: unit.id, departmentRole: 'ASSESSOR' },
        });
        await audit(tx, { actorId: actor.id, action: 'USER_REACTIVATED', targetUserId: target.id, unitId: unit.id, before, after: { status: 'ATIVO', departmentCode: unit.code } });
        break;
      }
    }
  });

  const updated = await findUserDTO(target.id);

  // Pendências que o gerente precisa redistribuir após a desativação.
  let pendingWork: { cards: number; tasks: number; leads: number } | undefined;
  if (input.action === 'DEACTIVATE') {
    const [cards, tasks, leads] = await Promise.all([
      prisma.card.count({ where: { assigneeId: target.id, phase: { isFinal: false } } }),
      prisma.task.count({ where: { assigneeId: target.id, status: { in: ['TODO', 'IN_PROGRESS'] } } }),
      prisma.prospectLead.count({ where: { assignedTo: target.id, status: { notIn: ['CONVERTED_TO_PIPE', 'DISCARDED'] } } }),
    ]);
    pendingWork = { cards, tasks, leads };
  }

  return NextResponse.json({ user: updated, pendingWork });
});
