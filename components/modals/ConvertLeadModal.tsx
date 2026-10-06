'use client';

import React, { useState } from 'react';
import { ProspectLead, User, getUserCargoTitle } from '@/types';
import { Zap, X, Calendar, UserCheck, Building2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProfile } from '@/contexts/ProfileContext';
import { canAssignLeads, canBeLeadAssignee } from '@/lib/permissions';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { DateInput, Select } from '@/components/ui/Input';

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
  const { currentProfile } = useProfile();
  const canAssign = canAssignLeads(currentProfile);
  // Quem não pode atribuir só escolhe a si mesmo (o servidor valida de novo).
  const allowed = (u: User) => canBeLeadAssignee(u) && (canAssign || u.id === currentProfile?.id);
  const negociosUsers = users.filter((u) => u.departmentCode === 'NEGOCIOS' && allowed(u));
  const presidenciaUsers = users.filter((u) => u.globalRole !== null && allowed(u));

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
    <Modal
      title="Converter Lead em Card"
      description="Funil de Vendas • Fase: Reunião marcada"
      onClose={onClose}
      size="md"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="convert-lead-form" icon={CheckCircle2} loading={isSubmitting}>
            {isSubmitting ? 'Criando Card...' : 'Confirmar & Criar Card no Funil'}
          </Button>
        </>
      }
    >
      <form id="convert-lead-form" onSubmit={handleConvert} className="space-y-5">
        <div className="p-4 rounded-control bg-primary-subtle border border-primary/30 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-fg text-sm">
            <Building2 className="w-4 h-4 text-primary-soft" aria-hidden="true" />
            {lead.companyName}
          </div>
          {lead.contactName && (
            <div className="text-fg">
              <span className="text-fg-muted">Decisor:</span> {lead.contactName} {lead.contactInfo ? `(${lead.contactInfo})` : ''}
            </div>
          )}
          {lead.segment && (
            <div className="text-fg">
              <span className="text-fg-muted">Segmento:</span> <span className="text-primary-soft font-medium">{lead.segment}</span>
            </div>
          )}
          <div className="text-fg">
            <span className="text-fg-muted">Plano de Ação:</span> <span className="italic">{lead.actionPlan}</span>
          </div>
        </div>
        <Field label="Consultor SciTec Responsável">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
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
          </Select>
        </Field>
        <Field label="Data da Reunião Marcada" required>
          <DateInput value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} required />
        </Field>
      </form>
    </Modal>
  );
};
