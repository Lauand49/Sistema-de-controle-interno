/**
 * POST /api/tools/lead-miner/companies/export — Exportação CSV do ranking (Req. 17).
 *
 * Corpo: `{ ids: string[] }` (1–200, Empresas selecionadas) ou `{ filters: CompanyFilters }`
 * (todas as Empresas filtradas). Sem `ids`, usa `filters` (ausente = sem filtros).
 * Linhas na ordenação do ranking, limitadas a `EXPORT_MAX`; o total e o corte são
 * informados em `X-Export-Total` e `X-Export-Truncated`.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { withAuth, notFound } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { EXPORT_MAX } from '@/lib/leads/config';
import { CSV_HEADER, buildCsv, limitExport, toCsvRow, type ExportRow } from '@/lib/leads/csv';
import { RANKING_ORDER, buildCompanyWhere, bulkIdsSchema, companyFiltersSchema } from '@/lib/leads/filters';
import { parseBody, parseWith, requireNegocios } from '@/lib/leads/route-helpers';
import { formatCnpj } from '@/lib/leads/cnpj';
import type { CategoryCode, PriorityCode, SourceMode } from '@/lib/leads/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPTY_EXPORT_MESSAGE = 'Não há empresas para exportar.';

const bodySchema = z.object({
  ids: z.unknown().optional(),
  filters: z.unknown().optional(),
});

/** Data local (America/Sao_Paulo) em AAAA-MM-DD para o nome do arquivo. */
function todayStamp(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export const POST = withAuth(async (req, { actor }) => {
  // Permissão antes de qualquer leitura (Req. 17.9, 18.1).
  requireNegocios(actor);

  const body = await parseBody(bodySchema, req);
  let where: Prisma.CompanyWhereInput;
  if (body.ids !== undefined) {
    const ids = parseWith(bulkIdsSchema, body.ids);
    where = { id: { in: ids } };
  } else {
    const filters = parseWith(companyFiltersSchema, body.filters ?? {});
    where = buildCompanyWhere(filters, new Date());
  }

  // Busca EXPORT_MAX + 1 para detectar o corte; `count` dá o total real (Req. 17.7).
  const [companies, total] = await prisma.$transaction([
    prisma.company.findMany({
      where,
      orderBy: RANKING_ORDER,
      take: EXPORT_MAX + 1,
      select: {
        nome: true,
        nicho: true,
        endereco: true,
        bairro: true,
        cidade: true,
        uf: true,
        telefone: true,
        website: true,
        categoria: true,
        scoreFinal: true,
        prioridade: true,
        lastAnalyzedAt: true,
        assignedUser: { select: { name: true } },
        // ── Etapa 3 (Req. 18.4) ──
        cnpjDadosCnpj: true,
        situacaoCadastral: true,
        instagramOsm: true,
        whatsappOsm: true,
        desempenhoRuim: true,
        googleCache: { select: { placeId: true } },
        runs: {
          orderBy: { run: { createdAt: 'desc' } },
          take: 1,
          select: { run: { select: { fonte: true } } },
        },
      },
    }),
    prisma.company.count({ where }),
  ]);

  if (companies.length === 0) throw notFound(EMPTY_EXPORT_MESSAGE);

  const { rows, truncated } = limitExport(companies, EXPORT_MAX);
  const csvRows = rows.map((c) => {
    const row: ExportRow = {
      nome: c.nome,
      nicho: c.nicho,
      endereco: c.endereco,
      bairro: c.bairro,
      cidade: c.cidade,
      uf: c.uf,
      telefone: c.telefone,
      website: c.website,
      categoria: (c.categoria ?? null) as CategoryCode | null,
      scoreFinal: c.scoreFinal,
      prioridade: (c.prioridade ?? null) as PriorityCode | null,
      responsavelNome: c.assignedUser?.name ?? null,
      ultimaAnaliseEm: c.lastAnalyzedAt,
      // ── Etapa 3 (Req. 18.4) ──
      cnpj: c.cnpjDadosCnpj ? formatCnpj(c.cnpjDadosCnpj) : null,
      situacaoCadastral: c.situacaoCadastral ?? null,
      instagram: c.instagramOsm ?? null,
      whatsapp: c.whatsappOsm ?? null,
      desempenhoRuim: c.desempenhoRuim ?? null,
      fonte: (c.runs[0]?.run?.fonte ?? null) as SourceMode | null,
      googlePlaceId: c.googleCache?.placeId ?? null,
    };
    return toCsvRow(row);
  });
  const csv = buildCsv([[...CSV_HEADER], ...csvRows]);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${todayStamp()}.csv"`,
      'Cache-Control': 'no-store',
      'X-Export-Total': String(Math.max(total, rows.length)),
      'X-Export-Truncated': String(truncated),
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Export-Total, X-Export-Truncated',
    },
  });
});
