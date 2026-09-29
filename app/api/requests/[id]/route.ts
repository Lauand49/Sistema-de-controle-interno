import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, badRequest, notFound } from '@/lib/api';
import {
  canDeleteRequest,
  canEditRequestContent,
  canHandleRequest,
  canViewRequest,
} from '@/lib/permissions';
import { assertActiveUser } from '@/lib/units';

type Params = { id: string };

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

async function loadRequest(id: string) {
  const r = await prisma.crossDeptRequest.findUnique({ where: { id } });
  if (!r) throw notFound('Solicitação não encontrada.');
  return r;
}

export const PATCH = withAuth<Params>(async (request, { params, actor }) => {
  const body = await request.json();
  const { status, handlerId, priority, title, description, dueDate } = body;

  const existing = await loadRequest(params.id);
  assert(canViewRequest(actor, existing), 'Você não tem acesso a esta solicitação.');

  const touchesHandling = status !== undefined || handlerId !== undefined || priority !== undefined;
  const touchesContent = title !== undefined || description !== undefined || dueDate !== undefined;
  if (touchesHandling) {
    assert(canHandleRequest(actor, existing), 'Apenas o departamento de destino pode atender esta solicitação.');
  }
  if (touchesContent) {
    assert(canEditRequestContent(actor, existing), 'Você não pode editar esta solicitação.');
  }

  const data: Record<string, unknown> = {};
  if (status !== undefined) {
    const s = String(status).toUpperCase();
    if (!STATUSES.includes(s)) throw badRequest('Status inválido.');
    data.status = s;
  }
  if (priority !== undefined) {
    const p = String(priority).toUpperCase();
    if (!PRIORITIES.includes(p)) throw badRequest('Prioridade inválida.');
    data.priority = p;
  }
  if (handlerId !== undefined) {
    if (handlerId) await assertActiveUser(handlerId);
    data.handlerId = handlerId || null;
  }
  if (title !== undefined) data.title = String(title);
  if (description !== undefined) data.description = String(description);
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

  const updated = await prisma.crossDeptRequest.update({
    where: { id: params.id },
    data,
    include: { requester: true, handler: true },
  });

  if (data.status === 'COMPLETED' && updated.linkedCardId) {
    try {
      await prisma.cardActivity.create({
        data: {
          cardId: updated.linkedCardId,
          userId: actor.id,
          type: 'COMMENT',
          description: `Demanda intersetorial "${updated.title}" foi marcada como CONCLUÍDA.`,
          metadata: JSON.stringify({ requestId: updated.id, status: 'COMPLETED' }),
        },
      });
    } catch (err) {
      console.error('Erro ao registrar atividade no card vinculado:', err);
    }
  }

  return NextResponse.json(updated);
});

export const DELETE = withAuth<Params>(async (_req, { params, actor }) => {
  const existing = await loadRequest(params.id);
  assert(canDeleteRequest(actor, existing), 'Você não pode excluir esta solicitação.');
  await prisma.crossDeptRequest.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, message: 'Solicitação excluída com sucesso.' });
});
