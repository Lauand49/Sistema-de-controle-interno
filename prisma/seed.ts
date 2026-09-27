import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting SciTec jr. complete database seed (4 Departments)...');

  // Clean existing data
  await prisma.cardActivity.deleteMany();
  await prisma.cardFieldValue.deleteMany();
  await prisma.card.deleteMany();
  await prisma.field.deleteMany();
  await prisma.phase.deleteMany();
  await prisma.pipe.deleteMany();
  await prisma.crossDeptRequest.deleteMany();
  await prisma.financialTransaction.deleteMany();
  await prisma.prospectLead.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create SciTec jr. Team Members
  const userAna = await prisma.user.create({
    data: {
      name: 'Ana Clara',
      email: 'ana.clara@scitecjr.com.br',
      role: 'DIRETOR',
      primaryDept: 'NEGOCIOS',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
  });

  const userLucas = await prisma.user.create({
    data: {
      name: 'Lucas Mendes',
      email: 'lucas.mendes@scitecjr.com.br',
      role: 'ASSESSOR',
      primaryDept: 'NEGOCIOS',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    },
  });

  const userGabriel = await prisma.user.create({
    data: {
      name: 'Gabriel Santos',
      email: 'gabriel.santos@scitecjr.com.br',
      role: 'GERENTE',
      primaryDept: 'NEGOCIOS',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    },
  });

  const userBeatriz = await prisma.user.create({
    data: {
      name: 'Beatriz Rezende',
      email: 'beatriz.rezende@scitecjr.com.br',
      role: 'DIRETOR',
      primaryDept: 'ADMJURFIN',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    },
  });

  const userRafael = await prisma.user.create({
    data: {
      name: 'Rafael Toledo',
      email: 'rafael.toledo@scitecjr.com.br',
      role: 'GERENTE',
      primaryDept: 'GENTE',
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150',
    },
  });

  const userMariana = await prisma.user.create({
    data: {
      name: 'Mariana Duarte',
      email: 'mariana.duarte@scitecjr.com.br',
      role: 'ASSESSOR',
      primaryDept: 'MIDIAS',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    },
  });

  console.log('👤 Created 6 team members across 4 departments');

  // ==========================================
  // SETOR 1: NEGÓCIOS
  // ==========================================
  const pipeNegocios = await prisma.pipe.create({
    data: {
      name: 'Funil de Vendas & Negociação',
      description: 'Gestão integrada de prospecção, diagnósticos, propostas comerciais e fechamento.',
      department: 'NEGOCIOS',
      icon: 'Briefcase',
    },
  });

  const pNegReuniao = await prisma.phase.create({
    data: { name: 'Reunião marcada', order: 0, pipeId: pipeNegocios.id, color: '#0284c7' },
  });
  const pNegDiag = await prisma.phase.create({
    data: { name: 'Diagnóstico', order: 1, pipeId: pipeNegocios.id, color: '#7c3aed' },
  });
  const pNegProp = await prisma.phase.create({
    data: { name: 'Proposta', order: 2, pipeId: pipeNegocios.id, color: '#c026d3' },
  });
  const pNegGanho = await prisma.phase.create({
    data: { name: 'Fechado/Ganho', order: 3, pipeId: pipeNegocios.id, isFinal: true, color: '#059669' },
  });
  const pNegPerdido = await prisma.phase.create({
    data: { name: 'Perdido', order: 4, pipeId: pipeNegocios.id, isFinal: true, color: '#e11d48' },
  });

  // Fields Negócios
  const fNegEmpresa = await prisma.field.create({
    data: { name: 'company_name', label: 'Nome da Empresa / Cliente', type: 'TEXT', required: true, order: 0, phaseId: pNegReuniao.id },
  });
  const fNegData = await prisma.field.create({
    data: { name: 'meeting_date', label: 'Data da Reunião Diagnóstica', type: 'DATE', required: true, order: 1, phaseId: pNegReuniao.id },
  });
  const fNegContato = await prisma.field.create({
    data: { name: 'contact_person', label: 'Contato Principal (Decisor)', type: 'TEXT', required: true, order: 2, phaseId: pNegReuniao.id },
  });

  const fDiagEscopo = await prisma.field.create({
    data: { name: 'preliminary_scope', label: 'Escopo Preliminar Identificado', type: 'TEXTAREA', required: true, order: 0, phaseId: pNegDiag.id },
  });
  const fDiagDor = await prisma.field.create({
    data: { name: 'main_pain', label: 'Dor Principal do Cliente', type: 'TEXTAREA', required: true, order: 1, phaseId: pNegDiag.id },
  });
  const fDiagOrcamento = await prisma.field.create({
    data: { name: 'budget', label: 'Orçamento Estimado (R$)', type: 'CURRENCY', required: true, order: 2, phaseId: pNegDiag.id },
  });

  const fPropVal = await prisma.field.create({
    data: { name: 'proposal_value', label: 'Valor Comercial da Proposta (R$)', type: 'CURRENCY', required: true, order: 0, phaseId: pNegProp.id },
  });
  const fPropData = await prisma.field.create({
    data: { name: 'presentation_date', label: 'Data da Apresentação', type: 'DATE', required: true, order: 1, phaseId: pNegProp.id },
  });
  const fPropPrazo = await prisma.field.create({
    data: { name: 'duration_weeks', label: 'Prazo (Semanas)', type: 'NUMBER', required: true, order: 2, phaseId: pNegProp.id },
  });

  const fGanhoData = await prisma.field.create({
    data: { name: 'contract_signed_date', label: 'Data de Assinatura do Contrato', type: 'DATE', required: true, order: 0, phaseId: pNegGanho.id },
  });
  const fGanhoVal = await prisma.field.create({
    data: { name: 'final_value', label: 'Valor Final do Projeto (R$)', type: 'CURRENCY', required: true, order: 1, phaseId: pNegGanho.id },
  });
  const fGanhoGP = await prisma.field.create({
    data: { name: 'project_manager', label: 'Gerente Responsável', type: 'TEXT', required: true, order: 2, phaseId: pNegGanho.id },
  });

  // Cards Negócios
  await prisma.card.create({
    data: {
      title: 'Plataforma Web & Dashboard - BioTech Inovação',
      description: 'Reunião comercial de alinhamento agendada com diretoria de P&D.',
      phaseId: pNegReuniao.id,
      assigneeId: userLucas.id,
      order: 0,
      values: {
        create: [
          { fieldId: fNegEmpresa.id, value: 'BioTech Inovação' },
          { fieldId: fNegData.id, value: '2026-09-22' },
          { fieldId: fNegContato.id, value: 'Dra. Vanessa Lima (CTO)' },
        ],
      },
    },
  });

  await prisma.card.create({
    data: {
      title: 'Automação de Processos & Sistema Interno - LogiTech Brasil',
      description: 'Diagnóstico de requisitos operacionais e integrações de API.',
      phaseId: pNegDiag.id,
      assigneeId: userGabriel.id,
      order: 0,
      values: {
        create: [
          { fieldId: fNegEmpresa.id, value: 'LogiTech Brasil' },
          { fieldId: fDiagEscopo.id, value: 'Otimização de despacho e painel de pedidos.' },
          { fieldId: fDiagDor.id, value: 'Processos manuais gerando gargalo no despacho.' },
          { fieldId: fDiagOrcamento.id, value: '18000' },
        ],
      },
    },
  });

  await prisma.card.create({
    data: {
      title: 'Consultoria em Ciência de Dados e IA - FinTech Alfa',
      description: 'Proposta pronta para apresentação ao comitê de crédito.',
      phaseId: pNegProp.id,
      assigneeId: userLucas.id,
      order: 0,
      values: {
        create: [
          { fieldId: fNegEmpresa.id, value: 'FinTech Alfa' },
          { fieldId: fPropVal.id, value: '24000' },
          { fieldId: fPropData.id, value: '2026-09-20' },
          { fieldId: fPropPrazo.id, value: '10' },
        ],
      },
    },
  });

  const cardHealth = await prisma.card.create({
    data: {
      title: 'Desenvolvimento de App Mobile - HealthTech Vida',
      description: 'Contrato assinado! Início imediato do projeto técnico.',
      phaseId: pNegGanho.id,
      assigneeId: userAna.id,
      order: 0,
      values: {
        create: [
          { fieldId: fNegEmpresa.id, value: 'HealthTech Vida' },
          { fieldId: fGanhoData.id, value: '2026-09-12' },
          { fieldId: fGanhoVal.id, value: '29500' },
          { fieldId: fGanhoGP.id, value: 'Gabriel Santos' },
        ],
      },
    },
  });

  console.log('💼 Seeded Negócios pipe and cards');

  // ==========================================
  // SETOR 2: ADMJURFIN
  // ==========================================
  const pipeContratos = await prisma.pipe.create({
    data: {
      name: 'Emissão de Contratos & Validação Jurídica',
      description: 'Elaboração de minutas contratuais, validação jurídica, coleta de assinaturas e arquivamento.',
      department: 'ADMJURFIN',
      icon: 'Scale',
    },
  });

  const pConSol = await prisma.phase.create({
    data: { name: 'Solicitação Recebida', order: 0, pipeId: pipeContratos.id, color: '#3b82f6' },
  });
  const pConMin = await prisma.phase.create({
    data: { name: 'Redação de Minuta', order: 1, pipeId: pipeContratos.id, color: '#8b5cf6' },
  });
  const pConAss = await prisma.phase.create({
    data: { name: 'Assinatura do Cliente', order: 2, pipeId: pipeContratos.id, color: '#f59e0b' },
  });
  const pConVig = await prisma.phase.create({
    data: { name: 'Contrato Vigente', order: 3, pipeId: pipeContratos.id, isFinal: true, color: '#10b981' },
  });

  const fConCli = await prisma.field.create({
    data: { name: 'client_name', label: 'Nome da Contratante', type: 'TEXT', required: true, order: 0, phaseId: pConSol.id },
  });
  const fConVal = await prisma.field.create({
    data: { name: 'contract_value', label: 'Valor do Contrato (R$)', type: 'CURRENCY', required: true, order: 1, phaseId: pConSol.id },
  });
  const fConPrazo = await prisma.field.create({
    data: { name: 'sla_deadline', label: 'Prazo Limite para Minuta', type: 'DATE', required: true, order: 2, phaseId: pConSol.id },
  });

  await prisma.card.create({
    data: {
      title: 'Minuta de Contrato - HealthTech Vida',
      description: 'Contrato de desenvolvimento de software em React Native (R$ 29.500,00).',
      phaseId: pConAss.id,
      assigneeId: userBeatriz.id,
      order: 0,
      values: {
        create: [
          { fieldId: fConCli.id, value: 'HealthTech Vida' },
          { fieldId: fConVal.id, value: '29500' },
          { fieldId: fConPrazo.id, value: '2026-09-25' },
        ],
      },
    },
  });

  await prisma.card.create({
    data: {
      title: 'Termo de Parceria & Confidencialidade (NDA) - BioTech Inovação',
      description: 'Acordo de confidencialidade preliminar para proteção de dados clínicos.',
      phaseId: pConMin.id,
      assigneeId: userBeatriz.id,
      order: 0,
      values: {
        create: [
          { fieldId: fConCli.id, value: 'BioTech Inovação' },
          { fieldId: fConVal.id, value: '0' },
          { fieldId: fConPrazo.id, value: '2026-09-21' },
        ],
      },
    },
  });

  // Pipe Faturamento
  const pipeFaturamento = await prisma.pipe.create({
    data: {
      name: 'Contas a Receber & Faturamento',
      description: 'Controle de emissão de NFS-e, envio de boletos e baixa de pagamentos de projetos.',
      department: 'ADMJURFIN',
      icon: 'Receipt',
    },
  });

  const pFatAFaturar = await prisma.phase.create({
    data: { name: 'A Faturar', order: 0, pipeId: pipeFaturamento.id, color: '#6366f1' },
  });
  const pFatBoleto = await prisma.phase.create({
    data: { name: 'Boleto/NF Gerada', order: 1, pipeId: pipeFaturamento.id, color: '#06b6d4' },
  });
  const pFatAguardando = await prisma.phase.create({
    data: { name: 'Aguardando Pagamento', order: 2, pipeId: pipeFaturamento.id, color: '#f59e0b' },
  });
  const pFatLiquidado = await prisma.phase.create({
    data: { name: 'Liquidado', order: 3, pipeId: pipeFaturamento.id, isFinal: true, color: '#10b981' },
  });

  await prisma.card.create({
    data: {
      title: 'Parcela 1/2 (50%) - HealthTech Vida',
      description: 'Primeira parcela do projeto de app mobile.',
      phaseId: pFatAguardando.id,
      assigneeId: userBeatriz.id,
      order: 0,
    },
  });

  await prisma.card.create({
    data: {
      title: 'Sinal de Entrada (40%) - FinTech Alfa',
      description: 'Entrada contratual de consultoria em ciência de dados.',
      phaseId: pFatAFaturar.id,
      assigneeId: userBeatriz.id,
      order: 0,
    },
  });

  // Transações Financeiras (Fluxo de Caixa)
  await prisma.financialTransaction.createMany({
    data: [
      {
        description: 'Recebimento Sinal de Entrada - HealthTech Vida',
        amount: 14750.0,
        type: 'INFLOW',
        category: 'Projeto',
        status: 'PAID',
        paymentDate: new Date('2026-09-14'),
        relatedCardId: cardHealth.id,
      },
      {
        description: 'Faturamento Entrada - FinTech Alfa',
        amount: 9600.0,
        type: 'INFLOW',
        category: 'Projeto',
        status: 'PENDING',
        dueDate: new Date('2026-09-25'),
      },
      {
        description: 'Servidores de Nuvem AWS & Banco de Dados (Trimestral)',
        amount: 450.0,
        type: 'OUTFLOW',
        category: 'Ferramenta',
        status: 'PAID',
        paymentDate: new Date('2026-09-10'),
      },
      {
        description: 'Assinatura Figma Organization & Github Team',
        amount: 280.0,
        type: 'OUTFLOW',
        category: 'Ferramenta',
        status: 'PAID',
        paymentDate: new Date('2026-09-05'),
      },
      {
        description: 'Reembolso Deslocamento Visita Diagnóstica LogiTech',
        amount: 145.5,
        type: 'OUTFLOW',
        category: 'Reembolso',
        status: 'PAID',
        paymentDate: new Date('2026-09-13'),
      },
    ],
  });

  console.log('⚖️ Seeded AdmJurFin pipes, cards and financial transactions');

  // ==========================================
  // SETOR 3: GENTE (RH & DESEMPENHO)
  // ==========================================
  const pipeGente = await prisma.pipe.create({
    data: {
      name: 'Processo Seletivo & Trainees',
      description: 'Acompanhamento do funil de candidatos, dinâmicas em grupo, entrevistas e programa de trainee.',
      department: 'GENTE',
      icon: 'UserCheck',
    },
  });

  const pGenIns = await prisma.phase.create({
    data: { name: 'Inscrito', order: 0, pipeId: pipeGente.id, color: '#64748b' },
  });
  const pGenDin = await prisma.phase.create({
    data: { name: 'Dinâmica em Grupo', order: 1, pipeId: pipeGente.id, color: '#3b82f6' },
  });
  const pGenEnt = await prisma.phase.create({
    data: { name: 'Entrevista Individual', order: 2, pipeId: pipeGente.id, color: '#8b5cf6' },
  });
  const pGenApr = await prisma.phase.create({
    data: { name: 'Aprovado', order: 3, pipeId: pipeGente.id, color: '#f59e0b' },
  });
  const pGenTra = await prisma.phase.create({
    data: { name: 'Onboarding/Trainee', order: 4, pipeId: pipeGente.id, color: '#06b6d4' },
  });
  const pGenEfe = await prisma.phase.create({
    data: { name: 'Efetivado', order: 5, pipeId: pipeGente.id, isFinal: true, color: '#10b981' },
  });

  await prisma.card.create({
    data: {
      title: 'Guilherme Siqueira - Engenharia de Software',
      description: 'Candidato aprovado na dinâmica; perfil excelente para desenvolvimento back-end.',
      phaseId: pGenEnt.id,
      assigneeId: userRafael.id,
      order: 0,
    },
  });

  await prisma.card.create({
    data: {
      title: 'Camila Fernandes - Design Digital',
      description: 'Portfólio em UI/UX, candidata para o núcleo de criação e mídias.',
      phaseId: pGenTra.id,
      assigneeId: userRafael.id,
      order: 0,
    },
  });

  await prisma.card.create({
    data: {
      title: 'Matheus Prado - Ciência da Computação',
      description: 'Inscrição recebida via formulário do Instagram.',
      phaseId: pGenIns.id,
      assigneeId: userRafael.id,
      order: 0,
    },
  });

  // Pipe PDI
  const pipePdi = await prisma.pipe.create({
    data: {
      name: 'PDI & Acompanhamento de Ciclos',
      description: 'Planos de Desenvolvimento Individual, metas trimestrais e avaliações 360.',
      department: 'GENTE',
      icon: 'Award',
    },
  });

  const pPdiMet = await prisma.phase.create({
    data: { name: 'Metas Definidas', order: 0, pipeId: pipePdi.id, color: '#6366f1' },
  });
  const pPdiChk = await prisma.phase.create({
    data: { name: 'Checkpoint Mensal', order: 1, pipeId: pipePdi.id, color: '#f59e0b' },
  });
  const pPdiAva = await prisma.phase.create({
    data: { name: 'Avaliação 360', order: 2, pipeId: pipePdi.id, color: '#8b5cf6' },
  });
  const pPdiCon = await prisma.phase.create({
    data: { name: 'Concluído', order: 3, pipeId: pipePdi.id, isFinal: true, color: '#10b981' },
  });

  await prisma.card.create({
    data: {
      title: 'PDI Ciclo 2026.2 - Lucas Mendes (Negócios)',
      description: 'Foco: Negociação de Projetos Grandes e Prospecção Ativa B2B.',
      phaseId: pPdiChk.id,
      assigneeId: userRafael.id,
      order: 0,
    },
  });

  console.log('👥 Seeded Gente pipes and cards');

  // ==========================================
  // SETOR 4: MÍDIAS (MARKETING & CONTEÚDO)
  // ==========================================
  const pipeMidias = await prisma.pipe.create({
    data: {
      name: 'Produção de Conteúdo & Marketing',
      description: 'Linha editorial, redação de copy, design de criativos, validação e agendamento de posts.',
      department: 'MIDIAS',
      icon: 'Palette',
    },
  });

  const pMidIde = await prisma.phase.create({
    data: { name: 'Ideia/Pauta', order: 0, pipeId: pipeMidias.id, color: '#64748b' },
  });
  const pMidCop = await prisma.phase.create({
    data: { name: 'Redação do Copy', order: 1, pipeId: pipeMidias.id, color: '#3b82f6' },
  });
  const pMidDes = await prisma.phase.create({
    data: { name: 'Design/Edição', order: 2, pipeId: pipeMidias.id, color: '#8b5cf6' },
  });
  const pMidApr = await prisma.phase.create({
    data: { name: 'Aprovação Interna', order: 3, pipeId: pipeMidias.id, color: '#f59e0b' },
  });
  const pMidPos = await prisma.phase.create({
    data: { name: 'Agendado/Postado', order: 4, pipeId: pipeMidias.id, isFinal: true, color: '#10b981' },
  });

  const fMidTit = await prisma.field.create({
    data: { name: 'post_title', label: 'Título do Post', type: 'TEXT', required: true, order: 0, phaseId: pMidIde.id },
  });
  const fMidData = await prisma.field.create({
    data: { name: 'publish_date', label: 'Data Programada', type: 'DATE', required: true, order: 1, phaseId: pMidIde.id },
  });
  const fMidFmt = await prisma.field.create({
    data: { name: 'post_format', label: 'Formato', type: 'SELECT', options: JSON.stringify(['Carrossel Instagram', 'Reels', 'Artigo LinkedIn', 'Story']), required: true, order: 2, phaseId: pMidIde.id },
  });

  await prisma.card.create({
    data: {
      title: 'Carrossel: Por que sua empresa precisa de um Sistema Sob Medida?',
      description: 'Post educativo com comparativo entre planilhas e sistemas sob medida.',
      phaseId: pMidPos.id,
      assigneeId: userMariana.id,
      order: 0,
      values: {
        create: [
          { fieldId: fMidTit.id, value: 'Por que sua empresa precisa de um Sistema Sob Medida?' },
          { fieldId: fMidData.id, value: '2026-09-18' },
          { fieldId: fMidFmt.id, value: 'Carrossel Instagram' },
        ],
      },
    },
  });

  await prisma.card.create({
    data: {
      title: 'Reels: Bastidores da Reunião de Imersão SciTec jr.',
      description: 'Vídeo dinâmico mostrando a equipe técnica desenvolvendo protótipos.',
      phaseId: pMidDes.id,
      assigneeId: userMariana.id,
      order: 0,
      values: {
        create: [
          { fieldId: fMidTit.id, value: 'Bastidores da Imersão Técnica' },
          { fieldId: fMidData.id, value: '2026-09-23' },
          { fieldId: fMidFmt.id, value: 'Reels' },
        ],
      },
    },
  });

  await prisma.card.create({
    data: {
      title: 'Artigo LinkedIn: Como a IA Generativa Transforma Pequenos Negócios',
      description: 'Artigo institucional assinado pela diretoria de projetos.',
      phaseId: pMidApr.id,
      assigneeId: userMariana.id,
      order: 0,
      values: {
        create: [
          { fieldId: fMidTit.id, value: 'IA Generativa em Pequenos Negócios' },
          { fieldId: fMidData.id, value: '2026-09-26' },
          { fieldId: fMidFmt.id, value: 'Artigo LinkedIn' },
        ],
      },
    },
  });

  console.log('🎨 Seeded Mídias pipe and cards');

  // ==========================================
  // SOLICITAÇÕES INTERSETORIAIS (CROSS-DEPT)
  // ==========================================
  await prisma.crossDeptRequest.createMany({
    data: [
      {
        title: 'Emissão de Minuta Contratual - HealthTech Vida',
        description: 'Projeto fechado no valor de R$ 29.500,00. Elaborar minuta com 2 parcelas (50% entrada e 50% entrega).',
        fromDept: 'NEGOCIOS',
        toDept: 'ADMJURFIN',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        requesterId: userAna.id,
        handlerId: userBeatriz.id,
        dueDate: new Date('2026-09-20'),
      },
      {
        title: 'Criação de Artes para Divulgação do Processo Seletivo',
        description: 'Necessitamos de 3 artes estáticas para feed e 2 templates para stories com chamada para inscrições de trainees.',
        fromDept: 'GENTE',
        toDept: 'MIDIAS',
        status: 'PENDING',
        priority: 'HIGH',
        requesterId: userRafael.id,
        handlerId: userMariana.id,
        dueDate: new Date('2026-09-22'),
      },
      {
        title: 'Validação de Informações Técnicas do Case de Sucesso FinTech',
        description: 'Mídias está montando um case de estudo sobre a consultoria em dados para publicar no site. Solicitamos revisão de escopo.',
        fromDept: 'MIDIAS',
        toDept: 'NEGOCIOS',
        status: 'PENDING',
        priority: 'MEDIUM',
        requesterId: userMariana.id,
        handlerId: userLucas.id,
        dueDate: new Date('2026-09-24'),
      },
    ],
  });

  console.log('🔄 Seeded Cross-Department Requests');
  console.log('✅ SciTec jr. Complete Database Seed finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed execution:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
