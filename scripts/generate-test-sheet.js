const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const leadsData = [
  {
    'Empresa': 'AgroTech Inovações S/A',
    'Contato (Decisor)': 'Dra. Helena Marques (Diretora de P&D)',
    'Telefone / WhatsApp': '(19) 99123-4567',
    'Segmento': 'Agronegócio & IoT',
    'Plano de Ação (Abordagem Recomendada)': 'Agendar reunião para apresentar protótipo de sensores de solo e telemetria.',
    'Observações / Contexto': 'Encontrado no evento Agrotech Summit 2026. Alto interesse em projeto de bolsas de pesquisa.'
  },
  {
    'Empresa': 'MedLab Inteligência Médica',
    'Contato (Decisor)': 'Dr. Fernando Alencar (CEO)',
    'Telefone / WhatsApp': '(11) 98877-1122',
    'Segmento': 'Biotecnologia & Saúde',
    'Plano de Ação (Abordagem Recomendada)': 'Apresentar proposta de sistema web para laudos automatizados com visão computacional.',
    'Observações / Contexto': 'Indicação da Faculdade de Medicina. Necessidade de validação de algoritmos em Python.'
  },
  {
    'Empresa': 'SolarEnergy Distribuidora',
    'Contato (Decisor)': 'Eng. Ricardo Souza (Gerente de Operações)',
    'Telefone / WhatsApp': '(31) 97654-3210',
    'Segmento': 'Energia & Automação',
    'Plano de Ação (Abordagem Recomendada)': 'Qualificar escopo de software para monitoramento de inversores solares em tempo real.',
    'Observações / Contexto': 'Prospecção ativa no LinkedIn. Empresa buscando parceria com Empresa Júnior.'
  },
  {
    'Empresa': 'EcoPack Embalagens Sustentáveis',
    'Contato (Decisor)': 'Camila Rocha (Head de Inovação)',
    'Telefone / WhatsApp': '(41) 99888-5544',
    'Segmento': 'Indústria & Materiais',
    'Plano de Ação (Abordagem Recomendada)': 'Agendar visita técnica para mapear gargalos na esteira fabril e propor automação.',
    'Observações / Contexto': 'Faturamento estimado R$ 5M/ano. Decisora rápida.'
  },
  {
    'Empresa': 'PayFast Soluções Financeiras',
    'Contato (Decisor)': 'Marcelo Viana (VP de Engenharia)',
    'Telefone / WhatsApp': '(11) 99555-8822',
    'Segmento': 'FinTech & Software',
    'Plano de Ação (Abordagem Recomendada)': 'Enviar material institucional da SciTec jr. e agendar alinhamento de diagnóstico de IA.',
    'Observações / Contexto': 'Interessados em modelos de Machine Learning para score de crédito.'
  }
];

const worksheet = XLSX.utils.json_to_sheet(leadsData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads SciTec jr');

const xlsxPath = path.join(process.cwd(), 'planilha_teste_leads_scitec.xlsx');
const csvPath = path.join(process.cwd(), 'planilha_teste_leads_scitec.csv');

const publicXlsxPath = path.join(process.cwd(), 'public', 'planilha_teste_leads_scitec.xlsx');
const publicCsvPath = path.join(process.cwd(), 'public', 'planilha_teste_leads_scitec.csv');

XLSX.writeFile(workbook, xlsxPath);
XLSX.writeFile(workbook, csvPath, { bookType: 'csv' });

fs.copyFileSync(xlsxPath, publicXlsxPath);
fs.copyFileSync(csvPath, publicCsvPath);

console.log('✅ Planilhas de teste geradas com sucesso:');
console.log('   -', xlsxPath);
console.log('   -', csvPath);
console.log('   -', publicXlsxPath);
console.log('   -', publicCsvPath);
