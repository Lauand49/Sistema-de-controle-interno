import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');

    const whereClause: any = {};
    if (department && department !== 'ALL' && department !== 'GLOBAL') {
      whereClause.department = department.toUpperCase();
    }

    const pipes = await prisma.pipe.findMany({
      where: whereClause,
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: {
            fields: {
              orderBy: { order: 'asc' },
            },
            cards: {
              orderBy: { order: 'asc' },
              include: {
                assignee: true,
                values: {
                  include: {
                    field: true,
                  },
                },
                activities: {
                  orderBy: { createdAt: 'desc' },
                  include: { user: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(pipes);
  } catch (error: any) {
    console.error('Error fetching pipes:', error);
    return NextResponse.json({ error: 'Erro ao buscar pipes.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      department = 'GENTE',
      icon = 'Users',
      phases,
    } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Nome do funil é obrigatório.' }, { status: 400 });
    }

    const defaultPhases = [
      { name: 'Entrada / Backlog', order: 0, color: '#3b82f6', isFinal: false },
      { name: 'Em Andamento', order: 1, color: '#8b5cf6', isFinal: false },
      { name: 'Revisão / Validação', order: 2, color: '#f59e0b', isFinal: false },
      { name: 'Concluído', order: 3, color: '#10b981', isFinal: true },
    ];

    const phasesToCreate =
      Array.isArray(phases) && phases.length > 0
        ? phases.map((p: any, idx: number) => ({
            name: String(p.name || `Fase ${idx + 1}`),
            order: p.order !== undefined ? Number(p.order) : idx,
            color: p.color || '#7c3aed',
            isFinal: Boolean(p.isFinal),
          }))
        : defaultPhases;

    const createdPipe = await prisma.pipe.create({
      data: {
        name: name.trim(),
        description: description ? String(description).trim() : null,
        department: String(department).toUpperCase(),
        icon: icon || 'Kanban',
        phases: {
          create: phasesToCreate,
        },
      },
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: {
            fields: { orderBy: { order: 'asc' } },
            cards: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    return NextResponse.json(createdPipe, { status: 201 });
  } catch (error: any) {
    console.error('Error creating pipe:', error);
    return NextResponse.json({ error: 'Erro ao criar novo funil.' }, { status: 500 });
  }
}
