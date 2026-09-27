import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.field.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: 'Campo excluído.' });
  } catch (error: any) {
    console.error('Error deleting field:', error);
    return NextResponse.json({ error: 'Erro ao excluir campo.' }, { status: 500 });
  }
}
