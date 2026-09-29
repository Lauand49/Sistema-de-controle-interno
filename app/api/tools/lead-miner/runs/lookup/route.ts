/**
 * GET /api/tools/lead-miner/runs/lookup?bairro&cidade&uf — Mineração `CONCLUIDA` mais recente
 * com o mesmo bairro/cidade (normalizados) e UF igual, para o aviso "Bairro já minerado" (Req. 10.4).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { parseQuery, requireNegocios } from '@/lib/leads/route-helpers';
import { MSG } from '@/lib/leads/filters';
import { UFS } from '@/lib/leads/config';
import { normalizeText } from '@/lib/leads/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (message: string) =>
  z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message).max(100, message);

const lookupSchema = z.object({
  bairro: text(MSG.bairro),
  cidade: text(MSG.cidade),
  uf: z
    .string({ required_error: MSG.uf, invalid_type_error: MSG.uf })
    .refine((uf) => UFS.includes(uf), MSG.uf),
});

export const GET = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const q = parseQuery(lookupSchema, req.url);
  const run = await prisma.miningRun.findFirst({
    where: {
      bairroNorm: normalizeText(q.bairro),
      cidadeNorm: normalizeText(q.cidade),
      uf: q.uf,
      status: 'CONCLUIDA',
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, createdAt: true, total: true, createdBy: { select: { name: true } } },
  });
  return NextResponse.json({ run: run ?? null });
});
