import { prisma } from '../lib/prisma';

async function testLeadToolsModule() {
  console.log('🧪 Starting Lead Tools & Conversion Automated Test...\n');

  // 1. Create test prospect lead
  const lead = await prisma.prospectLead.create({
    data: {
      companyName: 'SciCloud Systems Automations',
      contactName: 'Dra. Vanessa Lima (CTO)',
      contactInfo: '(11) 97777-6666 | vanessa@scicloud.com.br',
      actionPlan: 'Agendar call de demonstração do módulo de telemetria.',
      notes: 'Lead importado do evento de tecnologia de Campinas.',
      segment: 'Biotecnologia & Software',
      status: 'PENDING',
      batchId: 'test_batch_001',
    },
  });

  console.log(`📌 Test Lead Created: "${lead.companyName}" (ID: ${lead.id})`);
  console.log(`📍 Status: ${lead.status}`);

  // 2. Test status update
  const updatedLead = await prisma.prospectLead.update({
    where: { id: lead.id },
    data: {
      status: 'IN_PROGRESS',
      notes: 'Contato estabelecido via WhatsApp. Apresentação agendada.',
    },
  });

  console.log(`✅ Status Updated: ${updatedLead.status}`);

  // 3. Test Lead to Card conversion
  const prospeccaoPhase = await prisma.phase.findFirst({
    where: { name: 'Prospecção' },
    include: { fields: true },
  });

  if (!prospeccaoPhase) {
    throw new Error('Fase de Prospecção não encontrada.');
  }

  const createdCard = await prisma.card.create({
    data: {
      title: `Projeto - ${updatedLead.companyName}`,
      description: `Lead importado da planilha. Plano: ${updatedLead.actionPlan} | Obs: ${updatedLead.notes}`,
      phaseId: prospeccaoPhase.id,
      order: 99,
      activities: {
        create: {
          type: 'CARD_CREATED',
          description: 'Card criado automaticamente via conversão de lead na Planilha de Triagem SciTec.',
        },
      },
    },
    include: { activities: true },
  });

  // Link lead to card
  const convertedLead = await prisma.prospectLead.update({
    where: { id: lead.id },
    data: {
      status: 'CONVERTED_TO_PIPE',
      pipeCardId: createdCard.id,
    },
  });

  console.log(`🎉 Lead Converted to Card!`);
  console.log(`   - Created Card Title: "${createdCard.title}" (ID: ${createdCard.id})`);
  console.log(`   - Card Phase: ${prospeccaoPhase.name}`);
  console.log(`   - Lead Status: ${convertedLead.status}`);
  console.log(`   - Linked pipeCardId: ${convertedLead.pipeCardId}`);

  // Cleanup test lead & card
  await prisma.cardActivity.deleteMany({ where: { cardId: createdCard.id } });
  await prisma.card.delete({ where: { id: createdCard.id } });
  await prisma.prospectLead.delete({ where: { id: lead.id } });

  console.log('\n✅ ALL LEAD TOOLS & CONVERSION TESTS PASSED SUCCESSFULLY!');
}

testLeadToolsModule()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
