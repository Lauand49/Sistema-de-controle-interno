'use client';

import React from 'react';
import { Field } from '@/types';
import { AlertCircle } from 'lucide-react';
import { CurrencyInput } from './CurrencyInput';
import { DateInput, Input, Select, Textarea } from './Input';

interface DynamicFieldProps {
  field: Field;
  value: string;
  onChange: (val: string) => void;
  isMissing?: boolean;
  disabled?: boolean;
}

export const DynamicField: React.FC<DynamicFieldProps> = ({
  field,
  value,
  onChange,
  isMissing = false,
  disabled = false,
}) => {
  let parsedOptions: string[] = [];
  if (field.type === 'SELECT' && field.options) {
    try {
      parsedOptions = JSON.parse(field.options);
    } catch {
      parsedOptions = field.options.split(',').map((s) => s.trim());
    }
  }

  const inputId = `df-${field.id}`;
  const missingId = `${inputId}-missing`;
  const common = {
    id: inputId,
    disabled,
    invalid: isMissing,
    'aria-describedby': isMissing ? missingId : undefined,
  } as const;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="flex items-center gap-2 text-xs font-semibold text-fg">
          {field.label}
          {field.required && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-danger-soft bg-danger-subtle px-1.5 py-0.5 rounded">
              Obrigatório
            </span>
          )}
        </label>
        {isMissing && (
          <span id={missingId} role="alert" className="flex items-center gap-1 text-xs text-danger-soft font-semibold">
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> Preenchimento necessário
          </span>
        )}
      </div>
      {field.type === 'TEXT' && (
        <Input {...common} type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={`Digite ${field.label.toLowerCase()}`} />
      )}
      {field.type === 'NUMBER' && (
        <Input {...common} type="number" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="0" />
      )}
      {field.type === 'CURRENCY' && (
        <CurrencyInput {...common} value={value || ''} onChange={onChange} />
      )}
      {field.type === 'DATE' && <DateInput {...common} value={value || ''} onChange={(e) => onChange(e.target.value)} />}
      {field.type === 'SELECT' && (
        <Select {...common} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- Selecione uma opção --</option>
          {parsedOptions.map((opt, idx) => (
            <option key={idx} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      )}
      {field.type === 'TEXTAREA' && (
        <Textarea {...common} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={`Digite ${field.label.toLowerCase()}`} />
      )}
    </div>
  );
};
