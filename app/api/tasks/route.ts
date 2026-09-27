import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createTaskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  cardId: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const assigneeId = searchParams.get('assigneeId');
    const status = searchParams.get('status');
    const department = searchParams.get('department');
    const query = searchParams.get('q');

    const where: any = {};

    if (department && department !== 'ALL') {
      where.department = department.toUpperCase();
    }

    if (assigneeId && assigneeId !== 'ALL') {
      where.assigneeId = assigneeId;
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (query) {
      where.OR = [
        { title: { contains: query } },
        { description: { contains: query } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: true,
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Erro ao buscar tarefas.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createTaskSchema.parse(body);

    const task = await prisma.task.create({
      data: {
        title: validated.title,
        description: validated.description,
        status: validated.status,
        priority: validated.priority,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
        department: validated.department ? validated.department.toUpperCase() : 'GLOBAL',
        assigneeId: validated.assigneeId || null,
        leadId: validated.leadId || null,
        cardId: validated.cardId || null,
      },
      include: {
        assignee: true,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Erro ao criar tarefa.' }, { status: 500 });
  }
}
