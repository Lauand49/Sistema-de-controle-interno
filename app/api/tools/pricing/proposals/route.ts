import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, assert } from '@/lib/api';
import { canUseNegociosTools } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request, { actor }) => {
  assert(canUseNegociosTools(actor), 'O motor de precificação é exclusivo de Negócios e da Presidência.');

  const proposals = await prisma.pricingProposal.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      clientName: true,
      projectName: true,
      input: true,
      finalPrice: true,
      cardId: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json(proposals.map((proposal) => ({
    ...proposal,
    finalPrice: proposal.finalPrice.toNumber(),
    createdAt: proposal.createdAt.toISOString(),
  })));
});
