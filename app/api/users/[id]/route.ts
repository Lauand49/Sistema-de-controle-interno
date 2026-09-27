import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const userUpdateSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres').optional(),
  email: z.string().email('E-mail inválido').optional(),
  role: z.enum(['PRESIDENTE', 'GERENTE', 'ASSESSOR', 'DIRETOR'], {
    errorMap: () => ({ message: 'A hierarquia deve ser PRESIDENTE, GERENTE ou ASSESSOR' }),
  }).optional(),
  primaryDept: z.enum(['NEGOCIOS', 'ADMJURFIN', 'GENTE', 'MIDIAS', 'GLOBAL']).optional(),
  cargo: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        assignedCards: {
          include: {
            phase: true,
          },
        },
        assignedLeads: true,
        assignedTasks: true,
        _count: {
          select: {
            assignedCards: true,
            assignedLeads: true,
            assignedTasks: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Erro ao buscar membro.' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const validatedData = userUpdateSchema.parse(body);

    if (validatedData.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: validatedData.email,
          NOT: { id: params.id },
        },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'Já existe outro membro cadastrado com este e-mail.' },
          { status: 400 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: validatedData,
      include: {
        _count: {
          select: {
            assignedCards: true,
            assignedLeads: true,
            assignedTasks: true,
          },
        },
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Erro ao atualizar membro.' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.user.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: 'Membro removido com sucesso.' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Erro ao remover membro.' }, { status: 500 });
  }
}
