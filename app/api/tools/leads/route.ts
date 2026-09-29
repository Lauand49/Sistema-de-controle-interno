import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, badRequest } from '@/lib/api';
import { canUseNegociosTools } from '@/lib/permissions';
import { parseLeadStatus } from '@/lib/leads/guards';

const NO_ACCESS = 'As ferramentas de leads são exclusivas de Negócios e da Presidência.';

export const GET = withAuth(async (request, { actor }) => {
  assert(canUseNegociosTools(actor), NO_ACCESS);

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const segmentParam = searchParams.get('segment');
  const queryParam = searchParams.get('q');

  const where: Prisma.ProspectLeadWhereInput = {};
  if (statusParam && statusParam !== 'ALL') where.status = statusParam;
  if (segmentParam && segmentParam !== 'ALL') where.segment = segmentParam;
  if (queryParam) {
    where.OR = [
      { companyName: { contains: queryParam, mode: 'insensitive' } },
      { contactName: { contains: queryParam, mode: 'insensitive' } },
      { contactInfo: { contains: queryParam, mode: 'insensitive' } },
      { actionPlan: { contains: queryParam, mode: 'insensitive' } },
      { notes: { contains: queryParam, mode: 'insensitive' } },
    ];
  }

  const leads = await prisma.prospectLead.findMany({
    where,
    include: { assignedUser: true },
    orderBy: { createdAt: 'desc' },
  });

  // Fase atual do card vinculado (tempo real)
  const pipeCardIds = leads.map((l) => l.pipeCardId).filter((id): id is string => Boolean(id));
  const cardsMap = new Map<
    string,
    {
      id: string;
      title: string;
      phaseId: string;
      phaseName: string;
      phaseColor: string | null;
      meetingDate?: string | null;
      assigneeName?: string | null;
    }
  >();

  if (pipeCardIds.length > 0) {
    const cards = await prisma.card.findMany({
      where: { id: { in: pipeCardIds } },
      include: { phase: true, assignee: true, values: { include: { field: true } } },
    });
    for (const c of cards) {
      cardsMap.set(c.id, {
        id: c.id,
        title: c.title,
        phaseId: c.phaseId,
        phaseName: c.phase.name,
        phaseColor: c.phase.color,
        meetingDate: c.values?.find((v) => v.field.name === 'meeting_date')?.value || null,
        assigneeName: c.assignee?.name || null,
      });
    }
  }

  const enrichedLeads = leads.map((lead) => ({
    ...lead,
    pipeCard: lead.pipeCardId ? cardsMap.get(lead.pipeCardId) || null : null,
  }));

  const grouped = await prisma.prospectLead.groupBy({ by: ['status'], _count: { _all: true } });
  const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const stats = {
    total: grouped.reduce((acc, g) => acc + g._count._all, 0),
    raw: count('RAW'),
    pending: count('PENDING'),
    inProgress: count('IN_PROGRESS'),
    converted: count('CONVERTED_TO_PIPE'),
    discarded: count('DISCARDED'),
  };

  return NextResponse.json({ leads: enrichedLeads, stats });
});

export const POST = withAuth(async (request, { actor }) => {
  assert(canUseNegociosTools(actor), NO_ACCESS);

  const { leads, batchId, defaultStatus } = await request.json();
  if (!Array.isArray(leads) || leads.length === 0) {
    throw badRequest('Nenhum lead válido fornecido para importação.');
  }

  // Importação só cria leads nas etapas iniciais (sem responsável).
  const initialStatus = parseLeadStatus(defaultStatus || 'PENDING');
  if (initialStatus !== 'RAW' && initialStatus !== 'PENDING') {
    throw badRequest('Leads importados devem entrar como RAW ou PENDING.');
  }

  const createdBatchId = batchId || `lote_${Date.now()}`;
  const data = leads
    .filter((item: any) => typeof item?.companyName === 'string' && item.companyName.trim())
    .map((item: any) => ({
      companyName: item.companyName.trim(),
      contactName: item.contactName?.trim() || null,
      contactInfo: item.contactInfo?.trim() || null,
      actionPlan: item.actionPlan?.trim() || 'Aguardando definição de abordagem comercial',
      notes: item.notes?.trim() || null,
      segment: item.segment?.trim() || null,
      status: initialStatus,
      batchId: createdBatchId,
    }));

  const createdLeads = await prisma.$transaction(data.map((d) => prisma.prospectLead.create({ data: d })));

  return NextResponse.json(
    { success: true, count: createdLeads.length, batchId: createdBatchId, leads: createdLeads },
    { status: 201 }
  );
});
