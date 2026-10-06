'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { useProfile } from '@/contexts/ProfileContext';
import {
  calculateProjectPricing,
  ROLES_RATES,
  CLIENT_SIZE_MODIFIERS,
  URGENCY_MODIFIERS,
  EXPERIENCE_MODIFIERS,
  COMPLEXITY_MODIFIERS,
  BASE_TEAM_SIZE,
  ServiceAllocation,
  ExtraCost,
  ProjectHeader,
} from '@/lib/pricing';
import { toast } from 'sonner';
import {
  Calculator,
  Clock,
  DollarSign,
  Users,
  Flame,
  Layers,
  Award,
  Percent,
  Plus,
  Trash2,
  Copy,
  Check,
  Send,
  Sparkles,
  ArrowLeft,
  Building2,
  FileSpreadsheet,
  Zap,
  Info,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { CONTROL_CLASS } from '@/components/ui/Input';
import { PageHeader, EmptyState } from '@/components/ui/Display';

export default function ProjectPricingPage() {
  const { profiles, currentProfile } = useProfile();

  // Project Header State
  const [cliente, setCliente] = useState('Cliente Exemplo');
  const [nomeProjeto, setNomeProjeto] = useState('Sistema Web & Dashboard');
  const [porteCliente, setPorteCliente] = useState('MEDIA');
  const [urgencia, setUrgencia] = useState('Média');
  const [nivelExperiencia, setNivelExperiencia] = useState<number>(3);
  const [nivelComplexidade, setNivelComplexidade] = useState<number>(3);
  const [numPessoas, setNumPessoas] = useState<number>(4);
  const [descontoFidelidade, setDescontoFidelidade] = useState<boolean>(false);
  const [descontoComercialPct, setDescontoComercialPct] = useState<number>(0);

  // Dynamic Service Allocations State
  const [servicos, setServicos] = useState<ServiceAllocation[]>([
    { cargo: 'Desenvolvedor (a) Front End', horas: 30, descricao: 'Interface e telas responsivas' },
    { cargo: 'Desenvolvedor Back End', horas: 40, descricao: 'Arquitetura e banco de dados' },
  ]);

  // Dynamic Extra Costs State
  const [custosExtras, setCustosExtras] = useState<ExtraCost[]>([
    { descricao: 'Hospedagem em Nuvem e Domínio (6 meses)', valor_total: 450, categoria: 'Infraestrutura' },
  ]);

  // Funnel Card Creation State
  const [selectedAssignee, setSelectedAssignee] = useState<string>(currentProfile?.id || '');
  const [isSendingToPipe, setIsSendingToPipe] = useState(false);
  const [copiedProposal, setCopiedProposal] = useState(false);

  // Real-time calculation using pure function
  const pricingResult = useMemo(() => {
    const header: ProjectHeader = {
      cliente,
      nome_projeto: nomeProjeto,
      porte_cliente: porteCliente,
      nivel_experiencia: nivelExperiencia,
      nivel_complexidade: nivelComplexidade,
      urgencia,
      num_pessoas: Number(numPessoas) || 4,
      desconto_fidelidade: descontoFidelidade,
      desconto_comercial: (Number(descontoComercialPct) || 0) / 100,
    };

    return calculateProjectPricing({
      projeto: header,
      servicos,
      custos_extras: custosExtras,
    });
  }, [
    cliente,
    nomeProjeto,
    porteCliente,
    urgencia,
    nivelExperiencia,
    nivelComplexidade,
    numPessoas,
    descontoFidelidade,
    descontoComercialPct,
    servicos,
    custosExtras,
  ]);

  // Helpers for Services
  const addServiceRow = () => {
    setServicos([
      ...servicos,
      { cargo: 'Desenvolvedor Full Stack', horas: 20, descricao: '' },
    ]);
  };

  const updateServiceRow = (index: number, field: keyof ServiceAllocation, value: any) => {
    const updated = [...servicos];
    updated[index] = {
      ...updated[index],
      [field]: field === 'horas' ? Math.max(0, Number(value) || 0) : value,
    };
    setServicos(updated);
  };

  const removeServiceRow = (index: number) => {
    if (servicos.length <= 1) {
      toast.info('O projeto precisa ter pelo menos um papel técnico alocado.');
      return;
    }
    setServicos(servicos.filter((_, i) => i !== index));
  };

  // Helpers for Extra Costs
  const addExtraCostRow = () => {
    setCustosExtras([
      ...custosExtras,
      { descricao: 'Licença / Serviço de Terceiros', valor_total: 150, categoria: 'Outros' },
    ]);
  };

  const updateExtraCostRow = (index: number, field: keyof ExtraCost, value: any) => {
    const updated = [...custosExtras];
    updated[index] = {
      ...updated[index],
      [field]: field === 'valor_total' ? Math.max(0, Number(value) || 0) : value,
    };
    setCustosExtras(updated);
  };

  const removeExtraCostRow = (index: number) => {
    setCustosExtras(custosExtras.filter((_, i) => i !== index));
  };

  // Pre-fill Section 5 Test Specification Case
  const loadSpecificationExample = () => {
    setCliente('Empresa Inovação Ltda');
    setNomeProjeto('Plataforma Web Especializada');
    setPorteCliente('MEDIA');
    setUrgencia('Média');
    setNivelExperiencia(3);
    setNivelComplexidade(3);
    setNumPessoas(4);
    setDescontoFidelidade(false);
    setDescontoComercialPct(0);
    setServicos([
      { cargo: 'Desenvolvedor (a) Front End', horas: 30, descricao: 'Desenvolvimento de telas e UI' },
      { cargo: 'Desenvolvedor Back End', horas: 40, descricao: 'APIs, banco de dados e regras de negócio' },
    ]);
    setCustosExtras([
      { descricao: 'Hospedagem Cloud e Certificados SSL', valor_total: 450, categoria: 'Infraestrutura' },
    ]);
    toast.success('Exemplo oficial da especificação carregado com sucesso!');
  };

  const resetForm = () => {
    setCliente('Novo Cliente');
    setNomeProjeto('Projeto de Solução Digital');
    setPorteCliente('MEDIA');
    setUrgencia('Média');
    setNivelExperiencia(3);
    setNivelComplexidade(3);
    setNumPessoas(4);
    setDescontoFidelidade(false);
    setDescontoComercialPct(0);
    setServicos([
      { cargo: 'Desenvolvedor (a) Front End', horas: 20, descricao: '' },
    ]);
    setCustosExtras([]);
    toast.info('Formulário redefinido.');
  };

  // Commercial Proposal Copy
  const handleCopyProposal = () => {
    const formatBRL = (val: number) =>
      val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const text = `
========================================
🚀 PROPOSTA COMERCIAL & TÉCNICA - SCITEC JR.
========================================
Cliente: ${cliente}
Projeto: ${nomeProjeto}
Porte do Cliente: ${porteCliente} | Urgência: ${urgencia}
Equipe Alocada: ${numPessoas} pessoas

📋 ALOCAÇÃO DE HORAS & ESCOPO TÉCNICO:
${pricingResult.detalhes_servicos
  .map(
    (s) =>
      `• ${s.cargo}: ${s.horas}h x ${formatBRL(s.valor_hora)}/h = ${formatBRL(
        s.subtotal
      )}${s.descricao ? ` (${s.descricao})` : ''}`
  )
  .join('\n')}

⏱️ Total de Horas Técnicas: ${pricingResult.horas_totais}h
💰 Custo Base de Mão de Obra: ${formatBRL(pricingResult.preco_parcial_horas)}

📊 MODIFICADORES & FATORES TÉCNICOS:
• Porte do Cliente: ${(pricingResult.modificadores.porte * 100).toFixed(0)}% (${formatBRL(
      pricingResult.impactos_financeiros.impacto_porte
    )})
• Urgência: ${(pricingResult.modificadores.urgencia * 100).toFixed(0)}% (${formatBRL(
      pricingResult.impactos_financeiros.impacto_urgencia
    )})
• Experiência no Escopo: ${(pricingResult.modificadores.experiencia * 100).toFixed(0)}% (${formatBRL(
      pricingResult.impactos_financeiros.impacto_experiencia
    )})
• Complexidade Técnica: ${(pricingResult.modificadores.complexidade * 100).toFixed(0)}% (${formatBRL(
      pricingResult.impactos_financeiros.impacto_complexidade
    )})
• Ajuste de Equipe (${numPessoas}p): ${(pricingResult.modificadores.pessoas * 100).toFixed(0)}% (${formatBRL(
      pricingResult.impactos_financeiros.impacto_pessoas
    )})
${
  descontoFidelidade
    ? `• Fidelidade Cliente Recorrente: -5% (${formatBRL(
        pricingResult.impactos_financeiros.impacto_fidelidade
      )})\n`
    : ''
}${
      descontoComercialPct > 0
        ? `• Desconto Comercial: -${descontoComercialPct}% (${formatBRL(
            pricingResult.impactos_financeiros.impacto_desconto_comercial
          )})\n`
        : ''
    }• Modificador Global Líquido: ${(
      pricingResult.modificadores.modificador_total * 100
    ).toFixed(1)}% (${formatBRL(pricingResult.impactos_financeiros.total_acrescimos)})

📦 CUSTOS DIRETOS / DESPESAS ADICIONAIS:
${
  pricingResult.total_custos_extras > 0
    ? custosExtras.map((c) => `• ${c.descricao}: ${formatBRL(c.valor_total)}`).join('\n')
    : '• Nenhum custo extra previsto'
}
Subtotal Despesas Adicionais: ${formatBRL(pricingResult.total_custos_extras)}

========================================
VALOR FINAL DA PROPOSTA: ${formatBRL(pricingResult.preco_final)}
${
  descontoComercialPct > 0 || descontoFidelidade
    ? `(Valor de Tabela sem Descontos: ${formatBRL(pricingResult.preco_sem_desconto)})`
    : ''
}
========================================
SciTec jr. - Consultoria & Engenharia em Computação
    `.trim();

    navigator.clipboard.writeText(text);
    setCopiedProposal(true);
    toast.success('Resumo comercial copiado para a área de transferência!');
    setTimeout(() => setCopiedProposal(false), 3000);
  };

  // Send directly to Sales Pipeline (Kanban)
  const handleSendToFunnel = async () => {
    try {
      setIsSendingToPipe(true);

      const header: ProjectHeader = {
        cliente,
        nome_projeto: nomeProjeto,
        porte_cliente: porteCliente,
        nivel_experiencia: nivelExperiencia,
        nivel_complexidade: nivelComplexidade,
        urgencia,
        num_pessoas: Number(numPessoas) || 4,
        desconto_fidelidade: descontoFidelidade,
        desconto_comercial: (Number(descontoComercialPct) || 0) / 100,
      };

      const res = await fetch('/api/tools/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projeto: header,
          servicos,
          custos_extras: custosExtras,
          createCard: true,
          assigneeId: selectedAssignee || currentProfile?.id || null,
        }),
      });

      if (!res.ok) {
        throw new Error('Falha ao registrar card no funil de vendas.');
      }

      const data = await res.json();
      toast.success(
        `Card criado com sucesso no Funil de Vendas na fase "${data.card?.phase?.name || 'Proposta'}"!`,
        {
          action: {
            label: 'Ver Funil',
            onClick: () => {
              window.location.href = `/?openCard=${data.card?.id || ''}`;
            },
          },
        }
      );
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar no funil de vendas.');
    } finally {
      setIsSendingToPipe(false);
    }
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar />

      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Navigation Breadcrumb & Hero */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-purple-300/80">
            <Link
              href="/setores/negocios?tab=TOOLS"
              className="hover:text-purple-200 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Ferramentas de Negócios
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-purple-400 font-semibold">
              Motor de Simulação e Precificação
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadSpecificationExample}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-purple-950/80 border border-purple-700/60 text-purple-200 hover:bg-purple-900/60 hover:text-white transition-all flex items-center gap-2 shadow-sm"
              title="Carrega o cenário oficial da documentação (70h Front/Back, Média, R$ 3.850)"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Carregar Exemplo da Especificação
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all"
            >
              Limpar
            </button>
          </div>
        </div>

        <PageHeader
          icon={Calculator}
          title="Simulador de Preço & Escopo de Projetos"
          subtitle="Cálculo baseado em alocação de horas por especialidade, custos extras e fatores de mercado (porte, urgência, complexidade, experiência e fidelidade)."
        />
        {/* Main Content: Left Column Form, Right Column Realtime Results */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Inputs & Parameters (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* CARD 1: Dados Gerais e Modificadores */}
            <div className="rounded-2xl bg-slate-900/90 border border-purple-900/40 p-5 md:p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-purple-300 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-400" /> 1. Parâmetros do Projeto & Cliente
                </h2>
                <span className="text-[11px] text-slate-400 font-medium">Matriz de Modificadores</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="page-1" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome da Empresa / Cliente
                  </label>
                  <input id="page-1"
                    type="text"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    placeholder="Ex: Farmácia São Lucas ou BioTech"
                    className={`${CONTROL_CLASS} w-full`}
                  />
                </div>

                <div>
                  <label htmlFor="page-2" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome do Projeto / Escopo
                  </label>
                  <input id="page-2"
                    type="text"
                    value={nomeProjeto}
                    onChange={(e) => setNomeProjeto(e.target.value)}
                    placeholder="Ex: Plataforma E-commerce Custom"
                    className={`${CONTROL_CLASS} w-full`}
                  />
                </div>
              </div>

              {/* Modifiers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Porte do Cliente */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">Porte do Cliente</label>
                    <span className="text-[11px] font-bold text-purple-400">
                      +{(pricingResult.modificadores.porte * 100).toFixed(0)}%
                    </span>
                  </div>
                  <select
                    value={porteCliente}
                    onChange={(e) => setPorteCliente(e.target.value)}
                    className={`${CONTROL_CLASS} w-full`}
                  >
                    {CLIENT_SIZE_MODIFIERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} (+{(p.modifier * 100).toFixed(0)}%)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Urgência */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-400" /> Urgência do Projeto
                    </label>
                    <span className="text-[11px] font-bold text-amber-400">
                      +{(pricingResult.modificadores.urgencia * 100).toFixed(0)}%
                    </span>
                  </div>
                  <select
                    value={urgencia}
                    onChange={(e) => setUrgencia(e.target.value)}
                    className={`${CONTROL_CLASS} w-full`}
                  >
                    {URGENCY_MODIFIERS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label} (+{(u.modifier * 100).toFixed(0)}%)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Experiência da Equipe no Escopo */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-purple-400" /> Experiência no Escopo
                    </label>
                    <span
                      className={`text-[11px] font-bold ${
                        pricingResult.modificadores.experiencia < 0
                          ? 'text-emerald-400'
                          : pricingResult.modificadores.experiencia > 0
                          ? 'text-purple-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {pricingResult.modificadores.experiencia >= 0 ? '+' : ''}
                      {(pricingResult.modificadores.experiencia * 100).toFixed(0)}%
                    </span>
                  </div>
                  <select
                    value={nivelExperiencia}
                    onChange={(e) => setNivelExperiencia(Number(e.target.value))}
                    className={`${CONTROL_CLASS} w-full`}
                  >
                    {EXPERIENCE_MODIFIERS.map((e) => (
                      <option key={e.level} value={e.level}>
                        {e.label} ({e.modifier >= 0 ? '+' : ''}
                        {(e.modifier * 100).toFixed(0)}%)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Complexidade Técnica */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" /> Complexidade Técnica
                    </label>
                    <span
                      className={`text-[11px] font-bold ${
                        pricingResult.modificadores.complexidade < 0
                          ? 'text-emerald-400'
                          : pricingResult.modificadores.complexidade > 0
                          ? 'text-purple-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {pricingResult.modificadores.complexidade >= 0 ? '+' : ''}
                      {(pricingResult.modificadores.complexidade * 100).toFixed(0)}%
                    </span>
                  </div>
                  <select
                    value={nivelComplexidade}
                    onChange={(e) => setNivelComplexidade(Number(e.target.value))}
                    className={`${CONTROL_CLASS} w-full`}
                  >
                    {COMPLEXITY_MODIFIERS.map((c) => (
                      <option key={c.level} value={c.level}>
                        {c.label} ({c.modifier >= 0 ? '+' : ''}
                        {(c.modifier * 100).toFixed(0)}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Team size, Loyalty & Commercial Discount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-800/60">
                {/* Team Size */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-400" /> Equipe (Pessoas)
                    </label>
                    <span className="text-[11px] font-bold text-blue-400">
                      {pricingResult.modificadores.pessoas >= 0 ? '+' : ''}
                      {(pricingResult.modificadores.pessoas * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={numPessoas}
                    onChange={(e) => setNumPessoas(Math.max(1, Number(e.target.value)))}
                    className={`${CONTROL_CLASS} w-full`}
                  />
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Base: 4 pessoas (±5% por pessoa)
                  </span>
                </div>

                {/* Loyalty Discount Toggle */}
                <div className="flex flex-col justify-between">
                  <span className="text-xs font-semibold text-slate-300">Cliente Recorrente</span>
                  <label className="cursor-pointer flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-purple-800/50 transition-all">
                    <input
                      type="checkbox"
                      checked={descontoFidelidade}
                      onChange={(e) => setDescontoFidelidade(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 focus:ring-purple-500"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-white">Fidelidade</span>
                      <span className="block text-[11px] text-emerald-400 font-bold">-5% no projeto</span>
                    </div>
                  </label>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Bonificação institucional
                  </span>
                </div>

                {/* Commercial Discount */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <Percent className="w-3.5 h-3.5 text-emerald-400" /> Desconto Comercial
                    </label>
                    <span className="text-[11px] font-bold text-emerald-400">
                      -{descontoComercialPct}%
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={1}
                      value={descontoComercialPct}
                      onChange={(e) =>
                        setDescontoComercialPct(Math.min(50, Math.max(0, Number(e.target.value))))
                      }
                      className={`${CONTROL_CLASS} w-full pl-3 pr-8`}
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">%</span>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Negociação diretoria comercial
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 2: Alocação de Horas de Serviços Técnicos */}
            <div className="rounded-2xl bg-slate-900/90 border border-purple-900/40 p-5 md:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-purple-300 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-400" /> 2. Alocação de Horas Técnicas
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tabela oficial de Valor/Hora por especialidade técnica da SciTec jr.
                  </p>
                </div>

                <button
                  onClick={addServiceRow}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Cargo
                </button>
              </div>

              {/* Services Rows */}
              <div className="space-y-3">
                {servicos.map((serv, index) => {
                  const roleObj = ROLES_RATES.find((r) => r.cargo === serv.cargo);
                  const rate = roleObj ? roleObj.valorHora : 35.0;
                  const rowSubtotal = serv.horas * rate;

                  return (
                    <div
                      key={index}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col md:flex-row items-start md:items-center gap-3"
                    >
                      {/* Cargo Dropdown */}
                      <div className="flex-1 w-full">
                        <label htmlFor="page-3" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Função Técnica
                        </label>
                        <select id="page-3"
                          value={serv.cargo}
                          onChange={(e) => updateServiceRow(index, 'cargo', e.target.value)}
                          className={`${CONTROL_CLASS} w-full`}
                        >
                          {ROLES_RATES.map((role) => (
                            <option key={role.cargo} value={role.cargo}>
                              {role.cargo} — R$ {role.valorHora.toFixed(2)}/h
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Horas Input */}
                      <div className="w-full md:w-28">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Horas
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={serv.horas}
                            onChange={(e) => updateServiceRow(index, 'horas', e.target.value)}
                            className={`${CONTROL_CLASS} w-full`}
                          />
                          <span className="absolute right-2.5 top-1.5 text-xs text-slate-400">h</span>
                        </div>
                      </div>

                      {/* Descrição Opcional */}
                      <div className="flex-1 w-full">
                        <label htmlFor="page-4" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Atividades / Escopo Detalhado
                        </label>
                        <input id="page-4"
                          type="text"
                          value={serv.descricao || ''}
                          onChange={(e) => updateServiceRow(index, 'descricao', e.target.value)}
                          placeholder="Ex: Telas, endpoints ou arquitetura..."
                          className={`${CONTROL_CLASS} w-full`}
                        />
                      </div>

                      {/* Subtotal & Delete */}
                      <div className="w-full md:w-32 flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-4">
                        <div className="text-right">
                          <span className="text-[11px] text-slate-400 block">Subtotal</span>
                          <span className="text-xs font-bold text-purple-300">
                            {formatCurrency(rowSubtotal)}
                          </span>
                        </div>

                        <button
                          onClick={() => removeServiceRow(index)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Remover linha"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Subtotal of Hours */}
              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center justify-between text-xs">
                <span className="font-semibold text-purple-300">
                  Total de Horas: <strong className="text-white">{pricingResult.horas_totais}h</strong>
                </span>
                <span className="font-semibold text-purple-300">
                  Subtotal Mão de Obra Base:{' '}
                  <strong className="text-white text-sm">
                    {formatCurrency(pricingResult.preco_parcial_horas)}
                  </strong>
                </span>
              </div>
            </div>

            {/* CARD 3: Custos Diretos & Despesas Adicionais (Extras) */}
            <div className="rounded-2xl bg-slate-900/90 border border-purple-900/40 p-5 md:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-purple-300 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-purple-400" /> 3. Custos Diretos & Despesas Extras
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Infraestrutura, servidores, licenças de software e despesas de terceiros repassadas ao cliente.
                  </p>
                </div>

                <button
                  onClick={addExtraCostRow}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-700/40 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Despesa
                </button>
              </div>

              {custosExtras.length === 0 ? (
                <EmptyState title="Nenhuma despesa extra cadastrada neste projeto." className="p-4" />
              ) : (
                <div className="space-y-3">
                  {custosExtras.map((cost, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col md:flex-row items-start md:items-center gap-3"
                    >
                      <div className="flex-1 w-full">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Descrição da Despesa
                        </label>
                        <input
                          type="text"
                          value={cost.descricao}
                          onChange={(e) => updateExtraCostRow(idx, 'descricao', e.target.value)}
                          placeholder="Ex: Servidor AWS, Domínio, Licença de tema..."
                          className={`${CONTROL_CLASS} w-full`}
                        />
                      </div>

                      <div className="w-full md:w-36">
                        <label htmlFor="page-5" className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Valor (R$)
                        </label>
                        <input id="page-5"
                          type="number"
                          min={0}
                          step={10}
                          value={cost.valor_total}
                          onChange={(e) => updateExtraCostRow(idx, 'valor_total', e.target.value)}
                          className={`${CONTROL_CLASS} w-full`}
                        />
                      </div>

                      <div className="pt-2 md:pt-4">
                        <button
                          onClick={() => removeExtraCostRow(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Remover despesa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Subtotal Custos Extras:</span>
                <span className="font-bold text-slate-200">
                  {formatCurrency(pricingResult.total_custos_extras)}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Live Simulation & Results Dashboard (5 Cols, Sticky) */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6">
            {/* BIG HIGHLIGHT CARD: PREÇO FINAL */}
            <div className="rounded-3xl bg-gradient-to-b from-purple-900/60 via-slate-900 to-indigo-950/80 border-2 border-purple-500/50 p-6 md:p-7 shadow-2xl shadow-purple-950/50 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    Preço Final Sugerido
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Simulação Ativa
                  </span>
                </div>

                <div>
                  <h3 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-purple-200">
                    {formatCurrency(pricingResult.preco_final)}
                  </h3>

                  {(descontoComercialPct > 0 || descontoFidelidade) && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-slate-400 line-through">
                        {formatCurrency(pricingResult.preco_sem_desconto)}
                      </span>
                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                        Economia:{' '}
                        {formatCurrency(
                          pricingResult.preco_sem_desconto - pricingResult.preco_final
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick Metrics Bar */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-purple-800/40 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-purple-900/30">
                    <span className="text-slate-400 block text-[11px]">Horas Totais</span>
                    <span className="text-sm font-bold text-white">
                      {pricingResult.horas_totais} horas
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-purple-900/30">
                    <span className="text-slate-400 block text-[11px]">Modificador Global</span>
                    <span
                      className={`text-sm font-bold ${
                        pricingResult.modificadores.modificador_total >= 0
                          ? 'text-purple-300'
                          : 'text-emerald-300'
                      }`}
                    >
                      {pricingResult.modificadores.modificador_total >= 0 ? '+' : ''}
                      {(pricingResult.modificadores.modificador_total * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Breakdown Details */}
                <div className="space-y-2 pt-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Mão de Obra Base (Horas):</span>
                    <span className="font-semibold text-white">
                      {formatCurrency(pricingResult.preco_parcial_horas)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Impacto dos Modificadores:</span>
                    <span
                      className={`font-semibold ${
                        pricingResult.impactos_financeiros.total_acrescimos >= 0
                          ? 'text-purple-300'
                          : 'text-emerald-300'
                      }`}
                    >
                      {pricingResult.impactos_financeiros.total_acrescimos >= 0 ? '+' : ''}
                      {formatCurrency(pricingResult.impactos_financeiros.total_acrescimos)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Custos Extras / Infraestrutura:</span>
                    <span className="font-semibold text-white">
                      +{formatCurrency(pricingResult.total_custos_extras)}
                    </span>
                  </div>
                </div>

                {/* Formula Breakdown Details Drawer/List */}
                <div className="pt-3 border-t border-purple-800/40 space-y-2 text-[11px]">
                  <span className="font-bold uppercase tracking-wider text-purple-300 block">
                    Composição do Modificador ({(pricingResult.modificadores.modificador_total * 100).toFixed(1)}%)
                  </span>

                  <div className="grid grid-cols-2 gap-1.5 text-slate-400">
                    <div>• Porte ({porteCliente}):</div>
                    <div className="text-right text-slate-200 font-medium">
                      +{(pricingResult.modificadores.porte * 100).toFixed(0)}% (
                      {formatCurrency(pricingResult.impactos_financeiros.impacto_porte)})
                    </div>

                    <div>• Urgência ({urgencia}):</div>
                    <div className="text-right text-slate-200 font-medium">
                      +{(pricingResult.modificadores.urgencia * 100).toFixed(0)}% (
                      {formatCurrency(pricingResult.impactos_financeiros.impacto_urgencia)})
                    </div>

                    <div>• Experiência no Escopo:</div>
                    <div className="text-right text-slate-200 font-medium">
                      {pricingResult.modificadores.experiencia >= 0 ? '+' : ''}
                      {(pricingResult.modificadores.experiencia * 100).toFixed(0)}% (
                      {formatCurrency(pricingResult.impactos_financeiros.impacto_experiencia)})
                    </div>

                    <div>• Complexidade Técnica:</div>
                    <div className="text-right text-slate-200 font-medium">
                      {pricingResult.modificadores.complexidade >= 0 ? '+' : ''}
                      {(pricingResult.modificadores.complexidade * 100).toFixed(0)}% (
                      {formatCurrency(pricingResult.impactos_financeiros.impacto_complexidade)})
                    </div>

                    <div>• Equipe ({numPessoas} pessoas):</div>
                    <div className="text-right text-slate-200 font-medium">
                      {pricingResult.modificadores.pessoas >= 0 ? '+' : ''}
                      {(pricingResult.modificadores.pessoas * 100).toFixed(0)}% (
                      {formatCurrency(pricingResult.impactos_financeiros.impacto_pessoas)})
                    </div>

                    {descontoFidelidade && (
                      <>
                        <div className="text-emerald-400">• Desconto Fidelidade:</div>
                        <div className="text-right text-emerald-400 font-bold">
                          -5% ({formatCurrency(pricingResult.impactos_financeiros.impacto_fidelidade)})
                        </div>
                      </>
                    )}

                    {descontoComercialPct > 0 && (
                      <>
                        <div className="text-emerald-400">• Desconto Comercial:</div>
                        <div className="text-right text-emerald-400 font-bold">
                          -{descontoComercialPct}% (
                          {formatCurrency(
                            pricingResult.impactos_financeiros.impacto_desconto_comercial
                          )}
                          )
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="pt-4 space-y-3">
                  <button
                    onClick={handleCopyProposal}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 transition-all transform active:scale-95"
                  >
                    {copiedProposal ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-300" /> Resumo Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copiar Resumo Comercial
                      </>
                    )}
                  </button>

                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-purple-400" /> Enviar para Funil de Vendas
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={selectedAssignee}
                        onChange={(e) => setSelectedAssignee(e.target.value)}
                        className={`${CONTROL_CLASS} flex-1`}
                      >
                        <option value="">Responsável Comercial (Opcional)</option>
                        {profiles.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.title})
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={handleSendToFunnel}
                        disabled={isSendingToPipe}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {isSendingToPipe ? 'Enviando...' : 'Criar Card'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
