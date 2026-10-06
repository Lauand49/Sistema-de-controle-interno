'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Pipe, User } from '@/types';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { CreateCardModal } from '@/components/modals/CreateCardModal';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { useProfile } from '@/contexts/ProfileContext';
import {
  TrendingUp,
  DollarSign,
  Briefcase,
  Users,
  Cpu,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { canEditUnit, unitName } from '@/lib/permissions';

function DashboardContent() {
  const searchParams = useSearchParams();
  const openCardId = searchParams.get('openCard');
  const { currentProfile } = useProfile();

  const [pipe, setPipe] = useState<Pipe | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const pipeDepartment = pipe?.department || 'NEGOCIOS';
  const canEditSector = canEditUnit(currentProfile, pipeDepartment);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pipesRes, usersRes] = await Promise.all([
        fetch('/api/pipes'),
        fetch('/api/users'),
      ]);

      if (!pipesRes.ok || !usersRes.ok) {
        throw new Error('Erro ao carregar dados do servidor.');
      }

      const pipesData = await pipesRes.json();
      const usersData = await usersRes.json();

      if (pipesData && pipesData.length > 0) {
        setPipe(pipesData[0]);
      }
      setUsers(usersData);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter cards by search query
  const filteredPipe = pipe
    ? {
        ...pipe,
        phases: pipe.phases.map((phase) => ({
          ...phase,
          cards: phase.cards.filter((card) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            const titleMatch = card.title.toLowerCase().includes(q);
            const companyValue = card.values?.find(
              (v) => v.field?.name === 'company_name'
            )?.value;
            const companyMatch = companyValue
              ? companyValue.toLowerCase().includes(q)
              : false;
            return titleMatch || companyMatch;
          }),
        })),
      }
    : null;

  // Calculate Pipeline Metrics
  const totalCardsCount = pipe
    ? pipe.phases.reduce((acc, p) => acc + p.cards.length, 0)
    : 0;

  let totalPipelineValue = 0;
  let totalWonValue = 0;

  if (pipe) {
    pipe.phases.forEach((phase) => {
      phase.cards.forEach((card) => {
        card.values.forEach((v) => {
          if (v.field?.type === 'CURRENCY' && v.value) {
            const num = parseFloat(v.value) || 0;
            totalPipelineValue += num;
            if (phase.name.toLowerCase().includes('ganho') || phase.name.toLowerCase().includes('fechado')) {
              totalWonValue += num;
            }
          }
        });
      });
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white">
      {/* SciTec Navbar */}
      <SciTecNavbar
        onRefresh={fetchData}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewCardClick={canEditSector ? () => setIsCreateModalOpen(true) : undefined}
        pipeName={pipe?.name}
      />

      {/* Metrics Subbar */}
      {pipe && (
        <div className="px-6 py-2.5 bg-purple-950/30 border-b border-purple-900/20 flex items-center gap-8 text-xs text-purple-200/80 overflow-x-auto">
          <div className="flex items-center gap-2 font-medium">
            <div className="p-1 rounded bg-purple-900/40 text-purple-300">
              <Briefcase className="w-3.5 h-3.5" />
            </div>
            <span>
              Projetos no Funil: <strong className="text-white font-bold">{totalCardsCount}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 font-medium">
            <div className="p-1 rounded bg-amber-900/40 text-amber-300">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
            <span>
              Pipeline Total:{' '}
              <strong className="text-white font-bold">
                R$ {totalPipelineValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 font-medium">
            <div className="p-1 rounded bg-emerald-900/40 text-emerald-300">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <span>
              Fechado / Ganho:{' '}
              <strong className="text-emerald-400 font-bold">
                R$ {totalWonValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2 font-medium ml-auto">
            <div className="p-1 rounded bg-indigo-900/40 text-indigo-300">
              <Users className="w-3.5 h-3.5" />
            </div>
            <span>
              Membros SciTec: <strong className="text-white font-bold">{users.length} consultores</strong>
            </span>
          </div>
        </div>
      )}

      {/* Read-Only Mode Banner if not permitted to edit this pipe */}
      {!canEditSector && (
        <div className="mx-6 mt-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 p-3.5 flex items-center justify-between gap-3 text-amber-200 text-xs shadow-md">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Modo Somente Leitura:</strong> Você está visualizando o funil de {pipeDepartment} como membro de {unitName(currentProfile?.departmentCode)}. Edições e movimentações de cards estão desabilitadas.
            </span>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 uppercase shrink-0">
            Consulta
          </span>
        </div>
      )}

      {/* Main Kanban Board */}
      <main className="flex-1">
        {loading && !pipe ? (
          <div className="flex flex-col items-center justify-center h-96 space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
              <Cpu className="w-5 h-5 text-purple-400 absolute left-3.5 top-3.5" />
            </div>
            <p className="text-sm font-semibold text-purple-300/80">
              Carregando processos SciTec jr....
            </p>
          </div>
        ) : filteredPipe ? (
          <KanbanBoard
            pipe={filteredPipe}
            users={users}
            onRefresh={fetchData}
            highlightCardId={openCardId}
            readOnly={!canEditSector}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-96 space-y-3">
            <p className="text-sm font-medium text-purple-300/60">Nenhum pipe encontrado.</p>
          </div>
        )}
      </main>

      {/* Create Card Modal */}
      {isCreateModalOpen && pipe && (
        <CreateCardModal
          phaseId={pipe.phases[0]?.id || ''}
          phases={pipe.phases}
          users={users}
          onClose={() => setIsCreateModalOpen(false)}
          onCardCreated={() => {
            fetchData();
            setIsCreateModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-purple-300">
          <div className="w-8 h-8 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin mr-3" />
          <span>Carregando SciTec jr....</span>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
