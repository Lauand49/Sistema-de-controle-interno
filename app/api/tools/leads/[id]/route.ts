import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, notFound } from '@/lib/api';
import { canDeleteLead, canEditLead } from '@/lib/permissions';
import { assertLeadAssigneeChange, parseLeadStatus } from '@/lib/leads/guards';

type Params = { id: string };

export const PATCH = withAuth<Params>(async (request, { params, actor }) => {
  const body = await request.json();

  const existing = await prisma.prospectLead.findUnique({ where: { id: params.id } });
  if (!existing) throw notFound('Lead não encontrado.');
  assert(canEditLead(actor, existing), 'Este lead pertence a outro responsável.');

  if (body.assignedTo !== undefined) {
    await assertLeadAssigneeChange(actor, existing.assignedTo, body.assignedTo || null);
  }

  const updated = await prisma.prospectLead.update({
    where: { id: params.id },
    data: {
      ...(body.companyName ? { companyName: String(body.companyName) } : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
      ...(body.contactInfo !== undefined ? { contactInfo: body.contactInfo } : {}),
      ...(body.actionPlan !== undefined ? { actionPlan: String(body.actionPlan) } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.segment !== undefined ? { segment: body.segment } : {}),
      ...(body.status ? { status: parseLeadStatus(body.status) } : {}),
      ...(body.assignedTo !== undefined ? { assignedTo: body.assignedTo || null } : {}),
    },
    include: { assignedUser: true },
  });

  return NextResponse.json(updated);
});

export const DELETE = withAuth<Params>(async (_req, { params, actor }) => {
  assert(canDeleteLead(actor), 'Apenas a gerência de Negócios ou a Presidência pode excluir leads.');
  await prisma.prospectLead.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, message: 'Lead excluído.' });
});
