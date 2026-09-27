'use client';

import React, { useState } from 'react';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { useProfile } from '@/contexts/ProfileContext';
import { User, UserRole, getUserCargoTitle } from '@/types';
import {
  Users,
  UserPlus,
  Crown,
  Briefcase,
  Layers,
  Kanban,
  CheckCircle,
  Edit2,
  Trash2,
  Sparkles,
  Check,
  Search,
  CheckSquare,
  ShieldCheck,
  Building2,
  Scale,
  Palette,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export default function TeamPage() {
  const { currentProfile, setCurrentProfile, profiles, loading, refreshProfiles } = useProfile();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'PRESIDENTE' | 'GERENTE' | 'ASSESSOR'>('ALL');
  const [deptFilter, setDeptFilter] = useState<'ALL' | 'NEGOCIOS' | 'MIDIAS' | 'ADMJURFIN' | 'GENTE' | 'GLOBAL'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('ASSESSOR');
  const [formDept, setFormDept] = useState<string>('NEGOCIOS');
  const [formCargo, setFormCargo] = useState<string>('');
  const [formAvatar, setFormAvatar] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Helper to suggest standard cargo title
  const getSuggestedCargo = (role: string, dept: string) => {
    if (role === 'PRESIDENTE') return 'Presidente Institucional';
    const deptMap: Record<string, string> = {
      NEGOCIOS: 'Negócios',
      MIDIAS: 'Mídias',
      ADMJURFIN: 'AdmJurFin',
      GENTE: 'Gente',
      GLOBAL: 'Geral',
    };
    const deptName = deptMap[dept] || dept;
    if (role === 'GERENTE') return `Gerente de ${deptName}`;
    if (role === 'ASSESSOR') return `Assessor(a) de ${deptName}`;
    return role;
  };

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormRole('ASSESSOR');
    setFormDept('NEGOCIOS');
    setFormCargo('Assessor de Negócios');
    setFormAvatar('');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    const userRole = (user.role as UserRole) || 'ASSESSOR';
    const userDept = (user.primaryDept as string) || (userRole === 'PRESIDENTE' ? 'GLOBAL' : 'NEGOCIOS');
    setFormRole(userRole);
    setFormDept(userDept);
    setFormCargo(user.cargo || getUserCargoTitle(user));
    setFormAvatar(user.avatar || '');
    setIsModalOpen(true);
  };

  // Submit modal (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      toast.error('Preencha o nome e o e-mail do membro.');
      return;
    }

    setSubmitting(true);
    try {
      const primaryDept = formRole === 'PRESIDENTE' ? 'GLOBAL' : formDept;
      const cargo = formCargo.trim() || getSuggestedCargo(formRole, primaryDept);

      if (editingUser) {
        // Update
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            email: formEmail.trim(),
            role: formRole,
            primaryDept,
            cargo,
            avatar: formAvatar.trim() || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Erro ao atualizar membro.');
        }

        toast.success(`Membro ${formName} atualizado com sucesso!`);
      } else {
        // Create
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            email: formEmail.trim(),
            role: formRole,
            primaryDept,
            cargo,
            avatar: formAvatar.trim() || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Erro ao cadastrar membro.');
        }

        toast.success(`Membro ${formName} cadastrado com sucesso!`);
      }

      await refreshProfiles();
      setIsModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Ocorreu um erro.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Tem certeza que deseja remover o membro "${user.name}"?`)) return;

    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao remover membro.');
      }

      toast.success(`Membro ${user.name} removido com sucesso.`);
      await refreshProfiles();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover membro.');
    }
  };

  // Filtered Users
  const filteredProfiles = profiles.filter((user) => {
    const q = searchQuery.toLowerCase();
    const cargo = (user.cargo || getUserCargoTitle(user)).toLowerCase();
    const matchesSearch =
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      cargo.includes(q) ||
      user.role.toLowerCase().includes(q);

    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
    const matchesDept = deptFilter === 'ALL' || (user.primaryDept || 'GLOBAL') === deptFilter;

    return matchesSearch && matchesRole && matchesDept;
  });

  const countByRole = {
    presidente: profiles.filter((u) => u.role === 'PRESIDENTE').length,
    gerentes: profiles.filter((u) => u.role === 'GERENTE').length,
    assessores: profiles.filter((u) => u.role === 'ASSESSOR').length,
  };

  const getRoleBadge = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'PRESIDENTE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/30 to-yellow-500/20 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-950">
            <Crown className="w-3.5 h-3.5 text-amber-400" /> Presidente
          </span>
        );
      case 'GERENTE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm shadow-blue-950">
            <Briefcase className="w-3 h-3 text-blue-400" /> Gerente
          </span>
        );
      case 'ASSESSOR':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-950">
            <Layers className="w-3 h-3 text-emerald-400" /> Assessor
          </span>
        );
    }
  };

  const getDeptBadge = (dept?: string) => {
    switch (dept?.toUpperCase()) {
      case 'NEGOCIOS':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800/40">
            <Building2 className="w-3 h-3 text-purple-400" /> Negócios
          </span>
        );
      case 'MIDIAS':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-950/80 text-pink-300 border border-pink-800/40">
            <Palette className="w-3 h-3 text-pink-400" /> Mídias
          </span>
        );
      case 'ADMJURFIN':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/40">
            <Scale className="w-3 h-3 text-blue-400" /> AdmJurFin
          </span>
        );
      case 'GENTE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/40">
            <Users className="w-3 h-3 text-amber-400" /> Gente
          </span>
        );
      case 'GLOBAL':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700">
            <Crown className="w-3 h-3 text-amber-400" /> Institucional
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white">
      <SciTecNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6 md:space-y-8">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 md:p-8 rounded-3xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-800/40 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 transform translate-x-12 -translate-y-12 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-700/50">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Sistema de Hierarquia & Cargos
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Membros & Organograma da <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">SciTec jr.</span>
            </h2>
            <p className="text-xs md:text-sm text-purple-200/80 max-w-2xl leading-relaxed">
              Estrutura hierárquica diferenciada por <strong>Cargos</strong>: Presidência Institucional, Gerentes de cada diretoria (Negócios, Mídias, AdmJurFin e Gente) e seus respectivos Assessores.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-2xl shadow-lg shadow-purple-900/40 flex items-center gap-2 transition-all active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Novo Membro
            </button>
          </div>
        </div>

        {/* Filters and Stats Bar */}
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Role Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/80 border border-slate-800 overflow-x-auto">
              <button
                onClick={() => setRoleFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  roleFilter === 'ALL'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Todos ({profiles.length})
              </button>
              <button
                onClick={() => setRoleFilter('PRESIDENTE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  roleFilter === 'PRESIDENTE'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-950/50'
                    : 'text-amber-300/80 hover:text-amber-300 hover:bg-slate-800'
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                Presidente ({countByRole.presidente})
              </button>
              <button
                onClick={() => setRoleFilter('GERENTE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  roleFilter === 'GERENTE'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-blue-300/80 hover:text-blue-300 hover:bg-slate-800'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                Gerentes ({countByRole.gerentes})
              </button>
              <button
                onClick={() => setRoleFilter('ASSESSOR')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  roleFilter === 'ASSESSOR'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-emerald-300/80 hover:text-emerald-300 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                Assessores ({countByRole.assessores})
              </button>
            </div>

            {/* Search Box */}
            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Buscar por nome, cargo ou e-mail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-2xl border border-slate-800 bg-slate-900/90 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>
          </div>

          {/* Department Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
              Filtrar por Setor:
            </span>
            {[
              { id: 'ALL', label: 'Todos os Setores' },
              { id: 'GLOBAL', label: 'Presidência (Geral)' },
              { id: 'NEGOCIOS', label: 'Negócios' },
              { id: 'MIDIAS', label: 'Mídias' },
              { id: 'ADMJURFIN', label: 'AdmJurFin' },
              { id: 'GENTE', label: 'Gente' },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setDeptFilter(d.id as any)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  deptFilter === d.id
                    ? 'bg-purple-950 border border-purple-500 text-purple-200'
                    : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Member Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-56 rounded-3xl bg-slate-900/40 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="text-center py-16 rounded-3xl bg-slate-900/30 border border-slate-800/60 p-8">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Nenhum membro encontrado</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
              Não encontramos nenhum membro com os filtros atuais de hierarquia e setor.
            </p>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl transition-colors inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" /> Cadastrar Novo Membro
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProfiles.map((user) => {
              const isCurrent = currentProfile?.id === user.id;
              const isPres = user.role?.toUpperCase() === 'PRESIDENTE';
              const cargoTitle = user.cargo || getUserCargoTitle(user);

              return (
                <div
                  key={user.id}
                  className={`relative rounded-3xl border transition-all duration-200 flex flex-col justify-between overflow-hidden p-6 ${
                    isPres
                      ? 'bg-gradient-to-b from-amber-950/20 via-slate-900 to-slate-900/90 border-amber-500/50 shadow-xl shadow-amber-950/20'
                      : isCurrent
                      ? 'bg-gradient-to-b from-purple-950/40 to-slate-900/90 border-purple-600/70 shadow-xl shadow-purple-950/50'
                      : 'bg-slate-900/40 hover:bg-slate-900/70 border-slate-800/80 hover:border-slate-700 shadow-md'
                  }`}
                >
                  {/* Top Bar with Status / Current operator badge */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="relative">
                        <img
                          src={
                            user.avatar ||
                            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                              user.name
                            )}`
                          }
                          alt={user.name}
                          className={`w-14 h-14 rounded-2xl object-cover border-2 shadow-md ${
                            isPres ? 'border-amber-500/60' : 'border-purple-500/30'
                          }`}
                        />
                        {isCurrent && (
                          <div
                            title="Operador Ativo no Sistema"
                            className="absolute -bottom-1 -right-1 p-1 bg-emerald-500 text-slate-950 rounded-full shadow-lg"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-2 rounded-xl bg-slate-800/80 hover:bg-purple-950/60 hover:text-purple-300 text-slate-400 border border-slate-700/60 transition-colors"
                          title="Editar Membro"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 border border-slate-700/60 transition-colors"
                          title="Remover Membro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Member Info */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-lg text-white tracking-tight">{user.name}</h3>
                        {getRoleBadge(user.role)}
                      </div>

                      {/* Official Cargo in bold highlight */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${
                          isPres ? 'text-amber-300' : 'text-purple-300'
                        }`}>
                          {cargoTitle}
                        </span>
                        {getDeptBadge(user.primaryDept)}
                      </div>

                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    </div>

                    {/* Metrics / Workload Stats */}
                    <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-800/80">
                      <div className="p-2.5 rounded-2xl bg-slate-950/50 border border-slate-800 flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-purple-950/60 text-purple-400">
                          <Kanban className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">
                            {user._count?.assignedCards || 0}
                          </div>
                          <div className="text-[10px] text-slate-400">Cards no Funil</div>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-slate-950/50 border border-slate-800 flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-emerald-950/60 text-emerald-400">
                          <CheckSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">
                            {user._count?.assignedTasks || 0}
                          </div>
                          <div className="text-[10px] text-slate-400">Tarefas no Sistema</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="mt-5 pt-4 border-t border-slate-800/80">
                    {isCurrent ? (
                      <div className="w-full py-2 px-3 rounded-xl bg-purple-950/60 border border-purple-600/40 text-purple-300 text-xs font-bold flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-purple-400" /> Operador Atual no Sistema
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setCurrentProfile(user);
                          toast.success(`Você agora está operando como ${user.name}`);
                        }}
                        className={`w-full py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isPres
                            ? 'bg-amber-950/40 hover:bg-amber-500 hover:text-slate-950 border-amber-500/40 text-amber-300'
                            : 'bg-slate-800 hover:bg-purple-900/60 hover:border-purple-600/50 border-slate-700/80 text-slate-300 hover:text-white'
                        }`}
                      >
                        Operar como {user.name.split(' ')[0]}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Create or Edit Member */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5 animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-400">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {editingUser ? 'Editar Membro' : 'Novo Membro da SciTec jr.'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Defina a hierarquia, setor e cargo oficial
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Nome */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Nome Completo <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* E-mail */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    E-mail institucional / contato <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Ex: joao@scitecjr.com.br"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Hierarquia Principal (PRESIDENTE, GERENTE, ASSESSOR) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Hierarquia Principal <span className="text-rose-400">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Presidente */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormRole('PRESIDENTE');
                        setFormDept('GLOBAL');
                        setFormCargo('Presidente Institucional');
                      }}
                      className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                        formRole === 'PRESIDENTE'
                          ? 'bg-amber-950/80 border-amber-500 text-white shadow-lg shadow-amber-950'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Crown
                        className={`w-5 h-5 ${
                          formRole === 'PRESIDENTE' ? 'text-amber-400' : 'text-slate-500'
                        }`}
                      />
                      <span className="text-xs font-bold">Presidente</span>
                    </button>

                    {/* Gerente */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormRole('GERENTE');
                        const dept = formDept === 'GLOBAL' ? 'NEGOCIOS' : formDept;
                        setFormDept(dept);
                        setFormCargo(getSuggestedCargo('GERENTE', dept));
                      }}
                      className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                        formRole === 'GERENTE'
                          ? 'bg-blue-950/80 border-blue-600 text-white shadow-lg shadow-blue-950'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Briefcase
                        className={`w-5 h-5 ${
                          formRole === 'GERENTE' ? 'text-blue-400' : 'text-slate-500'
                        }`}
                      />
                      <span className="text-xs font-bold">Gerente</span>
                    </button>

                    {/* Assessor */}
                    <button
                      type="button"
                      onClick={() => {
                        setFormRole('ASSESSOR');
                        const dept = formDept === 'GLOBAL' ? 'NEGOCIOS' : formDept;
                        setFormDept(dept);
                        setFormCargo(getSuggestedCargo('ASSESSOR', dept));
                      }}
                      className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                        formRole === 'ASSESSOR'
                          ? 'bg-emerald-950/80 border-emerald-600 text-white shadow-lg shadow-emerald-950'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Layers
                        className={`w-5 h-5 ${
                          formRole === 'ASSESSOR' ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      />
                      <span className="text-xs font-bold">Assessor</span>
                    </button>
                  </div>
                </div>

                {/* Setor (apenas se Gerente ou Assessor) */}
                {formRole !== 'PRESIDENTE' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Setor / Diretoria de Atuação <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={formDept}
                      onChange={(e) => {
                        const newDept = e.target.value;
                        setFormDept(newDept);
                        setFormCargo(getSuggestedCargo(formRole, newDept));
                      }}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="NEGOCIOS">Diretoria de Negócios & Comercial</option>
                      <option value="MIDIAS">Diretoria de Mídias & Marketing</option>
                      <option value="ADMJURFIN">Diretoria AdmJurFin</option>
                      <option value="GENTE">Diretoria de Gente & Gestão</option>
                    </select>
                  </div>
                )}

                {/* Cargo Formal Customizável */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Cargo Formal / Nomeação <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Gerente de Negócios"
                    value={formCargo}
                    onChange={(e) => setFormCargo(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Nome do cargo exibido nos cards, funis e tarefas designadas.
                  </span>
                </div>

                {/* Avatar URL (Optional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    URL da Foto de Perfil <span className="text-slate-500 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://... (deixe em branco para gerar avatar automático)"
                    value={formAvatar}
                    onChange={(e) => setFormAvatar(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-purple-900/40 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Salvando...' : editingUser ? 'Salvar Alterações' : 'Cadastrar Membro'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
