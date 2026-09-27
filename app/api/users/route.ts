import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const userCreateSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  role: z.enum(['PRESIDENTE', 'GERENTE', 'ASSESSOR', 'DIRETOR'], {
    errorMap: () => ({ message: 'A hierarquia deve ser PRESIDENTE, GERENTE ou ASSESSOR' }),
  }),
  primaryDept: z.enum(['NEGOCIOS', 'ADMJURFIN', 'GENTE', 'MIDIAS', 'GLOBAL']).default('NEGOCIOS'),
  cargo: z.string().optional().nullable(),
  avatar: z.string().url().optional().or(z.literal('')).nullable(),
});

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: [
        { role: 'asc' },
        { name: 'asc' },
      ],
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

    return NextResponse.json(users);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Erro ao buscar usuários.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validatedData = userCreateSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Já existe um membro cadastrado com este e-mail.' },
        { status: 400 }
      );
    }

    const defaultAvatar =
      validatedData.avatar && validatedData.avatar.trim() !== ''
        ? validatedData.avatar
        : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
            validatedData.name
          )}&backgroundColor=7c3aed,4f46e5,6366f1&textColor=ffffff`;

    const newUser = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        role: validatedData.role,
        primaryDept: validatedData.primaryDept,
        cargo: validatedData.cargo || null,
        avatar: defaultAvatar,
      },
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

    return NextResponse.json(newUser, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Erro ao cadastrar membro.' }, { status: 500 });
  }
}
