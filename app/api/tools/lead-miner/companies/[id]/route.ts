/**
 * GET /api/tools/lead-miner/companies/[id] — Ficha da empresa (`CompanyDetail`, Req. 14.1–14.3,
 * 14.5, 14.6, 14.11). Análises e minerações da mais recente para a mais antiga; 404 se a
 * empresa não existe. Coordenadas inválidas são devolvidas como `null`.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, notFound } from '@/lib/api';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { isValidCoord } from '@/lib/leads/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export const GET = withAuth<Params>(async (_req, { params, actor }) => {
  requireNegocios(actor);

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      nome: true,
      nicho: true,
      endereco: true,
      bairro: true,
      cidade: true,
      uf: true,
      telefone: true,
      website: true,
      latitude: true,
      longitude: true,
      marcaRede: true,
      fonte: true,
      categoria: true,
      scoreFinal: true,
      prioridade: true,
      hasSite: true,
      isHttps: true,
      lastAnalyzedAt: true,
      createdAt: true,
      updatedAt: true,
      assignedUser: { select: { id: true, name: true } },
      prospectLead: { select: { id: true, status: true, assignedTo: true, createdAt: true } },
      analyses: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          runId: true,
          hasSite: true,
          online: true,
          statusCode: true,
          isHttps: true,
          sslValid: true,
          sslProblem: true,
          responseTime: true,
          lento: true,
          motivoFalha: true,
          finalUrl: true,
          categoria: true,
          motivos: true,
          scoreDigital: true,
          scoreIcp: true,
          scoreObjetivo: true,
          scoreIa: true,
          scoreFinal: true,
          prioridade: true,
          iaAplicada: true,
          iaMotivo: true,
          oportunidadeIa: true,
          justificativaIa: true,
          detalhamento: true,
          createdAt: true,
        },
      },
      runs: {
        orderBy: [{ run: { createdAt: 'desc' } }, { id: 'desc' }],
        select: {
          isNew: true,
          nicho: true,
          run: {
            select: {
              id: true,
              bairro: true,
              cidade: true,
              uf: true,
              status: true,
              processados: true,
              total: true,
              nichosFalhos: true,
              createdAt: true,
              createdBy: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!company) throw notFound('Empresa não encontrada.');

  const { runs, analyses, latitude, longitude, ...rest } = company;
  const coordsOk = isValidCoord(latitude, longitude);

  return NextResponse.json({
    ...rest,
    latitude: coordsOk ? latitude : null,
    longitude: coordsOk ? longitude : null,
    analyses: analyses.map((a) => ({ ...a, motivos: toStringArray(a.motivos) })),
    runs: runs.map(({ isNew, nicho, run }) => ({
      isNew,
      nicho,
      run: { ...run, nichosFalhos: toStringArray(run.nichosFalhos) },
    })),
  });
});
