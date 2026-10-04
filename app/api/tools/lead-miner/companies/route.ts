/**
 * GET /api/tools/lead-miner/companies — ranking paginado de empresas (Req. 12, 13, 18).
 * Página de `RANKING_PAGE_SIZE`, ordem única `RANKING_ORDER`. Cada linha é exibida via
 * `displayCompany` (Nome_Exibicao, campos do Google) sem o objeto de cache cru; Conteudo_Google
 * expirado nunca aparece (Req. 6.3–6.6). Purga oportunista do Cache_Google expirado (Req. 6.2).
 *
 * T4: `contato=com|sem` escolhe a aba; `contatoCounts` traz os totais das duas abas respeitando os
 * demais filtros ativos (a aba em si não entra na contagem, senão a outra sempre seria zero).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api';
import { requireNegocios, parseQuery } from '@/lib/leads/route-helpers';
import { buildCompanyWhere, companyListSchema, RANKING_ORDER } from '@/lib/leads/filters';
import { RANKING_PAGE_SIZE } from '@/lib/leads/config';
import { displayCompany } from '@/lib/leads/display';
import { purgeExpiredGoogleCache } from '@/lib/leads/google-cache';
import { safeFormatCnpj } from '@/lib/leads/cnpj';
import { contatoWhere } from '@/lib/leads/contact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIST_SELECT = {
  id: true,
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
  hasSite: true,
  isHttps: true,
  fonte: true,
  lastAnalyzedAt: true,
  latitude: true,
  longitude: true,
  googlePlaceId: true,
  cnpj: true,
  cnpjNomeFantasia: true,
  temInstagram: true,
  temWhatsapp: true,
  situacaoCadastral: true,
  desempenhoRuim: true,
  assignedUser: { select: { id: true, name: true } },
  prospectLead: { select: { id: true, status: true } },
  googleCache: true,
} as const;

export const GET = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const { page, ...filters } = parseQuery(companyListSchema, req.url);
  const now = new Date();

  // Purga oportunista do Conteudo_Google expirado (melhor esforço, não interrompe a listagem).
  try {
    await purgeExpiredGoogleCache(prisma, now);
  } catch (e) {
    console.error('[lead-miner] falha na purga do Cache_Google', e);
  }

  const where = buildCompanyWhere(filters, now);
  const base = buildCompanyWhere({ ...filters, contato: undefined }, now);
  const [rows, total, com, sem] = await prisma.$transaction([
    prisma.company.findMany({
      where,
      orderBy: RANKING_ORDER,
      skip: (page - 1) * RANKING_PAGE_SIZE,
      take: RANKING_PAGE_SIZE,
      select: LIST_SELECT,
    }),
    prisma.company.count({ where }),
    prisma.company.count({ where: { AND: [base, contatoWhere('com', now)] } }),
    prisma.company.count({ where: { AND: [base, contatoWhere('sem', now)] } }),
  ]);

  const items = rows.map((c) => {
    const d = displayCompany(
      {
        nome: c.nome,
        endereco: c.endereco,
        bairro: c.bairro,
        cidade: c.cidade,
        uf: c.uf,
        telefone: c.telefone,
        website: c.website,
        latitude: c.latitude,
        longitude: c.longitude,
        googlePlaceId: c.googlePlaceId,
        cnpjNomeFantasia: c.cnpjNomeFantasia,
        googleCache: c.googleCache
          ? {
            nome: c.googleCache.nome,
            endereco: c.googleCache.endereco,
            bairro: c.googleCache.bairro,
            cidade: c.googleCache.cidade,
            uf: c.googleCache.uf,
            telefone: c.googleCache.telefone,
            website: c.googleCache.website,
            latitude: c.googleCache.latitude,
            longitude: c.googleCache.longitude,
            mapsUri: c.googleCache.mapsUri,
            businessStatus: c.googleCache.businessStatus,
            tipos: Array.isArray(c.googleCache.tipos) ? (c.googleCache.tipos as string[]) : [],
            obtidoEm: c.googleCache.obtidoEm,
            expiraEm: c.googleCache.expiraEm,
          }
          : null,
      },
      now,
    );
    return {
      id: c.id,
      nome: d.nome,
      nomeOrigem: d.nomeOrigem,
      googleFields: d.googleFields,
      googlePlaceId: c.googlePlaceId,
      nicho: c.nicho,
      bairro: d.bairro,
      cidade: d.cidade,
      uf: d.uf,
      telefone: d.telefone,
      website: d.website,
      categoria: c.categoria,
      scoreFinal: c.scoreFinal,
      prioridade: c.prioridade,
      hasSite: c.hasSite,
      isHttps: c.isHttps,
      fonte: c.fonte,
      lastAnalyzedAt: c.lastAnalyzedAt,
      latitude: d.latitude,
      longitude: d.longitude,
      temInstagram: c.temInstagram,
      temWhatsapp: c.temWhatsapp,
      cnpjFormatado: c.cnpj ? safeFormatCnpj(c.cnpj) : null,
      situacaoCadastral: c.situacaoCadastral,
      desempenhoRuim: c.desempenhoRuim,
      assignedUser: c.assignedUser ? { id: c.assignedUser.id, name: c.assignedUser.name } : null,
      prospectLead: c.prospectLead,
    };
  });

  return NextResponse.json({
    items,
    total,
    page,
    pageSize: RANKING_PAGE_SIZE,
    totalPages: Math.ceil(total / RANKING_PAGE_SIZE),
    contatoCounts: { com, sem },
  });
});
