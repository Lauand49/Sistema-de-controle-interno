import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const pipe = await prisma.pipe.findUnique({
      where: { id: params.id },
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
                  include: { field: true },
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

    if (!pipe) {
      return NextResponse.json({ error: 'Pipe não encontrado.' }, { status: 404 });
    }

    return NextResponse.json(pipe);
  } catch (error: any) {
    console.error('Error fetching pipe:', error);
    return NextResponse.json({ error: 'Erro ao buscar o pipe.' }, { status: 500 });
  }
}
