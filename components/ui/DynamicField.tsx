'use client';

import React from 'react';
import { Field } from '@/types';
import { AlertCircle } from 'lucide-react';

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

  const borderClass = isMissing
    ? 'border-red-500 ring-2 ring-red-200 bg-red-50 dark:bg-red-950/20'
    : 'border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {field.label}
          {field.required && (
            <span className="ml-1 text-xs font-semibold text-red-500 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
              Obrigatório
            </span>
          )}
        </label>
        {isMissing && (
          <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-semibold animate-pulse">
            <AlertCircle className="w-3.5 h-3.5" /> Preenchimento necessário
          </span>
        )}
      </div>

      {field.type === 'TEXT' && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Digite ${field.label.toLowerCase()}`}
          disabled={disabled}
          className={`w-full px-3 py-2 text-sm rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-all ${borderClass}`}
        />
      )}

      {field.type === 'NUMBER' && (
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          disabled={disabled}
          className={`w-full px-3 py-2 text-sm rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-all ${borderClass}`}
        />
      )}

      {field.type === 'CURRENCY' && (
        <div className="relative">
          <span className="absolute left-3 top-2 text-sm text-slate-500 font-medium">R$</span>
          <input
            type="number"
            step="0.01"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0,00"
            disabled={disabled}
            className={`w-full pl-9 pr-3 py-2 text-sm rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-all ${borderClass}`}
          />
        </div>
      )}

      {field.type === 'DATE' && (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full px-3 py-2 text-sm rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-all ${borderClass}`}
        />
      )}

      {field.type === 'SELECT' && (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full px-3 py-2 text-sm rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-all ${borderClass}`}
        >
          <option value="">-- Selecione uma opção --</option>
          {parsedOptions.map((opt, idx) => (
            <option key={idx} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {field.type === 'TEXTAREA' && (
        <textarea
          rows={3}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Digite ${field.label.toLowerCase()}`}
          disabled={disabled}
          className={`w-full px-3 py-2 text-sm rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-all ${borderClass}`}
        />
      )}
    </div>
  );
};
