'use client';

import React, { useState } from 'react';
import { Building2, Crown, Layers, ShieldOff, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '@/types';
import {
  DEPARTMENTS,
  SECTORS,
  canChangeDepartment,
  canDeactivate,
  canManageManagers,
  canManageSectorMembers,
  canManageVice,
  unitName,
} from '@/lib/permissions';
import { PersonTypeBadge } from '@/components/ui/PersonTypeBadge';
import { setManagerWithConfirm, teamApi } from './teamApi';
import { ModalFrame } from '@/components/ui/Modal';

interface Props {
  actor: User;
  target: User;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

const selectClass =
  'px-3 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500';
const btn =
  'px-3 py-2 text-xs font-bold rounded-xl border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btn} bg-purple-600 hover:bg-purple-500 border-purple-500 text-white`;
const btnGhost = `${btn} bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200`;
const btnDanger = `${btn} bg-rose-950/60 hover:bg-rose-900/60 border-rose-800/60 text-rose-300`;

/** Ações de hierarquia sobre um membro, exibidas conforme lib/permissions. */
export const ManageMemberModal: React.FC<Props> = ({ actor, target, onClose, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [dept, setDept] = useState<string>(target.departmentCode || 'NEGOCIOS');

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      const result = await fn();
      if (result !== false) {
        toast.success(success);
        await onChanged();
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao aplicar a alteração.');
    } finally {
      setBusy(false);
    }
  };

  const isSelf = actor.id === target.id;
  const hasGlobal = target.globalRole !== null;
  const showDepartment = canChangeDepartment(actor) && !hasGlobal && target.status === 'ATIVO';
  const showDeptManager = canManageManagers(actor) && !hasGlobal && !!target.departmentCode;
  const showVice = canManageVice(actor) && !isSelf && target.globalRole !== 'PRESIDENTE';
  const manageableSectors = SECTORS.filter((s) => canManageSectorMembers(actor, s.code));
  const showDeactivate = canDeactivate(actor, target) && target.status === 'ATIVO';

  return (
    <ModalFrame onClose={onClose} label="Gerenciar membro" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={target.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(target.name)}`}
              alt=""
              className="w-11 h-11 rounded-xl object-cover border border-purple-500/30"
            />
            <div className="min-w-0">
              <h3 id="manage-member-title" className="font-bold text-white truncate">
                {target.name}
              </h3>
              <p className="text-[11px] text-slate-400 truncate">{target.email}</p>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <PersonTypeBadge type={target.personType} />
                <span className="text-[11px] text-purple-300">{target.title}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          {showDepartment && (
            <section className="space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-purple-400" aria-hidden="true" /> Departamento
              </h4>
              <div className="flex gap-2">
                <label htmlFor="dept-select" className="sr-only">
                  Departamento
                </label>
                <select id="dept-select" value={dept} onChange={(e) => setDept(e.target.value)} className={`${selectClass} flex-1`}>
                  {DEPARTMENTS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || dept === target.departmentCode}
                  className={btnPrimary}
                  onClick={() =>
                    run(
                      () => teamApi.hierarchy(target.id, { action: 'SET_DEPARTMENT', departmentCode: dept }),
                      `${target.name} transferido(a) para ${unitName(dept)}.`
                    )
                  }
                >
                  Transferir
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Quem troca de departamento entra como Assessor(a).</p>
            </section>
          )}

          {showDeptManager && (
            <section className="space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <Crown className="w-4 h-4 text-blue-400" aria-hidden="true" /> Gerência de {unitName(target.departmentCode)}
              </h4>
              {target.departmentRole === 'GERENTE' ? (
                <button
                  type="button"
                  disabled={busy}
                  className={btnGhost}
                  onClick={() => {
                    if (!window.confirm(`Remover ${target.name} da gerência de ${unitName(target.departmentCode)}?`)) return;
                    run(() => teamApi.removeManager(target.departmentCode!), 'Gerência removida.');
                  }}
                >
                  Remover gerência
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className={btnPrimary}
                  onClick={() =>
                    run(
                      () => setManagerWithConfirm(target.departmentCode!, target.id),
                      `${target.name} agora é Gerente de ${unitName(target.departmentCode)}.`
                    )
                  }
                >
                  Tornar Gerente de {unitName(target.departmentCode)}
                </button>
              )}
            </section>
          )}

          {manageableSectors.length > 0 && target.status === 'ATIVO' && (
            <section className="space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" aria-hidden="true" /> Setores
              </h4>
              <ul className="space-y-1.5">
                {manageableSectors.map((s) => {
                  const link = target.sectors.find((m) => m.code === s.code);
                  return (
                    <li
                      key={s.code}
                      className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800"
                    >
                      <span className="text-slate-200">
                        {s.name}
                        {link && (
                          <span className="ml-2 text-[11px] font-bold uppercase text-emerald-300">
                            {link.role === 'GERENTE' ? 'Gerente' : 'Membro'}
                          </span>
                        )}
                      </span>
                      <span className="flex gap-1.5">
                        {link ? (
                          <button
                            type="button"
                            disabled={busy || (link.role === 'GERENTE' && !canManageManagers(actor))}
                            className={btnGhost}
                            onClick={() => {
                              if (!window.confirm(`Remover ${target.name} de ${s.name}?`)) return;
                              run(() => teamApi.removeSectorMember(s.code, target.id), `Removido(a) de ${s.name}.`);
                            }}
                          >
                            Remover
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            className={btnPrimary}
                            onClick={() => run(() => teamApi.addSectorMember(s.code, target.id), `Adicionado(a) a ${s.name}.`)}
                          >
                            Adicionar
                          </button>
                        )}
                        {canManageManagers(actor) && !hasGlobal && link?.role !== 'GERENTE' && (
                          <button
                            type="button"
                            disabled={busy}
                            className={btnGhost}
                            onClick={() =>
                              run(() => setManagerWithConfirm(s.code, target.id), `${target.name} agora gerencia ${s.name}.`)
                            }
                          >
                            Tornar gerente
                          </button>
                        )}
                        {canManageManagers(actor) && link?.role === 'GERENTE' && (
                          <button
                            type="button"
                            disabled={busy}
                            className={btnGhost}
                            onClick={() => run(() => teamApi.removeManager(s.code), 'Gerência do setor removida.')}
                          >
                            Tirar gerência
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {showVice && target.status === 'ATIVO' && (
            <section className="space-y-2">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-yellow-300" aria-hidden="true" /> Vice-presidência
              </h4>
              {target.globalRole === 'VICE_PRESIDENTE' ? (
                <div className="flex gap-2">
                  <label htmlFor="vice-dept" className="sr-only">
                    Departamento de destino
                  </label>
                  <select id="vice-dept" value={dept} onChange={(e) => setDept(e.target.value)} className={`${selectClass} flex-1`}>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.code} value={d.code}>
                        Volta para {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    className={btnGhost}
                    onClick={() =>
                      run(
                        () => teamApi.hierarchy(target.id, { action: 'REMOVE_VICE', departmentCode: dept }),
                        'Vice-presidência removida.'
                      )
                    }
                  >
                    Remover Vice
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className={btnPrimary}
                  onClick={() => {
                    if (!window.confirm(`Nomear ${target.name} Vice-presidente? A pessoa deixa o departamento e as gerências.`)) return;
                    run(() => teamApi.hierarchy(target.id, { action: 'SET_VICE' }), `${target.name} agora é Vice-presidente.`);
                  }}
                >
                  Nomear Vice-presidente
                </button>
              )}
            </section>
          )}

          {showDeactivate && (
            <section className="space-y-2 pt-3 border-t border-slate-800">
              <h4 className="font-bold text-rose-300 flex items-center gap-1.5">
                <ShieldOff className="w-4 h-4" aria-hidden="true" /> Conta
              </h4>
              <button
                type="button"
                disabled={busy}
                className={btnDanger}
                onClick={() => {
                  if (!window.confirm(`Desativar a conta de ${target.name}? Cargos são liberados; itens atribuídos precisam ser redistribuídos.`)) return;
                  run(async () => {
                    const res = await teamApi.hierarchy(target.id, { action: 'DEACTIVATE' });
                    const w = res.pendingWork;
                    if (w && w.cards + w.tasks + w.leads > 0) {
                      toast.warning(
                        `Redistribua: ${w.cards} card(s), ${w.tasks} tarefa(s) e ${w.leads} lead(s) ainda estão com ${target.name}.`
                      );
                    }
                  }, 'Conta desativada.');
                }}
              >
                Desativar conta
              </button>
            </section>
          )}

          {!showDepartment && !showDeptManager && manageableSectors.length === 0 && !showVice && !showDeactivate && (
            <p className="text-slate-400">Você não tem ações disponíveis para este membro.</p>
          )}
        </div>
      </div>
    </ModalFrame>
  );
};
