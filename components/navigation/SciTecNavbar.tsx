'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Kanban,
  Sparkles,
  Plus,
  Search,
  RefreshCw,
  Users,
  CheckSquare,
  Building2,
  Scale,
  Palette,
  Send,
  ChevronDown,
  Layers,
  LayoutDashboard,
  Menu,
  X,
  Home,
} from 'lucide-react';
import { ProfileSwitcher } from './ProfileSwitcher';
import { CreateRequestModal } from '../modals/CreateRequestModal';
import { CONTROL_CLASS } from '@/components/ui/Input';

interface SciTecNavbarProps {
  onRefresh?: () => void;
  loading?: boolean;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  onNewCardClick?: () => void;
  pipeName?: string;
}

export const SciTecNavbar: React.FC<SciTecNavbarProps> = ({
  onRefresh,
  loading = false,
  searchQuery = '',
  onSearchChange,
  onNewCardClick,
  pipeName,
}) => {
  const pathname = usePathname();
  const [isSectorDropdownOpen, setIsSectorDropdownOpen] = useState(false);
  const [isCreateRequestOpen, setIsCreateRequestOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsSectorDropdownOpen(false);
  }, [pathname]);

  const isHomeActive = pathname === '/';
  const isTasksActive = pathname.startsWith('/tasks');
  const isTeamActive = pathname.startsWith('/team');
  const isRequestsActive = pathname.startsWith('/requests');
  const isPaineisActive = pathname.startsWith('/paineis');

  const isNegociosActive = pathname === '/setores/negocios' || pathname === '/pipe';
  const isAdmJurFinActive = pathname === '/setores/admjurfin';
  const isGenteActive = pathname === '/setores/gente';
  const isMidiasActive = pathname === '/setores/midias';
  const isAnySectorActive = pathname.startsWith('/setores') || isNegociosActive;

  // Fetch pending requests count
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/requests?status=PENDING');
        if (res.ok) {
          const data = await res.json();
          setPendingRequestsCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {
        // silent fallback
      }
    };
    fetchPending();
  }, []);

  const sectors = [
    {
      id: 'negocios',
      name: 'Negócios & Comercial',
      href: '/setores/negocios',
      icon: Building2,
      desc: 'Funil CRM, Leads e Precificação',
      color: 'text-purple-400',
    },
    {
      id: 'admjurfin',
      name: 'AdmJurFin',
      href: '/setores/admjurfin',
      icon: Scale,
      desc: 'Contratos, Faturamento & Fluxo de Caixa',
      color: 'text-blue-400',
    },
    {
      id: 'gente',
      name: 'Gente & Gestão',
      href: '/setores/gente',
      icon: Users,
      desc: 'Processo Seletivo, Onboarding & PDI',
      color: 'text-amber-400',
    },
    {
      id: 'midias',
      name: 'Mídias & Marketing',
      href: '/setores/midias',
      icon: Palette,
      desc: 'Produção de Conteúdo & Calendário Editorial',
      color: 'text-pink-400',
    },
  ];

  return (
    <>
      <header className="bg-gradient-to-r from-slate-950 via-purple-950/60 to-slate-950 border-b border-purple-900/40 sticky top-0 z-30 backdrop-blur-md">
        <div className="px-4 lg:px-6 py-2.5 flex items-center justify-between gap-4">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-3 group min-w-0 shrink-0">
              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300"></div>
                <div className="relative w-9 h-9 rounded-xl bg-purple-900/80 border border-purple-500/40 p-1.5 flex items-center justify-center overflow-hidden">
                  <img
                    src="/brand/scitec-icon.png"
                    alt="SciTec jr."
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-purple-300 bg-purple-950/80 border border-purple-700/50 px-2 py-0.2 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-400" /> SciTec jr. OS
                  </span>
                </div>
                <h1 title={pipeName || undefined} className="text-sm lg:text-base font-black text-white tracking-tight mt-0.5 truncate max-w-[140px] sm:max-w-[160px] 2xl:max-w-[260px]">
                  {pipeName || 'Sistema Integrado da EJ'}
                </h1>
              </div>
            </Link>

            {/* Navigation Tabs (Desktop xl+) */}
            <nav className="hidden xl:flex items-center gap-0.5 2xl:gap-1 bg-slate-900/80 p-1 rounded-xl border border-purple-900/40">
              <Link
                href="/"
                aria-label="Início"
                title="Início"
                className={`px-2 2xl:px-3 min-h-10 text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${isHomeActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-purple-200/70 hover:text-white hover:bg-purple-950/40'
                  }`}
              >
                <Home className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">Início</span>
              </Link>

              {/* Workspaces / Setores Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Setores"
                  title="Setores"
                  aria-expanded={isSectorDropdownOpen}
                  onClick={() => setIsSectorDropdownOpen(!isSectorDropdownOpen)}
                  className={`px-2 2xl:px-3 min-h-10 text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${isAnySectorActive
                    ? 'bg-purple-900/80 text-white border border-purple-600/40'
                    : 'text-purple-200/70 hover:text-white hover:bg-purple-950/40'
                    }`}
                >
                  <Layers className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
                  <span className="hidden xl:inline">Setores</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${isSectorDropdownOpen ? 'rotate-180' : ''
                      }`}
                  />
                </button>

                {isSectorDropdownOpen && (
                  <div
                    onMouseLeave={() => setIsSectorDropdownOpen(false)}
                    className="absolute left-0 mt-2 w-72 bg-slate-900 border border-purple-800/60 rounded-2xl shadow-2xl p-2 z-50 animate-fadeIn"
                  >
                    <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-400 border-b border-slate-800 mb-1">
                      Diretorias & Áreas de Trabalho
                    </div>

                    {sectors.map((sec) => {
                      const Icon = sec.icon;
                      const isActive =
                        (sec.id === 'negocios' && isNegociosActive) ||
                        (sec.id === 'admjurfin' && isAdmJurFinActive) ||
                        (sec.id === 'gente' && isGenteActive) ||
                        (sec.id === 'midias' && isMidiasActive);

                      return (
                        <Link
                          key={sec.id}
                          href={sec.href}
                          onClick={() => setIsSectorDropdownOpen(false)}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl transition-all ${isActive
                            ? 'bg-purple-950/80 text-white border border-purple-700/50'
                            : 'hover:bg-slate-800/80 text-slate-300 hover:text-white'
                            }`}
                        >
                          <div className={`p-1.5 rounded-lg bg-slate-950 border border-slate-800 ${sec.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-xs text-white">{sec.name}</div>
                            <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                              {sec.desc}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Central de Solicitações */}
              <Link
                href="/requests"
                aria-label="Solicitações"
                title="Solicitações"
                className={`px-2 2xl:px-3 min-h-10 text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${isRequestsActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-purple-200/70 hover:text-white hover:bg-purple-950/40'
                  }`}
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden xl:inline">Solicitações</span>
                {pendingRequestsCount > 0 && (
                  <span className="bg-amber-500/20 text-amber-300 text-[11px] px-1.5 py-0.2 rounded-full border border-amber-500/40">
                    {pendingRequestsCount}
                  </span>
                )}
              </Link>

              <Link
                href="/tasks"
                aria-label="Minhas Tarefas"
                title="Minhas Tarefas"
                className={`px-2 2xl:px-3 min-h-10 text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${isTasksActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-purple-200/70 hover:text-white hover:bg-purple-950/40'
                  }`}
              >
                <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden xl:inline 2xl:hidden">Tarefas</span><span className="hidden 2xl:inline">Minhas Tarefas</span>
              </Link>

              <Link
                href="/team"
                aria-label="Equipe"
                title="Equipe"
                className={`px-2 2xl:px-3 min-h-10 text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${isTeamActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-purple-200/70 hover:text-white hover:bg-purple-950/40'
                  }`}
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden xl:inline">Equipe</span>
              </Link>

              <Link
                href="/paineis"
                aria-label="Painéis"
                title="Painéis"
                className={`px-2 2xl:px-3 min-h-10 text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${isPaineisActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-purple-200/70 hover:text-white hover:bg-purple-950/40'
                  }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden xl:inline">Painéis</span>
              </Link>
            </nav>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {onSearchChange && (
              <div className="relative hidden md:block">
                <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-3" aria-hidden="true" />
                <input
                  type="text"
                  aria-label="Buscar no funil" placeholder="Buscar no funil..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className={`${CONTROL_CLASS} pl-8 pr-3 placeholder:text-purple-300/40 w-32 lg:w-44`}
                />
              </div>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                title="Atualizar dados"
                aria-label="Atualizar dados"
                className="min-w-10 min-h-10 inline-flex items-center justify-center p-1.5 text-purple-300 hover:text-white rounded-xl bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-400' : ''}`} />
              </button>
            )}

            {/* Global Button: Nova Solicitação (hidden on small screens, accessible via mobile menu) */}
            <button
              onClick={() => setIsCreateRequestOpen(true)}
              className="hidden sm:flex min-h-10 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-purple-950/80 border border-purple-700/50 hover:border-purple-500 rounded-xl shadow-md items-center gap-1.5 transition-all"
              title="Criar solicitação entre diretorias"
              aria-label="Nova solicitação"
            >
              <Send className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden 2xl:inline">Nova solicitação</span>
            </button>

            {/* Optional New Card Button */}
            {onNewCardClick && (
              <button
                onClick={onNewCardClick}
                aria-label="Novo card"
                title="Novo card"
                className="min-h-10 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-purple-900/40 flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden 2xl:inline">Novo Card</span>
              </button>
            )}

            {/* Profile Switcher */}
            <div className="pl-1 border-l border-purple-900/40">
              <ProfileSwitcher />
            </div>

            {/* Mobile & Tablet Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
              aria-expanded={isMobileMenuOpen}
              className="min-w-10 min-h-10 inline-flex items-center justify-center p-1.5 text-purple-300 hover:text-white rounded-xl bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/40 transition-colors xl:hidden relative"
            >
              {isMobileMenuOpen ? (
                <X className="w-4 h-4 text-purple-300" />
              ) : (
                <Menu className="w-4 h-4 text-purple-300" />
              )}
              {pendingRequestsCount > 0 && !isMobileMenuOpen && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-slate-950 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile & Tablet Slide-down Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="xl:hidden bg-slate-950/95 border-b border-purple-900/50 backdrop-blur-xl px-4 py-3 space-y-3 animate-fadeIn shadow-2xl">
            {onSearchChange && (
              <div className="relative md:hidden pb-1">
                <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-3" aria-hidden="true" />
                <input
                  type="text"
                  aria-label="Buscar no funil" placeholder="Buscar no funil..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className={`${CONTROL_CLASS} w-full pl-8 pr-3 placeholder:text-purple-300/40`}
                />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${isHomeActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'bg-slate-900/80 text-purple-200/80 hover:text-white hover:bg-purple-950/50 border border-slate-800'
                  }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Início
              </Link>

              <Link
                href="/requests"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center justify-between gap-1 transition-all ${isRequestsActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'bg-slate-900/80 text-purple-200/80 hover:text-white hover:bg-purple-950/50 border border-slate-800'
                  }`}
              >
                <div className="flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-purple-400" /> Solicitações
                </div>
                {pendingRequestsCount > 0 && (
                  <span className="bg-amber-500/20 text-amber-300 text-[11px] px-1.5 py-0.2 rounded-full border border-amber-500/40">
                    {pendingRequestsCount}
                  </span>
                )}
              </Link>

              <Link
                href="/tasks"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${isTasksActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'bg-slate-900/80 text-purple-200/80 hover:text-white hover:bg-purple-950/50 border border-slate-800'
                  }`}
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> Tarefas
              </Link>

              <Link
                href="/team"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${isTeamActive
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'bg-slate-900/80 text-purple-200/80 hover:text-white hover:bg-purple-950/50 border border-slate-800'
                  }`}
              >
                <Users className="w-3.5 h-3.5 text-blue-400" /> Equipe
              </Link>

              <Link
                href="/paineis"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all ${isPaineisActive
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                    : 'bg-slate-900/80 text-purple-200/80 hover:text-white hover:bg-purple-950/50 border border-slate-800'
                  }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-indigo-400" /> Painéis
              </Link>

              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsCreateRequestOpen(true);
                }}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-purple-950/80 border border-purple-700/60 text-purple-300 hover:text-white flex items-center gap-1.5 transition-all text-left"
              >
                <Send className="w-3.5 h-3.5 text-purple-400" /> Nova Solicitação
              </button>
            </div>

            {/* Mobile Workspaces list */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400 mb-1.5 px-1">
                Workspaces por Diretoria
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {sectors.map((sec) => {
                  const Icon = sec.icon;
                  return (
                    <Link
                      key={sec.id}
                      href={sec.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/70 hover:bg-purple-950/40 flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-all"
                    >
                      <Icon className={`w-3.5 h-3.5 ${sec.color}`} />
                      <span className="truncate">{sec.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Global Create Request Modal */}
      <CreateRequestModal
        isOpen={isCreateRequestOpen}
        onClose={() => setIsCreateRequestOpen(false)}
        onSuccess={() => {
          onRefresh?.();
        }}
      />
    </>
  );
};
