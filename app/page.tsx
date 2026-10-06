'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { useProfile } from '@/contexts/ProfileContext';
import {
  LayoutDashboard,
  Kanban,
  Wrench,
  TrendingUp,
  Users,
  Building2,
  ArrowRight,
  Zap,
  CheckSquare,
  Scale,
  Palette,
  Send,
  Calendar,
  DollarSign,
  Receipt,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Pipe, CrossDeptRequest } from '@/types';

export default function HomeDashboard() {
  const { currentProfile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    activeCards: 0,
    proposals: 0,
    won: 0,
    pendingLeads: 0,
    pendingRequests: 0,
  });
  const [recentRequests, setRecentRequests] = useState<CrossDeptRequest[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [pipesRes, leadsRes, reqsRes] = await Promise.all([
          fetch('/api/pipes'),
          fetch('/api/tools/leads'),
          fetch('/api/requests?status=PENDING'),
        ]);

        let activeCards = 0;
        let proposals = 0;
        let won = 0;

        if (pipesRes.ok) {
          const pipesData: Pipe[] = await pipesRes.json();
          pipesData.forEach((pipe) => {
            pipe.phases.forEach((phase) => {
              activeCards += phase.cards.length;
              if (phase.name.toLowerCase().includes('proposta')) {
                proposals += phase.cards.length;
              }
              if (
                phase.name.toLowerCase().includes('ganho') ||
                phase.name.toLowerCase().includes('fechado')
              ) {
                won += phase.cards.length;
              }
            });
          });
        }

        let pendingLeads = 0;
        if (leadsRes.ok) {
          const leadsData = await leadsRes.json();
          pendingLeads = leadsData.stats?.pending || 0;
        }

        let pendingRequests = 0;
        if (reqsRes.ok) {
          const reqsData = await reqsRes.json();
          if (Array.isArray(reqsData)) {
            pendingRequests = reqsData.length;
            setRecentRequests(reqsData.slice(0, 3));
          }
        }

        setMetrics({
          activeCards,
          proposals,
          won,
          pendingLeads,
          pendingRequests,
        });
      } catch (error) {
        console.error('Erro ao carregar métricas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const sectorWorkspaces = [
    {
      id: 'negocios',
      name: 'Negócios & Comercial',
      desc: 'CRM de Vendas, Prospecção B2B, Diagnóstico Técnico e Precificação de Projetos.',
      icon: Building2,
      href: '/setores/negocios',
      badge: 'Comercial & Vendas',
      color: 'from-purple-950/80 via-slate-900 to-indigo-950/80 border-purple-800/40 hover:border-purple-500',
      iconColor: 'bg-purple-950/80 border-purple-800/60 text-purple-400',
    },
    {
      id: 'admjurfin',
      name: 'AdmJurFin',
      desc: 'Emissão de Contratos, Minutas, Faturamento, Cobranças e Fluxo de Caixa Integrado.',
      icon: Scale,
      href: '/setores/admjurfin',
      badge: 'Jurídico & Financeiro',
      color: 'from-blue-950/80 via-slate-900 to-indigo-950/80 border-blue-800/40 hover:border-blue-500',
      iconColor: 'bg-blue-950/80 border-blue-800/60 text-blue-400',
    },
    {
      id: 'gente',
      name: 'Gente & Gestão',
      desc: 'Processo Seletivo de Trainees, Onboarding, Ciclos de PDI e Acompanhamento 360.',
      icon: Users,
      href: '/setores/gente',
      badge: 'Gestão de Pessoas & RH',
      color: 'from-amber-950/80 via-slate-900 to-purple-950/80 border-amber-800/40 hover:border-amber-500',
      iconColor: 'bg-amber-950/80 border-amber-800/60 text-amber-400',
    },
    {
      id: 'midias',
      name: 'Mídias & Marketing',
      desc: 'Produção de Conteúdo, Criação de Artes/Copy, Calendário Editorial e Redes.',
      icon: Palette,
      href: '/setores/midias',
      badge: 'Marketing & Design',
      color: 'from-pink-950/80 via-slate-900 to-purple-950/80 border-pink-800/40 hover:border-pink-500',
      iconColor: 'bg-pink-950/80 border-pink-800/60 text-pink-400',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white">
      <SciTecNavbar />

      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Welcome Banner */}
        <div className="relative rounded-3xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-800/40 px-6 py-4 md:px-8 md:py-5 shadow-2xl overflow-hidden flex items-center justify-between">
          <div className="absolute top-0 right-0 transform translate-x-10 -translate-y-10 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              ScitecJr
            </h2>
          </div>

          <div className="relative z-10 shrink-0">
            <img
              src="/brand/mascote.png"
              alt="Mascote SciTec jr."
              className="h-16 sm:h-20 md:h-24 w-auto object-contain filter drop-shadow-lg"
            />
          </div>
        </div>

        {/* Global Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Cards Ativos</span>
              <div className="p-1.5 rounded-xl bg-purple-950/40 text-purple-400">
                <Kanban className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {loading ? <span className="text-slate-700 animate-pulse">--</span> : metrics.activeCards}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Propostas</span>
              <div className="p-1.5 rounded-xl bg-amber-950/40 text-amber-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {loading ? <span className="text-slate-700 animate-pulse">--</span> : metrics.proposals}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Fechado/Ganho</span>
              <div className="p-1.5 rounded-xl bg-emerald-950/40 text-emerald-400">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {loading ? <span className="text-slate-700 animate-pulse">--</span> : metrics.won}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Leads Triagem</span>
              <div className="p-1.5 rounded-xl bg-indigo-950/40 text-indigo-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {loading ? <span className="text-slate-700 animate-pulse">--</span> : metrics.pendingLeads}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col gap-2 col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Solicitações entre setores</span>
              <div className="p-1.5 rounded-xl bg-rose-950/40 text-rose-400">
                <Send className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rose-400">
              {loading ? <span className="text-slate-700 animate-pulse">--</span> : metrics.pendingRequests}
            </div>
          </div>
        </div>

        {/* WORKSPACES POR DIRETORIA / SETOR */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-purple-300/80 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" /> Diretorias & Workspaces Especializados
            </h3>
            <span className="text-xs text-slate-400 font-medium">4 Setores Ativos</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {sectorWorkspaces.map((sec) => {
              const Icon = sec.icon;
              return (
                <Link key={sec.id} href={sec.href} className="group block h-full">
                  <div
                    className={`h-full rounded-2xl p-6 border bg-gradient-to-r ${sec.color} transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl group-hover:shadow-2xl`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className={`p-3 rounded-xl border ${sec.iconColor}`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-slate-700 text-slate-300">
                          {sec.badge}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                          {sec.name}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {sec.desc}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 group-hover:text-white transition-colors">
                      <span className="font-medium text-[11px]">Acessar Workspace</span>
                      <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* RECENT CROSS-DEPT REQUESTS PREVIEW */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-purple-300/80 flex items-center gap-2">
              <Send className="w-4 h-4 text-purple-400" /> Central de Solicitações Intersetoriais
            </h3>
            <Link
              href="/requests"
              className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
            >
              Ver Todas as Solicitações <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
            {recentRequests.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Nenhuma solicitação pendente no momento.
              </div>
            ) : (
              recentRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{req.title}</span>
                      <span className="text-[11px] text-purple-400 font-semibold">
                        {req.fromDept} <ArrowRight className="inline w-3 h-3" aria-label="para" /> {req.toDept}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] line-clamp-1">{req.description}</p>
                  </div>

                  <Link
                    href="/requests"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-purple-900/60 text-purple-300 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                  >
                    Atender <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Global Quick Utilities */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <Link
            href="/tasks"
            className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-emerald-600/50 flex items-center gap-3 transition-all"
          >
            <div className="p-2 rounded-lg bg-emerald-950/40 text-emerald-400">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-xs font-bold text-white">Minhas Tarefas</h5>
              <p className="text-[11px] text-slate-400">Tarefas atribuídas nominalmente</p>
            </div>
          </Link>

          {(() => {
            const userDept = currentProfile?.departmentCode ?? null;
            const isSectorUser = Boolean(userDept);
            const toolsHref = userDept ? `/setores/${userDept.toLowerCase()}?tab=TOOLS` : '/tools';
            const sectorName =
              userDept === 'NEGOCIOS'
                ? 'Negócios'
                : userDept === 'ADMJURFIN'
                ? 'AdmJurFin'
                : userDept === 'MIDIAS'
                ? 'Mídias'
                : userDept === 'GENTE'
                ? 'Gente'
                : null;

            return (
              <Link
                href={toolsHref}
                className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-purple-600/50 flex items-center gap-3 transition-all"
              >
                <div className="p-2 rounded-lg bg-purple-950/40 text-purple-400">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">
                    {sectorName ? `Ferramentas de ${sectorName}` : 'Ferramentas dos Setores'}
                  </h5>
                  <p className="text-[11px] text-slate-400">
                    {sectorName ? 'Utilitários exclusivos do seu setor' : 'Módulos operacionais de cada diretoria'}
                  </p>
                </div>
              </Link>
            );
          })()}

          <Link
            href="/team"
            className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-blue-600/50 flex items-center gap-3 transition-all"
          >
            <div className="p-2 rounded-lg bg-blue-950/40 text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-xs font-bold text-white">Equipe & Membros</h5>
              <p className="text-[11px] text-slate-400">Perfis internos e diretoria</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
