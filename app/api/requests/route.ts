import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const toDept = searchParams.get('toDept');
    const fromDept = searchParams.get('fromDept');
    const status = searchParams.get('status');
    const requesterId = searchParams.get('requesterId');
    const handlerId = searchParams.get('handlerId');

    const whereClause: any = {};
    if (toDept && toDept !== 'ALL') whereClause.toDept = toDept.toUpperCase();
    if (fromDept && fromDept !== 'ALL') whereClause.fromDept = fromDept.toUpperCase();
    if (status && status !== 'ALL') whereClause.status = status.toUpperCase();
    if (requesterId) whereClause.requesterId = requesterId;
    if (handlerId) whereClause.handlerId = handlerId;

    const requests = await prisma.crossDeptRequest.findMany({
      where: whereClause,
      include: {
        requester: true,
        handler: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(requests);
  } catch (error: any) {
    console.error('Error fetching cross dept requests:', error);
    return NextResponse.json({ error: 'Erro ao buscar solicitações.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      fromDept = 'NEGOCIOS',
      toDept,
      priority = 'MEDIUM',
      requesterId,
      handlerId,
      dueDate,
      linkedCardId,
      createTargetCard = true,
    } = body;

    if (!title || !description || !toDept || !requesterId) {
      return NextResponse.json(
        { error: 'Título, descrição, setor de destino e solicitante são obrigatórios.' },
        { status: 400 }
      );
    }

    let targetCardId = linkedCardId || null;

    // Automação de Entrada: Se solicitado e não há card vinculado, cria card no primeiro pipe do setor destino
    if (createTargetCard && !targetCardId) {
      const targetPipe = await prisma.pipe.findFirst({
        where: { department: toDept.toUpperCase() },
        include: {
          phases: {
            orderBy: { order: 'asc' },
          },
        },
      });

      if (targetPipe && targetPipe.phases.length > 0) {
        const firstPhase = targetPipe.phases[0];
        const lastCard = await prisma.card.findFirst({
          where: { phaseId: firstPhase.id },
          orderBy: { order: 'desc' },
        });
        const newOrder = lastCard ? lastCard.order + 1 : 0;

        const requester = await prisma.user.findUnique({
          where: { id: requesterId },
        });

        const newCard = await prisma.card.create({
          data: {
            title: `[Solicitação] ${title}`,
            description: `${description}\n\nOrigem: Setor ${fromDept} | Solicitante: ${
              requester?.name || 'Membro'
            }`,
            phaseId: firstPhase.id,
            assigneeId: handlerId || null,
            order: newOrder,
            activities: {
              create: {
                type: 'CARD_CREATED',
                description: `Card gerado automaticamente pela Central de Solicitações a partir do setor ${fromDept}.`,
                userId: requesterId,
                metadata: JSON.stringify({
                  fromDept,
                  toDept,
                  priority,
                  source: 'CROSS_DEPT_REQUEST',
                }),
              },
            },
          },
        });

        targetCardId = newCard.id;
      }
    }

    const newRequest = await prisma.crossDeptRequest.create({
      data: {
        title,
        description,
        fromDept: fromDept.toUpperCase(),
        toDept: toDept.toUpperCase(),
        priority: priority.toUpperCase(),
        requesterId,
        handlerId: handlerId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        linkedCardId: targetCardId,
        status: 'PENDING',
      },
      include: {
        requester: true,
        handler: true,
      },
    });

    return NextResponse.json(newRequest, { status: 201 });
  } catch (error: any) {
    console.error('Error creating cross dept request:', error);
    return NextResponse.json({ error: 'Erro ao criar solicitação intersetorial.' }, { status: 500 });
  }
}
