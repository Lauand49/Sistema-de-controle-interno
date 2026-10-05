/**
 * POST /api/tools/lead-miner/companies/[id]/approach — Gera e grava uma Mensagem_Abordagem (Req. 15).
 *
 * Carrega a Empresa e a Analise mais recente (409 se ainda não há análise), monta o
 * `ApproachInput` com o primeiro nome do usuário da sessão (nunca a razão social), gera a mensagem
 * (IA com fallback para o modelo fixo), grava `ApproachMessage` com `authorId = actor.id` e devolve
 * o `ApproachMessageDto` com o link "Abrir no WhatsApp" quando aplicável.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, ApiError, notFound } from '@/lib/api';
import { requireNegocios, parseBody } from '@/lib/leads/route-helpers';
import { approachBodySchema } from '@/lib/leads/filters';
import { getApproachDeps } from '@/lib/leads/deps';
import { approachInputFrom } from '@/lib/leads/analysis';
import { generateApproach, whatsappOpenLink } from '@/lib/leads/approach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Params = { id: string };

export const POST = withAuth<Params>(async (req, { params, actor }) => {
  requireNegocios(actor);
  const { canal } = await parseBody(approachBodySchema, req);

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      nome: true,
      nomeExibicao: true,
      nicho: true,
      bairro: true,
      cidade: true,
      whatsappOsm: true,
      cnpj: true,
      cnpjDadosCnpj: true,
      cnpjNomeFantasia: true,
      cnpjCnaeCodigo: true,
      cnpjCnaeDescricao: true,
      cnpjPorte: true,
      situacaoCadastral: true,
      cnpjInicioAtividade: true,
      analyses: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          id: true,
          categoria: true,
          motivos: true,
          pagespeed: true,
          sinais: true,
          oportunidadeIa: true,
        },
      },
    },
  });
  if (!company) throw notFound('Empresa não encontrada.');

  const latest = company.analyses[0];
  if (!latest) throw new ApiError(409, 'Empresa ainda não analisada');

  const input = approachInputFrom(company, latest, { name: actor.name }, canal);
  const generated = await generateApproach(input, getApproachDeps());

  const saved = await prisma.approachMessage.create({
    data: {
      companyId: company.id,
      analysisId: latest.id,
      canal: generated.canal,
      origem: generated.origem,
      fallback: generated.fallback,
      assunto: generated.assunto,
      texto: generated.texto,
      authorId: actor.id,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  // Número mais recente: WhatsApp do OSM ou dos Sinais_Digitais da análise.
  const whats = company.whatsappOsm ?? sinaisWhatsapp(latest.sinais);

  return NextResponse.json(
    {
      message: {
        id: saved.id,
        canal: saved.canal,
        origem: saved.origem,
        assunto: saved.assunto,
        texto: saved.texto,
        fallback: saved.fallback,
        analysisId: saved.analysisId,
        author: { id: saved.author.id, name: saved.author.name },
        createdAt: saved.createdAt,
        whatsappLink: saved.canal === 'WHATSAPP' ? whatsappOpenLink(whats, saved.texto) : null,
      },
    },
    { status: 201 },
  );
});

/** Lê `sinais.whatsapp` de forma defensiva. */
function sinaisWhatsapp(v: unknown): string | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const w = (v as { whatsapp?: unknown }).whatsapp;
    if (typeof w === 'string') return w;
  }
  return null;
}
