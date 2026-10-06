'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { useProfile } from '@/contexts/ProfileContext';
import { canUseNegociosTools, canViewUnit } from '@/lib/permissions';
import {
  Briefcase,
  Scale,
  Palette,
  Users,
  Wrench,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Zap,
  Lock,
  Calculator,
  Filter,
  FileSpreadsheet,
  DollarSign,
  Calendar,
  Award,
  Pickaxe,
} from 'lucide-react';

export default function ToolsHubPage() {
  const { currentProfile } = useProfile();
  const router = useRouter();
  const showLeadMiner = canUseNegociosTools(currentProfile);
  const userDept = currentProfile?.departmentCode ?? null;

  const sectorTools = [
    {
      id: 'negocios',
      name: 'Negócios',
      slug: 'negocios',
      deptCode: 'NEGOCIOS',
      color: 'purple',
      icon: Briefcase,
      summary: 'Comercial, Prospecção e Vendas',
      tagline: 'Ferramentas de Simulação, Precificação e Gestão de Leads Comerciais',
      features: [
        'Motor de Precificação Científica de Projetos (Valor/Hora & Modificadores)',
        'Triagem Rápida de Leads Comerciais (Aprovar / Descartar)',
        'Planilha Dinâmica de Importação e Anotação de Leads (Excel / CSV)',
        'Gerador de Propostas Comerciais com IA',
        'Disparador & Automação de WhatsApp SciTec',
        'Minerador de Leads B2B',
      ],
      activeCount: 4,
      totalCount: 6,
      borderColor: 'border-purple-500/40 hover:border-purple-500',
      badgeColor: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
      btnColor: 'from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500',
    },
    {
      id: 'admjurfin',
      name: 'AdmJurFin',
      slug: 'admjurfin',
      deptCode: 'ADMJURFIN',
      color: 'blue',
      icon: Scale,
      summary: 'Administrativo, Jurídico e Financeiro',
      tagline: 'Gestão Orçamentária, Minutas Contratuais e Emissão de Recibos PJ',
      features: [
        'Painel Financeiro & Extrato Operacional em Tempo Real',
        'Gerador de Minutas Contratuais & Termos de Parceria',
        'Emissor de Faturas, Recibos PJ e Comprovantes',
        'Simulador Tributário & Retenções ME / EPP / Simples Nacional',
      ],
      activeCount: 4,
      totalCount: 4,
      borderColor: 'border-blue-500/40 hover:border-blue-500',
      badgeColor: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
      btnColor: 'from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500',
    },
    {
      id: 'midias',
      name: 'Mídias',
      slug: 'midias',
      deptCode: 'MIDIAS',
      color: 'pink',
      icon: Palette,
      summary: 'Marketing, Produção e Design',
      tagline: 'Calendário Editorial, Brand Kit SciTec e Criação de Conteúdo',
      features: [
        'Calendário Editorial e Planejamento de Postagens',
        'Brand Kit & Repositório de Ativos Visuais SciTec',
        'Gerador de Briefings de Conteúdo & Copywriting com IA',
        'Central de Links e Campanhas de Divulgação',
      ],
      activeCount: 4,
      totalCount: 4,
      borderColor: 'border-pink-500/40 hover:border-pink-500',
      badgeColor: 'bg-pink-950/80 text-pink-300 border-pink-700/60',
      btnColor: 'from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500',
    },
    {
      id: 'gente',
      name: 'Gente',
      slug: 'gente',
      deptCode: 'GENTE',
      color: 'emerald',
      icon: Users,
      summary: 'Gestão de Pessoas, RH e Desempenho',
      tagline: 'Ocupação de Equipe, PDI, Avaliações 360° e Banco de Horas',
      features: [
        'Painel de Ocupação & Plano de Desenvolvimento Individual (PDI)',
        'Calculadora de Banco de Horas e Produtividade',
        'Matriz de Avaliação de Desempenho 360°',
        'Emissor de Certificados e Declarações de Membro SciTec',
      ],
      activeCount: 4,
      totalCount: 4,
      borderColor: 'border-emerald-500/40 hover:border-emerald-500',
      badgeColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
      btnColor: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar />

      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Banner Informativo */}
        <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-purple-950/70 border border-slate-800 p-8 shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 transform translate-x-10 -translate-y-10 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-purple-300 border border-purple-700/40">
              <Wrench className="w-3.5 h-3.5 text-purple-400" /> Ferramentas Especializadas por Setor
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white">
              Hub de Ferramentas SciTec jr.
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              As ferramentas agora são integradas e exclusivas de cada diretoria. Cada setor possui utilitários operacionais customizados para seu fluxo de trabalho, acessíveis diretamente na aba <strong className="text-purple-300">Ferramentas</strong> de cada setor.
            </p>
          </div>
        </div>

        {/* Card ativo: Minerador de Leads (Negócios) */}
        {showLeadMiner && (
          <Link
            href="/tools/lead-miner"
            aria-label="Abrir Minerador de Leads"
            onKeyDown={(e) => {
              // Enter já é nativo em <a>; Espaço precisa ser tratado.
              if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                router.push('/tools/lead-miner');
              }
            }}
            className="group block rounded-2xl p-6 border border-slate-800 bg-slate-900/80 hover:border-purple-500 hover:shadow-xl hover:shadow-purple-950/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl border bg-purple-950/80 text-purple-300 border-purple-700/60">
                  <Pickaxe className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-lg font-black text-white group-hover:text-purple-300 transition-colors">
                      Minerador de Leads
                    </h4>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ● Ativo
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                    Negócios · Mineração de empresas por bairro e nicho, análise de presença digital e ranking de prioridade para prospecção.
                  </p>
                </div>
              </div>
              <span className="shrink-0 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 group-hover:from-purple-500 group-hover:to-indigo-500 rounded-xl shadow-md flex items-center gap-2 transition-all">
                Abrir Minerador <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </div>
          </Link>
        )}
        {/* Grade de Ferramentas por Setor */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" /> Diretórios Operacionais Setoriais
            </h3>
            <span className="text-xs text-slate-400 font-medium">
              4 Diretorias com ferramentas dedicadas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sectorTools.map((sector) => {
              const IconComp = sector.icon;
              const isUserSector = userDept === sector.deptCode;
              const hasAccess = canViewUnit(currentProfile, sector.deptCode);

              return (
                <div
                  key={sector.id}
                  className={`group relative rounded-2xl p-6 border bg-slate-900/80 transition-all flex flex-col justify-between hover:shadow-xl ${
                    sector.borderColor
                  } ${isUserSector ? 'ring-1 ring-purple-500/50' : ''}`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl border ${sector.badgeColor}`}>
                          <IconComp className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xl font-black text-white group-hover:text-purple-300 transition-colors">
                              {sector.name}
                            </h4>
                            {isUserSector && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Seu Setor
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 font-medium">
                            {sector.summary}
                          </span>
                        </div>
                      </div>

                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-slate-800 text-slate-300 border-slate-700">
                        {sector.activeCount}/{sector.totalCount} módulos
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-medium leading-relaxed">
                      {sector.tagline}
                    </p>

                    {/* Lista de Recursos */}
                    <div className="space-y-1.5 pt-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Recursos & Módulos Inclusos:
                      </span>
                      <ul className="space-y-1">
                        {sector.features.map((feature, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-slate-300 flex items-start gap-2"
                          >
                            <span className="text-purple-400 font-bold shrink-0">•</span>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">
                      {hasAccess ? 'Exclusivo no espaço do setor' : 'Apenas membros do departamento e Presidência'}
                    </span>

                    {hasAccess && (
<Link
                      href={`/setores/${sector.slug}?tab=TOOLS`}
                      className={`px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r ${sector.btnColor} rounded-xl shadow-md flex items-center gap-2 transition-all transform hover:-translate-y-0.5`}
                    >
                      Acessar Ferramentas de {sector.name}{' '}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
