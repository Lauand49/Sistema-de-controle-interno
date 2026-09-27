'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/contexts/ProfileContext';
import { User, UserRole } from '@/types';
import {
  Sparkles,
  ShieldCheck,
  Briefcase,
  Layers,
  ArrowRight,
  Search,
  LogIn,
  UserPlus,
  Crown,
  X,
} from 'lucide-react';
import { getUserCargoTitle } from '@/types';
import { toast } from 'sonner';

export default function LoginPage() {
  const { profiles, login, loading, refreshProfiles } = useProfile();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('ASSESSOR');
  const [formDept, setFormDept] = useState<string>('NEGOCIOS');
  const [formCargo, setFormCargo] = useState('');
  const [formAvatar, setFormAvatar] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getRoleBadge = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'PRESIDENTE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-950">
            <Crown className="w-3.5 h-3.5 text-amber-400" /> Presidente
          </span>
        );
      case 'GERENTE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
            <Briefcase className="w-3 h-3 text-blue-400" /> Gerente
          </span>
        );
      case 'ASSESSOR':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <Layers className="w-3 h-3 text-emerald-400" /> Assessor
          </span>
        );
    }
  };

  const handleSelectUser = (user: User) => {
    login(user);
    toast.success(`Conectado com sucesso como ${user.name}!`);
    router.push('/tasks');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      toast.error('Informe nome e e-mail.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          role: formRole,
          primaryDept: formRole === 'PRESIDENTE' ? 'GLOBAL' : formDept,
          cargo: formCargo.trim() || undefined,
          avatar: formAvatar.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao cadastrar.');
      }

      const createdUser: User = await res.json();
      await refreshProfiles();
      setIsCreateModalOpen(false);
      handleSelectUser(createdUser);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar perfil.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProfiles = profiles.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      p.role.toLowerCase().includes(search.toLowerCase()) ||
      (p.cargo && p.cargo.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 relative overflow-hidden selection:bg-purple-500 selection:text-white">
      {/* Background glow decorations */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-3xl space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-700/50 shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Acesso ao Sistema Interno
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="w-12 h-12 rounded-2xl bg-purple-900/90 border border-purple-500/50 p-2 flex items-center justify-center shadow-lg shadow-purple-900/40">
              <img
                src="/brand/scitec-icon.png"
                alt="SciTec jr."
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">SciTec jr.</h1>
          </div>

          <h2 className="text-xl font-bold text-slate-200">Quem está acessando o sistema?</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Selecione o seu perfil na hierarquia da SciTec jr. para entrar e visualizar suas tarefas e responsabilidades:
          </p>
        </div>

        {/* Search & Action Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar por nome, cargo ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-2xl border border-slate-800 bg-slate-900/90 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-lg"
            />
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 text-xs font-bold text-purple-300 hover:text-white bg-purple-950/60 hover:bg-purple-900/70 border border-purple-800/50 rounded-2xl flex items-center gap-2 transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4" /> Novo Perfil
          </button>
        </div>

        {/* Profiles Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-32 rounded-3xl bg-slate-900/40 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="text-center py-12 rounded-3xl bg-slate-900/40 border border-slate-800/80 p-6 space-y-3">
            <p className="text-xs text-slate-400">Nenhum perfil encontrado com esse termo.</p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl"
            >
              Criar meu perfil
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProfiles.map((user) => {
              const isPres = user.role?.toUpperCase() === 'PRESIDENTE';
              const cargoTitle = user.cargo || getUserCargoTitle(user);

              return (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={`group text-left p-4 rounded-3xl border transition-all duration-200 flex flex-col justify-between gap-3 ${
                    isPres
                      ? 'bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900/90 border-amber-500/40 hover:border-amber-400/80 shadow-lg shadow-amber-950/20'
                      : 'bg-slate-900/80 hover:bg-slate-850 border-slate-800 hover:border-purple-600/70 shadow-lg hover:shadow-xl hover:shadow-purple-950/40'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <img
                      src={
                        user.avatar ||
                        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                          user.name
                        )}`
                      }
                      alt={user.name}
                      className={`w-12 h-12 rounded-2xl object-cover border-2 group-hover:scale-105 transition-transform shrink-0 ${
                        isPres ? 'border-amber-500/60' : 'border-purple-500/30'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors truncate">
                        {user.name}
                      </div>
                      <div className={`text-[11px] font-bold truncate mt-0.5 ${
                        isPres ? 'text-amber-300' : 'text-purple-300'
                      }`}>
                        {cargoTitle}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">{user.email}</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                    <div>{getRoleBadge(user.role)}</div>
                    <div
                      className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all ${
                        isPres
                          ? 'bg-amber-950/60 group-hover:bg-amber-500 text-amber-300 group-hover:text-slate-950'
                          : 'bg-slate-800 group-hover:bg-purple-600 text-slate-400 group-hover:text-white'
                      }`}
                    >
                      <span className="text-[10px] font-bold">Acessar</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500">
          SciTec jr. • Cada membro visualiza apenas as demandas e tarefas atribuídas ao seu cargo e setor.
        </p>
      </div>

      {/* Modal: Create Profile */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-purple-400" />
                <h3 className="font-bold text-white text-base">Novo Perfil de Membro</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Nome Completo <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Seu nome completo"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  E-mail institucional / contato <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="seu.email@scitecjr.com.br"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Hierarquia */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  Hierarquia Principal <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormRole('PRESIDENTE');
                      setFormDept('GLOBAL');
                      setFormCargo('Presidente Institucional');
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                      formRole === 'PRESIDENTE'
                        ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Crown className="w-4 h-4 text-amber-400" />
                    Presidente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormRole('GERENTE');
                      const deptName = formDept === 'NEGOCIOS' ? 'Negócios' : formDept === 'MIDIAS' ? 'Mídias' : formDept === 'ADMJURFIN' ? 'AdmJurFin' : 'Gente';
                      setFormCargo(`Gerente de ${deptName}`);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                      formRole === 'GERENTE'
                        ? 'bg-blue-950/80 border-blue-600 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Briefcase className="w-4 h-4 text-blue-400" />
                    Gerente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormRole('ASSESSOR');
                      const deptName = formDept === 'NEGOCIOS' ? 'Negócios' : formDept === 'MIDIAS' ? 'Mídias' : formDept === 'ADMJURFIN' ? 'AdmJurFin' : 'Gente';
                      setFormCargo(`Assessor(a) de ${deptName}`);
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                      formRole === 'ASSESSOR'
                        ? 'bg-emerald-950/80 border-emerald-600 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Assessor
                  </button>
                </div>
              </div>

              {/* Setor (se Gerente ou Assessor) */}
              {formRole !== 'PRESIDENTE' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Setor / Diretoria</label>
                  <select
                    value={formDept}
                    onChange={(e) => {
                      const newDept = e.target.value;
                      setFormDept(newDept);
                      const deptLabel = newDept === 'NEGOCIOS' ? 'Negócios' : newDept === 'MIDIAS' ? 'Mídias' : newDept === 'ADMJURFIN' ? 'AdmJurFin' : 'Gente';
                      setFormCargo(formRole === 'GERENTE' ? `Gerente de ${deptLabel}` : `Assessor(a) de ${deptLabel}`);
                    }}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="NEGOCIOS">Negócios & Comercial</option>
                    <option value="MIDIAS">Mídias & Marketing</option>
                    <option value="ADMJURFIN">AdmJurFin</option>
                    <option value="GENTE">Gente & Gestão</option>
                  </select>
                </div>
              )}

              {/* Cargo Formal */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Cargo Formal <span className="text-slate-500 font-normal">(exibido no sistema)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Gerente de Negócios"
                  value={formCargo}
                  onChange={(e) => setFormCargo(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl disabled:opacity-50"
                >
                  {submitting ? 'Criando...' : 'Criar e Entrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
