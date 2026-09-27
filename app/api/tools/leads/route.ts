import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const segmentParam = searchParams.get('segment');
    const queryParam = searchParams.get('q');

    const whereClause: any = {};

    if (statusParam && statusParam !== 'ALL') {
      whereClause.status = statusParam;
    }

    if (segmentParam && segmentParam !== 'ALL') {
      whereClause.segment = segmentParam;
    }

    if (queryParam) {
      whereClause.OR = [
        { companyName: { contains: queryParam } },
        { contactName: { contains: queryParam } },
        { contactInfo: { contains: queryParam } },
        { actionPlan: { contains: queryParam } },
        { notes: { contains: queryParam } },
      ];
    }

    const leads = await prisma.prospectLead.findMany({
      where: whereClause,
      include: {
        assignedUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Lookup linked Cards to give real-time Funnel Phase information
    const pipeCardIds = leads
      .map((l) => l.pipeCardId)
      .filter((id): id is string => Boolean(id));

    let cardsMap = new Map<
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
        include: {
          phase: true,
          assignee: true,
          values: {
            include: { field: true },
          },
        },
      });

      for (const c of cards) {
        const meetingVal = c.values?.find((v) => v.field.name === 'meeting_date')?.value || null;
        cardsMap.set(c.id, {
          id: c.id,
          title: c.title,
          phaseId: c.phaseId,
          phaseName: c.phase.name,
          phaseColor: c.phase.color,
          meetingDate: meetingVal,
          assigneeName: c.assignee?.name || null,
        });
      }
    }

    // Attach pipeCard details to each lead
    const enrichedLeads = leads.map((lead) => {
      const cardInfo = lead.pipeCardId ? cardsMap.get(lead.pipeCardId) || null : null;
      return {
        ...lead,
        pipeCard: cardInfo,
      };
    });

    // Compute stats
    const allLeads = await prisma.prospectLead.findMany({
      select: { status: true },
    });

    const stats = {
      total: allLeads.length,
      raw: allLeads.filter((l) => l.status === 'RAW').length,
      pending: allLeads.filter((l) => l.status === 'PENDING').length,
      inProgress: allLeads.filter((l) => l.status === 'IN_PROGRESS').length,
      converted: allLeads.filter((l) => l.status === 'CONVERTED_TO_PIPE').length,
      discarded: allLeads.filter((l) => l.status === 'DISCARDED').length,
    };

    return NextResponse.json({ leads: enrichedLeads, stats });
  } catch (error: any) {
    console.error('Error fetching prospect leads:', error);
    return NextResponse.json({ error: 'Erro ao buscar lista de leads.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { leads, batchId, defaultStatus } = body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum lead válido fornecido para importação.' },
        { status: 400 }
      );
    }

    const createdBatchId = batchId || `lote_${Date.now()}`;
    const initialStatus = defaultStatus || 'PENDING';
    const createdLeads = [];

    for (const item of leads) {
      if (!item.companyName || !item.companyName.trim()) continue;

      const lead = await prisma.prospectLead.create({
        data: {
          companyName: item.companyName.trim(),
          contactName: item.contactName?.trim() || null,
          contactInfo: item.contactInfo?.trim() || null,
          actionPlan: item.actionPlan?.trim() || 'Aguardando definição de abordagem comercial',
          notes: item.notes?.trim() || null,
          segment: item.segment?.trim() || null,
          status: item.status || initialStatus,
          batchId: createdBatchId,
        },
      });
      createdLeads.push(lead);
    }

    return NextResponse.json(
      {
        success: true,
        count: createdLeads.length,
        batchId: createdBatchId,
        leads: createdLeads,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error batch importing leads:', error);
    return NextResponse.json({ error: 'Erro ao salvar lote de leads.' }, { status: 500 });
  }
}
