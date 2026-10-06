'use client';

import React from 'react';
import { X, RotateCcw, Trash2, Building2, User, Phone, Calendar, AlertCircle } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';

interface DiscardedLead {
  id: string;
  companyName: string;
  contactName?: string | null;
  contactInfo?: string | null;
  segment?: string | null;
  actionPlan: string;
  notes?: string | null;
  status: string;
  updatedAt: string;
}

interface DiscardedLeadsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  discardedLeads: DiscardedLead[];
  readOnly?: boolean;
  onRestoreLead: (leadId: string, targetStatus: 'RAW' | 'PENDING') => Promise<void>;
  onDeleteLead: (leadId: string) => Promise<void>;
}

export const DiscardedLeadsDrawer: React.FC<DiscardedLeadsDrawerProps> = ({
  isOpen,
  onClose,
  discardedLeads,
  readOnly = false,
  onRestoreLead,
  onDeleteLead,
}) => {
  if (!isOpen) return null;

  return (
    <Drawer
      onClose={onClose}
      title="Leads Descartados"
      icon={
        <div className="p-2.5 rounded-xl bg-danger-subtle text-danger-soft border border-danger/20">
          <Trash2 className="w-5 h-5" aria-hidden="true" />
        </div>
      }
      description={`${discardedLeads.length} lead${discardedLeads.length === 1 ? '' : 's'} arquivado${discardedLeads.length === 1 ? '' : 's'} da prospecção`}
    >

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {discardedLeads.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
              <div className="p-4 rounded-full bg-slate-800/40 border border-slate-800">
                <AlertCircle className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-sm font-medium text-slate-400">Nenhum lead descartado até o momento.</p>
              <p className="text-xs text-slate-600 max-w-xs">
                Leads descartados durante a triagem rápida aparecerão listados aqui com suas respectivas anotações.
              </p>
            </div>
          ) : (
            discardedLeads.map((lead) => (
              <div
                key={lead.id}
                className="bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4 space-y-3 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-white text-base flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-purple-400 shrink-0" />
                      {lead.companyName}
                    </h4>
                    {lead.segment && (
                      <span className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-300 border border-purple-800/50">
                        {lead.segment}
                      </span>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400 shrink-0 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(lead.updatedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Contact info */}
                {(lead.contactName || lead.contactInfo) && (
                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/40">
                    {lead.contactName && (
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <User className="w-3.5 h-3.5 text-slate-400" /> {lead.contactName}
                      </span>
                    )}
                    {lead.contactInfo && (
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-slate-400" /> {lead.contactInfo}
                      </span>
                    )}
                  </div>
                )}

                {/* Discard Reason / Notes */}
                {lead.notes && (
                  <div className="text-xs bg-rose-950/30 border border-rose-900/40 rounded-xl p-3 text-rose-200 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block">
                      Motivo do Descarte:
                    </span>
                    <p className="italic">{lead.notes}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 flex items-center justify-end border-t border-slate-800/60">
                  {readOnly ? (
                    <span className="text-[11px] text-slate-400 italic">Somente leitura</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onDeleteLead(lead.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                      >
                        Excluir
                      </button>
                      <button
                        onClick={() => onRestoreLead(lead.id, 'RAW')}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Devolver à Triagem
                      </button>
                      <button
                        onClick={() => onRestoreLead(lead.id, 'PENDING')}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors"
                      >
                        Aprovar para Planilha
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      
    </Drawer>
  );
};
