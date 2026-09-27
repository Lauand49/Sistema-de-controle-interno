import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const transactions = await prisma.financialTransaction.findMany({
      orderBy: { createdAt: 'desc' },
    });

    let totalInflow = 0;
    let pendingInflow = 0;
    let totalOutflow = 0;
    let pendingOutflow = 0;

    for (const t of transactions) {
      if (t.type === 'INFLOW') {
        if (t.status === 'PAID') {
          totalInflow += t.amount;
        } else if (t.status === 'PENDING') {
          pendingInflow += t.amount;
        }
      } else if (t.type === 'OUTFLOW') {
        if (t.status === 'PAID') {
          totalOutflow += t.amount;
        } else if (t.status === 'PENDING') {
          pendingOutflow += t.amount;
        }
      }
    }

    const currentBalance = totalInflow - totalOutflow;

    return NextResponse.json({
      transactions,
      metrics: {
        totalInflow,
        pendingInflow,
        totalOutflow,
        pendingOutflow,
        currentBalance,
      },
    });
  } catch (error: any) {
    console.error('Error fetching financial transactions:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar movimentações financeiras.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      description,
      amount,
      type = 'INFLOW',
      category = 'Projeto',
      status = 'PENDING',
      dueDate,
      paymentDate,
      relatedCardId,
      invoiceUrl,
    } = body;

    if (!description || amount === undefined || isNaN(Number(amount))) {
      return NextResponse.json(
        { error: 'Descrição e valor numérico são obrigatórios.' },
        { status: 400 }
      );
    }

    const transaction = await prisma.financialTransaction.create({
      data: {
        description: String(description),
        amount: Math.abs(Number(amount)),
        type: String(type).toUpperCase() === 'OUTFLOW' ? 'OUTFLOW' : 'INFLOW',
        category: String(category),
        status: String(status).toUpperCase() === 'PAID' ? 'PAID' : 'PENDING',
        dueDate: dueDate ? new Date(dueDate) : null,
        paymentDate: paymentDate
          ? new Date(paymentDate)
          : status === 'PAID'
          ? new Date()
          : null,
        relatedCardId: relatedCardId || null,
        invoiceUrl: invoiceUrl || null,
      },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error: any) {
    console.error('Error creating financial transaction:', error);
    return NextResponse.json(
      { error: 'Erro ao cadastrar movimentação financeira.' },
      { status: 500 }
    );
  }
}
