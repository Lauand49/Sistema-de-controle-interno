import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createFieldSchema } from '@/lib/validations';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createFieldSchema.parse(body);

    const formattedOptions = Array.isArray(validated.options)
      ? JSON.stringify(validated.options)
      : validated.options || null;

    const field = await prisma.field.create({
      data: {
        name: validated.name,
        label: validated.label,
        type: validated.type,
        options: formattedOptions,
        required: validated.required,
        order: validated.order || 0,
        phaseId: validated.phaseId,
      },
    });

    return NextResponse.json(field, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados do campo inválidos.', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating field:', error);
    return NextResponse.json({ error: 'Erro ao criar campo.' }, { status: 500 });
  }
}
