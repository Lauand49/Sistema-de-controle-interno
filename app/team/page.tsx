'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  ClipboardList,
  Clock,
  History,
  Kanban,
  Network,
  Search,
  Settings2,
  Sparkles,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { useProfile } from '@/contexts/ProfileContext';
import type { User } from '@/types';
import {
  DEPARTMENTS,
  PERSON_TYPE_LABEL,
  type PersonType,
  canApproveUserInto,
  canChangeDepartment,
  canDeactivate,
  canManageManagers,
  canManageSectorMembers,
  canManageVice,
  canViewAudit,
  canViewPendingUsers,
  isDepartmentManager,
  isGlobal,
  unitName,
  SECTORS,
} from '@/lib/permissions';
import { PersonTypeBadge } from '@/components/ui/PersonTypeBadge';
import { ManageMemberModal } from '@/components/team/ManageMemberModal';
import { teamApi } from '@/components/team/teamApi';
import { PageHeader, EmptyState } from '@/components/ui/Display';
import { Tabs } from '@/components/ui/Tabs';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

type Tab = 'MEMBROS' | 'PENDENTES' | 'INATIVOS' | 'UNIDADES' | 'AUDITORIA';

interface UnitSummary {
  id: string;
  code: string;
  name: string;
  type: 'DEPARTAMENTO' | 'SETOR';
  manager: { id: string; name: string; avatar: string | null } | null;
  memberCount: number;
}

interface AuditEntry {
  id: string;
  action: string;
  createdAt: string;
  before: unknown;
  after: unknown;
  actor: { id: string; name: string } | null;
  targetUser: { id: string; name: string } | null;
  unit: { code: string; name: string } | null;
}

const AUDIT_LABELS: Record<string, string> = {
  USER_REGISTERED: 'Primeiro acesso (pendente)',
  BOOTSTRAP_ADMIN: 'Presidência por ADMIN_EMAILS',
  USER_APPROVED: 'Aprovação',
  DEPARTMENT_CHANGED: 'Transferência de departamento',
  VICE_APPOINTED: 'Nomeação de Vice',
  VICE_REMOVED: 'Remoção de Vice',
  USER_DEACTIVATED: 'Desativação',
  USER_REACTIVATED: 'Reativação',
  SECTOR_MEMBER_ADDED: 'Entrada em setor',
  SECTOR_MEMBER_REMOVED: 'Saída de setor',
  MANAGER_APPOINTED: 'Nomeação de gerente',
  MANAGER_DEMOTED: 'Gerente substituído',
  MANAGER_REMOVED: 'Remoção de gerente',
};

const avatarOf = (u: { name: string; avatar?: string | null }) =>
  u.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}`;

const tabBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${active ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
  }`;

export default function TeamPage() {
  const { currentProfile: actor, profiles, loading, refreshProfiles, refreshMe } = useProfile();
  const [tab, setTab] = useState<Tab>('MEMBROS');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | PersonType>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pending, setPending] = useState<User[]>([]);
  const [inactive, setInactive] = useState<User[]>([]);
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [approveDept, setApproveDept] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const canSeePending = canViewPendingUsers(actor);
  const canSeeInactive = isGlobal(actor) || isDepartmentManager(actor);
  const canSeeAudit = canViewAudit(actor);

  const loadExtra = useCallback(async () => {
    const get = async <T,>(url: string, fallback: T): Promise<T> => {
      const res = await fetch(url);
      return res.ok ? res.json() : fallback;
    };
    const [p, i, u, a] = await Promise.all([
      canSeePending ? get<User[]>('/api/users?status=PENDENTE', []) : Promise.resolve([]),
      canSeeInactive ? get<User[]>('/api/users?status=INATIVO', []) : Promise.resolve([]),
      get<UnitSummary[]>('/api/units', []),
      canSeeAudit ? get<AuditEntry[]>('/api/audit?limit=100', []) : Promise.resolve([]),
    ]);
    setPending(p);
    setInactive(i);
    setUnits(u);
    setAuditLogs(a);
  }, [canSeePending, canSeeInactive, canSeeAudit]);

  useEffect(() => {
    if (actor) loadExtra();
  }, [actor, loadExtra]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshProfiles(), loadExtra(), refreshMe()]);
  }, [refreshProfiles, loadExtra, refreshMe]);

  // Opções de departamento para aprovação: Presidência escolhe qualquer; gerente só o seu.
  const approvalDepartments = useMemo(
    () => DEPARTMENTS.filter((d) => canApproveUserInto(actor, d.code)),
    [actor]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((u) => {
      const matchesSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.title.toLowerCase().includes(q) ||
        u.sectors.some((s) => s.name.toLowerCase().includes(q));
      const matchesType = typeFilter === 'ALL' || u.personType === typeFilter;
      const matchesDept =
        deptFilter === 'ALL' ||
        (deptFilter === 'PRESIDENCIA' ? u.globalRole !== null : u.departmentCode === deptFilter);
      return matchesSearch && matchesType && matchesDept;
    });
  }, [profiles, search, typeFilter, deptFilter]);

  const selected = useMemo(
    () => (selectedId ? profiles.find((p) => p.id === selectedId) || null : null),
    [selectedId, profiles]
  );

  const hasActionsFor = (u: User) =>
    !!actor &&
    (canChangeDepartment(actor) ||
      canManageManagers(actor) ||
      (canManageVice(actor) && u.id !== actor.id) ||
      canDeactivate(actor, u) ||
      SECTORS.some((s) => canManageSectorMembers(actor, s.code)));

  const handleApprove = async (u: User) => {
    const code = approveDept[u.id] || approvalDepartments[0]?.code;
    if (!code) return;
    setBusyId(u.id);
    try {
      await teamApi.hierarchy(u.id, { action: 'APPROVE', departmentCode: code });
      toast.success(`${u.name} aprovado(a) em ${unitName(code)}.`);
      await refreshAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (u: User) => {
    if (!window.confirm(`Recusar o acesso de ${u.email}? A conta ficará desativada.`)) return;
    setBusyId(u.id);
    try {
      await teamApi.hierarchy(u.id, { action: 'DEACTIVATE' });
      toast.success('Acesso recusado.');
      await refreshAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReactivate = async (u: User) => {
    const code = u.departmentCode || approveDept[u.id] || approvalDepartments[0]?.code;
    setBusyId(u.id);
    try {
      await teamApi.hierarchy(u.id, { action: 'REACTIVATE', departmentCode: code });
      toast.success(`${u.name} reativado(a).`);
      await refreshAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of profiles) counts[u.personType] = (counts[u.personType] || 0) + 1;
    return counts;
  }, [profiles]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white">
      <SciTecNavbar />

      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        <PageHeader
          icon={Users}
          title="Equipe da SciTec jr."
          subtitle="Cada pessoa pertence a um departamento e pode participar de vários setores. Novos acessos pelo Google ficam pendentes até um gerente aprovar. Toda mudança de cargo ou vínculo fica registrada na auditoria."
        />
        <Tabs
          ariaLabel="Seções da equipe"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'MEMBROS' as const, label: 'Membros', icon: Users, count: profiles.length },
            ...(canSeePending ? [{ id: 'PENDENTES' as const, label: 'Pendentes', icon: Clock, count: pending.length }] : []),
            ...(canSeeInactive ? [{ id: 'INATIVOS' as const, label: 'Inativos', icon: UserX, count: inactive.length }] : []),
            { id: 'UNIDADES' as const, label: 'Departamentos e setores', icon: Network },
            ...(canSeeAudit ? [{ id: 'AUDITORIA' as const, label: 'Auditoria', icon: History }] : []),
          ]}
        />
        {tab === 'MEMBROS' && (
          <section aria-label="Membros ativos" className="space-y-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-3" aria-hidden="true" />
                <label htmlFor="team-search" className="sr-only">
                  Buscar membros
                </label>
                <Input
                  id="team-search"
                  type="search"
                  placeholder="Buscar por nome, e-mail, cargo ou setor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 placeholder:text-slate-400"
                />
              </div>
              <label htmlFor="type-filter" className="sr-only">
                Filtrar por tipo
              </label>
              <Select
                id="type-filter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                
              >
                <option value="ALL">Todos os tipos</option>
                {(Object.keys(PERSON_TYPE_LABEL) as PersonType[]).map((t) => (
                  <option key={t} value={t}>
                    {PERSON_TYPE_LABEL[t]} ({typeCounts[t] || 0})
                  </option>
                ))}
              </Select>
              <label htmlFor="dept-filter" className="sr-only">
                Filtrar por departamento
              </label>
              <Select
                id="dept-filter"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                
              >
                <option value="ALL">Todos os departamentos</option>
                <option value="PRESIDENCIA">Presidência</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-44 rounded-2xl bg-slate-900/40 border border-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState title="Nenhum membro encontrado com os filtros atuais." />
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((u) => {
                  const isMe = actor?.id === u.id;
                  return (
                    <li
                      key={u.id}
                      className={`rounded-2xl border p-5 flex flex-col gap-4 ${u.globalRole
                          ? 'bg-gradient-to-b from-amber-950/20 to-slate-900/90 border-amber-500/40'
                          : isMe
                            ? 'bg-gradient-to-b from-purple-950/40 to-slate-900/90 border-purple-600/60'
                            : 'bg-slate-900/50 border-slate-800'
                        }`}
                    >
                      <div className="flex items-start gap-3">
                        <img src={avatarOf(u)} alt="" className="w-12 h-12 rounded-xl object-cover border border-purple-500/30" />
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-white truncate">
                            {u.name} {isMe && <span className="text-[11px] text-purple-300">(você)</span>}
                          </h3>
                          <p className="text-[11px] text-purple-300 truncate">{u.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                        </div>
                        {hasActionsFor(u) && (
                          <button
                            type="button"
                            onClick={() => setSelectedId(u.id)}
                            className="p-2 rounded-xl bg-slate-800/80 hover:bg-purple-950/60 text-slate-300 hover:text-purple-200 border border-slate-700"
                            aria-label={`Gerenciar ${u.name}`}
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <PersonTypeBadge type={u.personType} />
                        {u.departmentCode && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800/40">
                            {unitName(u.departmentCode)}
                          </span>
                        )}
                        {u.sectors.map((s) => (
                          <span
                            key={s.code}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700"
                          >
                            {s.name}
                            {s.role === 'GERENTE' ? ' • Gerente' : ''}
                          </span>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800">
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <Kanban className="w-4 h-4 text-purple-400" aria-hidden="true" />
                          <span>
                            <strong className="text-white">{u._count?.assignedCards || 0}</strong> cards
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <CheckSquare className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                          <span>
                            <strong className="text-white">{u._count?.assignedTasks || 0}</strong> tarefas
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === 'PENDENTES' && canSeePending && (
          <section aria-label="Aguardando aprovação" className="space-y-3">
            {pending.length === 0 ? (
              <EmptyState title="Nenhum acesso aguardando aprovação." />
            ) : (
              pending.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <img src={avatarOf(u)} alt="" className="w-10 h-10 rounded-xl object-cover" />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-white truncate">{u.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {u.email} • primeiro acesso em {u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <label htmlFor={`approve-${u.id}`} className="sr-only">
                      Departamento de {u.name}
                    </label>
                    <Select
                      id={`approve-${u.id}`}
                      value={approveDept[u.id] || approvalDepartments[0]?.code || ''}
                      onChange={(e) => setApproveDept((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      
                    >
                      {approvalDepartments.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" type="button" disabled={busyId === u.id || approvalDepartments.length === 0} onClick={() => handleApprove(u)}>
                      <UserCheck className="w-4 h-4" aria-hidden="true" /> Aprovar
                    </Button>
                    {actor && canDeactivate(actor, u) && (
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => handleReject(u)}
                        className="px-3 py-2 text-xs font-bold rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 disabled:opacity-50"
                      >
                        Recusar
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {tab === 'INATIVOS' && canSeeInactive && (
          <section aria-label="Contas desativadas" className="space-y-3">
            {inactive.length === 0 ? (
              <EmptyState title="Nenhuma conta desativada." />
            ) : (
              inactive.map((u) => (
                <div key={u.id} className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <img src={avatarOf(u)} alt="" className="w-10 h-10 rounded-xl object-cover grayscale" />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-white truncate">{u.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {u.email} • {u.departmentCode ? unitName(u.departmentCode) : 'sem departamento'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!u.departmentCode && (
                      <Select
                        aria-label={`Departamento para reativar ${u.name}`}
                        value={approveDept[u.id] || approvalDepartments[0]?.code || ''}
                        onChange={(e) => setApproveDept((prev) => ({ ...prev, [u.id]: e.target.value }))}
                        
                      >
                        {approvalDepartments.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                    )}
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => handleReactivate(u)}
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-800 border border-slate-700 text-slate-200 disabled:opacity-50"
                    >
                      Reativar
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {tab === 'UNIDADES' && (
          <section aria-label="Departamentos e setores" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(['DEPARTAMENTO', 'SETOR'] as const).map((type) => (
              <div key={type} className="space-y-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-purple-400" aria-hidden="true" />
                  {type === 'DEPARTAMENTO' ? 'Departamentos' : 'Setores'}
                </h2>
                <ul className="space-y-2">
                  {units
                    .filter((u) => u.type === type)
                    .map((u) => (
                      <li key={u.code} className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-white">{u.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {u.memberCount} membro(s) ativo(s)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase font-bold text-slate-400">Gerente</p>
                          {u.manager ? (
                            <p className="text-xs font-semibold text-purple-300">{u.manager.name}</p>
                          ) : (
                            <p className="text-xs text-amber-300/80">Vago</p>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <p className="lg:col-span-2 text-[11px] text-slate-400">
              Para nomear gerentes ou mover pessoas entre setores, abra o membro na aba Membros (ícone de engrenagem).
            </p>
          </section>
        )}

        {tab === 'AUDITORIA' && canSeeAudit && (
          <section aria-label="Auditoria" className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-x-auto">
            {auditLogs.length === 0 ? (
              <EmptyState title="Nenhum registro no seu escopo." />
            ) : (
              <table className="w-full min-w-[640px] text-xs">
                <thead className="text-left text-slate-400 border-b border-slate-800">
                  <tr>
                    <th scope="col" className="p-3">Quando</th>
                    <th scope="col" className="p-3">Ação</th>
                    <th scope="col" className="p-3">Quem fez</th>
                    <th scope="col" className="p-3">Pessoa</th>
                    <th scope="col" className="p-3">Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-800/60">
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-3 text-white">{AUDIT_LABELS[log.action] || log.action}</td>
                      <td className="p-3 text-slate-300">{log.actor?.name || 'Sistema'}</td>
                      <td className="p-3 text-slate-300">{log.targetUser?.name || '—'}</td>
                      <td className="p-3 text-slate-300">{log.unit?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>

      {selected && actor && (
        <ManageMemberModal actor={actor} target={selected} onClose={() => setSelectedId(null)} onChanged={refreshAll} />
      )}
    </div>
  );
}
