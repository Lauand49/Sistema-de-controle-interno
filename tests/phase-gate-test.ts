import { prisma } from '../lib/prisma';
import { validatePhaseGate } from '../lib/validations';

async function testPhaseGateValidation() {
  console.log('🧪 Starting Phase Gate Validation Automated Test...\n');

  // 1. Get Prospecção card and Qualificação phase
  const prospeccaoPhase = await prisma.phase.findFirst({
    where: { name: 'Prospecção' },
  });

  const qualificacaoPhase = await prisma.phase.findFirst({
    where: { name: 'Qualificação' },
    include: { fields: true },
  });

  if (!prospeccaoPhase || !qualificacaoPhase) {
    throw new Error('Fases do seed não encontradas.');
  }

  const card = await prisma.card.findFirst({
    where: { phaseId: prospeccaoPhase.id },
    include: { values: true },
  });

  if (!card) {
    throw new Error('Card da fase de Prospecção não encontrado.');
  }

  console.log(`📌 Test Card: "${card.title}" (ID: ${card.id})`);
  console.log(`📍 Current Phase: ${prospeccaoPhase.name}`);
  console.log(`🎯 Target Phase: ${qualificacaoPhase.name}`);

  // 2. Check required fields for target phase (Qualificação)
  const requiredTargetFields = qualificacaoPhase.fields.filter((f) => f.required);
  console.log(
    `🔒 Target Phase Required Fields:`,
    requiredTargetFields.map((f) => f.label)
  );

  // 3. Test Phase Gate validation with EMPTY values for target fields
  const emptyValuesMap = new Map<string, string>();

  const validationResult1 = validatePhaseGate(requiredTargetFields, emptyValuesMap);

  console.log('\n--- TEST CASE 1: Transition without required fields ---');
  console.log(`Expected isValid: false -> Actual isValid: ${validationResult1.isValid}`);
  console.log(
    `Missing fields count: ${validationResult1.missingFields.length} (Expected: ${requiredTargetFields.length})`
  );

  if (validationResult1.isValid || validationResult1.missingFields.length === 0) {
    console.error('❌ FAIL: Phase Gate validation should have rejected transition!');
    process.exit(1);
  } else {
    console.log('✅ SUCCESS: Phase Gate correctly rejected transition with missing fields!');
  }

  // 4. Test Phase Gate validation with FILLED values for target fields
  console.log('\n--- TEST CASE 2: Transition WITH filled required fields ---');
  const filledValuesMap = new Map<string, string>();
  requiredTargetFields.forEach((f) => {
    filledValuesMap.set(f.id, `Valor preenchido para ${f.label}`);
  });

  const validationResult2 = validatePhaseGate(requiredTargetFields, filledValuesMap);

  console.log(`Expected isValid: true -> Actual isValid: ${validationResult2.isValid}`);

  if (!validationResult2.isValid) {
    console.error('❌ FAIL: Phase Gate validation should have approved transition!');
    process.exit(1);
  } else {
    console.log('✅ SUCCESS: Phase Gate correctly approved transition!');
  }

  console.log('\n🎉 ALL AUTOMATED PHASE GATE TESTS PASSED SUCCESSFULLY!');
}

testPhaseGateValidation()
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
