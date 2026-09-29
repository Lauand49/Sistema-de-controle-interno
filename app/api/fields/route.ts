import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createFieldSchema } from '@/lib/validations';
import { withAuth, assert } from '@/lib/api';
import { canEditUnit } from '@/lib/permissions';
import { phaseContext } from '@/lib/units';

export const POST = withAuth(async (request, { actor }) => {
  const validated = createFieldSchema.parse(await request.json());

  const { unitCode } = await phaseContext(validated.phaseId);
  assert(canEditUnit(actor, unitCode), 'Você não participa da unidade deste funil.');

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
});
