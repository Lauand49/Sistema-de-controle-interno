import React, { useId } from 'react';
import { cn } from '@/lib/ui/format';

export interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
  /** Um único controle (Input, Select, Textarea...). Recebe id, aria-describedby e aria-invalid. */
  children: React.ReactElement;
}

/** Rótulo ligado ao controle + selo "Obrigatório" + dica + erro. */
export const Field: React.FC<FieldProps> = ({ label, required, hint, error, className, children }) => {
  const uid = useId();
  const id = children.props.id ?? `f${uid.replace(/:/g, '')}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-fg">
          {label}
        </label>
        {required && (
          <span className="text-[11px] font-bold uppercase tracking-wide text-danger-soft bg-danger-subtle px-1.5 py-0.5 rounded">
            Obrigatório
          </span>
        )}
      </div>
      {React.cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        invalid: error ? true : children.props.invalid,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs text-danger-soft font-medium">
          {error}
        </p>
      )}
    </div>
  );
};
