import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, ApiError, assert } from '@/lib/api';
import { canUseNegociosTools } from '@/lib/permissions';
import { assertActiveUser, findSalesPipe } from '@/lib/units';
import {
  calculateProjectPricing,
  ROLES_RATES,
  CLIENT_SIZE_MODIFIERS,
  URGENCY_MODIFIERS,
  EXPERIENCE_MODIFIERS,
  COMPLEXITY_MODIFIERS,
  BASE_TEAM_SIZE,
  TEAM_SIZE_FACTOR,
  LOYALTY_DISCOUNT_FACTOR,
  SimulationInput,
} from '@/lib/pricing';

export const GET = withAuth(async (_req, { actor }) => {
  assert(canUseNegociosTools(actor), 'O motor de precificação é exclusivo de Negócios e da Presidência.');
  return NextResponse.json({
    roles: ROLES_RATES,
    clientSizes: CLIENT_SIZE_MODIFIERS,
    urgencies: URGENCY_MODIFIERS,
    experiences: EXPERIENCE_MODIFIERS,
    complexities: COMPLEXITY_MODIFIERS,
    baseTeamSize: BASE_TEAM_SIZE,
    teamSizeFactor: TEAM_SIZE_FACTOR,
    loyaltyDiscountFactor: LOYALTY_DISCOUNT_FACTOR,
  });
});

export const POST = withAuth(async (request, { actor }) => {
  assert(canUseNegociosTools(actor), 'O motor de precificação é exclusivo de Negócios e da Presidência.');
  try {
    const body = await request.json();
    const { projeto, servicos, custos_extras, createCard, assigneeId } = body;

    if (!projeto) {
      return NextResponse.json(
        { error: 'Dados do projeto ausentes ou inválidos.' },
        { status: 400 }
      );
    }

    const input: SimulationInput = {
      projeto: {
        cliente: String(projeto.cliente || 'Cliente não identificado'),
        nome_projeto: String(projeto.nome_projeto || 'Projeto Técnico'),
        porte_cliente: String(projeto.porte_cliente || 'MEDIA'),
        nivel_experiencia: projeto.nivel_experiencia !== undefined ? projeto.nivel_experiencia : 3,
        nivel_complexidade: Number(projeto.nivel_complexidade) || 3,
        urgencia: String(projeto.urgencia || 'Média'),
        num_pessoas: Number(projeto.num_pessoas) || 4,
        desconto_fidelidade: Boolean(projeto.desconto_fidelidade),
        desconto_comercial: Number(projeto.desconto_comercial) || 0,
      },
      servicos: Array.isArray(servicos)
        ? servicos.map((s: any) => ({
            cargo: String(s.cargo || ''),
            horas: Number(s.horas) || 0,
            descricao: s.descricao ? String(s.descricao) : undefined,
          }))
        : [],
      custos_extras: Array.isArray(custos_extras)
        ? custos_extras.map((c: any) => ({
            descricao: String(c.descricao || 'Custo extra'),
            valor_total: Number(c.valor_total) || 0,
            parcelas: c.parcelas ? Number(c.parcelas) : undefined,
            categoria: c.categoria ? String(c.categoria) : undefined,
          }))
        : [],
    };

    const result = calculateProjectPricing(input);

    let createdCard = null;

    if (createCard) {
      // Find pipe and either "Proposta" phase or first phase
      if (assigneeId) await assertActiveUser(assigneeId);
      const pipe = await findSalesPipe();

      if (pipe && pipe.phases.length > 0) {
        // Prefer "Proposta" phase, otherwise first phase
        const targetPhase =
          pipe.phases.find((p) => p.name.toLowerCase().includes('proposta')) ||
          pipe.phases[0];

        const lastCard = await prisma.card.findFirst({
          where: { phaseId: targetPhase.id },
          orderBy: { order: 'desc' },
        });
        const newOrder = lastCard ? lastCard.order + 1 : 0;

        const valueCreates: Array<{ fieldId: string; value: string }> = [];

        // Check for field matches
        const fComp = targetPhase.fields.find((f) => f.name === 'company_name');
        const fPropval = targetPhase.fields.find((f) => f.name === 'proposal_value');

        if (fComp) {
          valueCreates.push({ fieldId: fComp.id, value: input.projeto.cliente });
        }
        if (fPropval) {
          valueCreates.push({ fieldId: fPropval.id, value: String(result.preco_final) });
        }

        const breakdownLines = [
          `💼 Cliente: ${input.projeto.cliente}`,
          `🎯 Projeto: ${input.projeto.nome_projeto}`,
          `⏱️ Horas Totais: ${result.horas_totais}h | Custo Horas: R$ ${result.preco_parcial_horas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `📊 Modificador Total: ${(result.modificadores.modificador_total * 100).toFixed(1)}%`,
          `📦 Custos Extras: R$ ${result.total_custos_extras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `💰 Preço Final Sugerido: R$ ${result.preco_final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        ];

        createdCard = await prisma.card.create({
          data: {
            title: `[Proposta] ${input.projeto.nome_projeto} - ${input.projeto.cliente}`,
            description: breakdownLines.join('\n'),
            phaseId: targetPhase.id,
            assigneeId: assigneeId || null,
            order: newOrder,
            values: {
              create: valueCreates,
            },
            activities: {
              create: {
                type: 'CARD_CREATED',
                description: `Card gerado automaticamente pelo Motor de Precificação SciTec jr. (Valor: R$ ${result.preco_final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
                userId: actor.id,
                metadata: JSON.stringify({
                  source: 'PRICING_ENGINE',
                  preco_final: result.preco_final,
                  horas_totais: result.horas_totais,
                }),
              },
            },
          },
          include: {
            phase: true,
            assignee: true,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      result,
      card: createdCard,
    });
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    console.error('Error calculating project pricing:', error);
    return NextResponse.json(
      { error: 'Erro ao calcular a precificação do projeto.' },
      { status: 500 }
    );
  }
});
