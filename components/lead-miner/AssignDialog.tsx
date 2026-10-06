'use client';

import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { Assignee } from '@/lib/leads/client-api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/Display';

interface AssignDialogProps {
  open: boolean;
  count: number;
  /** `null` enquanto carrega. */
  assignees: Assignee[] | null;
  loadError?: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (assignee: Assignee) => void;
}


/** Diálogo modal para escolher o Responsável das empresas selecionadas (Req. 16.1). */
export const AssignDialog: React.FC<AssignDialogProps> = ({
  open,
  count,
  assignees,
  loadError,
  busy,
  onCancel,
  onConfirm,
}) => {
  const [assigneeId, setAssigneeId] = useState('');
  useEffect(() => {
    if (open) setAssigneeId('');
  }, [open]);
  if (!open) return null;
  const chosen = assignees?.find((a) => a.id === assigneeId) ?? null;
  return (
    <Modal
      title={`Atribuir ${count} ${count === 1 ? 'empresa' : 'empresas'}`}
      onClose={() => {
        if (!busy) onCancel();
      }}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button icon={UserPlus} onClick={() => chosen && onConfirm(chosen)} disabled={!chosen} loading={busy}>
            Atribuir
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {loadError ? (
          <p role="alert" className="text-sm text-danger-soft">
            {loadError}
          </p>
        ) : assignees === null ? (
          <LoadingState label="Carregando responsáveis…" className="p-2 justify-start" />
        ) : (
          <>
            <Field label="Responsável">
              <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={busy} data-autofocus>
                <option value="">Selecione um responsável</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title ? `${a.name} — ${a.title}` : a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {assignees.length === 0 && (
              <p className="text-xs text-warning-soft">Nenhum usuário disponível para ser responsável.</p>
            )}
          </>
        )}
        <p className="text-xs text-fg-muted">
          O responsável substitui o atual e também é aplicado aos leads de triagem vinculados.
        </p>
      </div>
    </Modal>
  );
};
export default AssignDialog;
