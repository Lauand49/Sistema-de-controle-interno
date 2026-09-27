'use client';

import React, { useState } from 'react';
import { ProspectLead, User, getUserCargoTitle } from '@/types';
import { Zap, X, Calendar, UserCheck, Building2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConvertLeadModalProps {
  lead: ProspectLead;
  users: User[];
  onClose: () => void;
  onSuccess: (cardId: string) => void;
}

export const ConvertLeadModal: React.FC<ConvertLeadModalProps> = ({
  lead,
  users,
  onClose,
  onSuccess,
}) => {
  const negociosUsers = users.filter((u) => u.primaryDept?.toUpperCase() === 'NEGOCIOS');
  const presidenciaUsers = users.filter(
    (u) => u.role?.toUpperCase() === 'PRESIDENTE' && u.primaryDept?.toUpperCase() !== 'NEGOCIOS'
  );

  const [assigneeId, setAssigneeId] = useState(lead.assignedTo || '');
  const [meetingDate, setMeetingDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/tools/leads/${lead.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigneeId: assigneeId || null,
          meetingDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Falha ao converter lead.');
      }

      const data = await res.json();
      toast.success(data.message || 'Card criado no Funil de Vendas com sucesso!');
      onSuccess(data.card.id);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao converter.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-purple-500/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-950/60 to-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-900/80 border border-purple-500/50 text-purple-300">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Converter Lead em Card</h3>
              <p className="text-xs text-purple-300/80">Funil de Vendas • Fase: Reunião marcada</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleConvert} className="p-6 space-y-5">
          {/* Lead Summary Card */}
          <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-900/40 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Building2 className="w-4 h-4 text-purple-400" />
              {lead.companyName}
            </div>

            {lead.contactName && (
              <div className="text-slate-300">
                <span className="text-slate-400">Decisor:</span> {lead.contactName}{' '}
                {lead.contactInfo ? `(${lead.contactInfo})` : ''}
              </div>
            )}

            {lead.segment && (
              <div className="text-slate-300">
                <span className="text-slate-400">Segmento:</span>{' '}
                <span className="text-purple-300 font-medium">{lead.segment}</span>
              </div>
            )}

            <div className="text-slate-300">
              <span className="text-slate-400">Plano de Ação:</span>{' '}
              <span className="italic">{lead.actionPlan}</span>
            </div>
          </div>

          {/* Consultant Assignee Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-purple-400" /> Consultor SciTec Responsável
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Selecione um consultor de Negócios</option>
              <optgroup label="Equipe de Negócios">
                {negociosUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({getUserCargoTitle(u)})
                  </option>
                ))}
              </optgroup>
              {presidenciaUsers.length > 0 && (
                <optgroup label="Presidência">
                  {presidenciaUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({getUserCargoTitle(u)})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Meeting Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-400" /> Data da Reunião Marcada
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-800 bg-slate-950 text-white focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-purple-900/40 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Criando Card...' : 'Confirmar & Criar Card no Funil'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
