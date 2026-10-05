/**
 * PUT/DELETE /api/tools/lead-miner/companies/[id]/cnpj — CNPJ manual da Empresa (Req. 11.6, 11.7, 11.10).
 *
 * PUT: valida o CNPJ (400 "CNPJ inválido"), aplica com origem MANUAL numa transação (unicidade por
 * SAVEPOINT; conflito → 409 com `{ id, nome }`, nada gravado além do candidato CONFLITO), audita
 * `LEAD_COMPANY_CNPJ_SET` e, se necessário, consulta a BrasilAPI (origem MANUAL não é desfeita por
 * 404 nem por UF divergente). DELETE: apaga CNPJ, origem, Dados_CNPJ e situação, recalcula o
 * Nome_Exibicao e audita `LEAD_COMPANY_CNPJ_REMOVED`.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, ApiError, notFound } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireNegocios, parseBody } from '@/lib/leads/route-helpers';
import { cnpjBodySchema } from '@/lib/leads/filters';
import { getPipelineDeps } from '@/lib/leads/deps';
import { lookupCnpj, needsLookup } from '@/lib/leads/brasilapi';
import { applyCnpjInTx, writeCnpjDataInTx, CNPJ_DATA_CLEARED } from '@/lib/leads/repository';
import { recomputeNomeExibicao } from '@/lib/leads/google-cache';
import { loadCompanyDetail } from '@/lib/leads/company-detail';
import type { CnpjLookupOutcome as ClientLookup } from '@/lib/leads/client-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Params = { id: string };

const COMPANY_NOT_FOUND = 'Empresa não encontrada.';

export const PUT = withAuth<Params>(async (req, { params, actor }) => {
  requireNegocios(actor);
  const { cnpj } = await parseBody(cnpjBodySchema, req);

  const company = await prisma.company.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!company) throw notFound(COMPANY_NOT_FOUND);

  const now = new Date();
  const applied = await prisma.$transaction(async (tx) => {
    const r = await applyCnpjInTx(tx, params.id, cnpj, 'MANUAL', now);
    if (!r.ok) return r;
    await audit(tx, {
      actorId: actor.id,
      action: 'LEAD_COMPANY_CNPJ_SET',
      before: { companyId: params.id, cnpj: r.previous.cnpj, origem: r.previous.origem },
      after: { companyId: params.id, cnpj, origem: 'MANUAL' },
    });
    return r;
  });

  if (!applied.ok) {
    const other = await prisma.company.findUnique({
      where: { id: applied.conflitoCompanyId },
      select: { nome: true, nomeExibicao: true },
    });
    const nome = other?.nomeExibicao || other?.nome || applied.conflitoCompanyId;
    throw new ApiError(409, `CNPJ já vinculado à empresa ${nome}`, {
      conflito: { id: applied.conflitoCompanyId, nome },
    });
  }

  // Consulta à BrasilAPI após a transação; origem MANUAL não é desfeita por 404 nem por UF (Req. 12.3, 12.4).
  let lookup: ClientLookup = 'EM_CACHE';
  const cur = await prisma.company.findUnique({
    where: { id: params.id },
    select: { cnpjDadosCnpj: true, cnpjConsultadoEm: true },
  });
  if (cur && needsLookup(cur, cnpj, now)) {
    const deps = getPipelineDeps();
    const outcome = await lookupCnpj(cnpj, deps.cnpj);
    if (outcome.ok) {
      await prisma.$transaction((tx) => writeCnpjDataInTx(tx, params.id, outcome.data, new Date()));
      lookup = 'OK';
    } else {
      lookup = outcome.reason; // NAO_ENCONTRADO | INDISPONIVEL — o CNPJ MANUAL permanece
    }
  }

  const detail = await loadCompanyDetail(prisma, params.id, new Date());
  if (!detail) throw notFound(COMPANY_NOT_FOUND);
  return NextResponse.json({ company: detail, lookup });
});

export const DELETE = withAuth<Params>(async (_req, { params, actor }) => {
  requireNegocios(actor);

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, cnpj: true, cnpjOrigem: true },
  });
  if (!company) throw notFound(COMPANY_NOT_FOUND);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: params.id },
      data: { cnpj: null, cnpjOrigem: null, cnpjStatus: null, ...CNPJ_DATA_CLEARED },
    });
    await recomputeNomeExibicao(tx, [params.id], now);
    await audit(tx, {
      actorId: actor.id,
      action: 'LEAD_COMPANY_CNPJ_REMOVED',
      before: { companyId: params.id, cnpj: company.cnpj, origem: company.cnpjOrigem },
      after: { companyId: params.id, cnpj: null, origem: null },
    });
  });

  const detail = await loadCompanyDetail(prisma, params.id, new Date());
  if (!detail) throw notFound(COMPANY_NOT_FOUND);
  return NextResponse.json({ company: detail });
});
