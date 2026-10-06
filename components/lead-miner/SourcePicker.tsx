import React from 'react';
import type { MiningSource, ServicesStatus } from '@/lib/leads/client-api';
import { SOURCE_OPTIONS, googleUnavailableReason } from './mining-form-helpers';

/**
 * Seletor de Modo_Fonte (radio group "Fonte", Req. 4.1, 4.2). Quando o Google Places está
 * indisponível, as opções que o usam ficam desabilitadas com o motivo.
 */
export interface SourcePickerProps {
  value: MiningSource;
  onChange: (fonte: MiningSource) => void;
  services: ServicesStatus | null;
  disabled?: boolean;
}

export const SourcePicker: React.FC<SourcePickerProps> = ({ value, onChange, services, disabled }) => {
  const googleReason = googleUnavailableReason(services);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-sm font-semibold text-slate-200">Fonte dos dados</legend>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
        {SOURCE_OPTIONS.map((opt) => {
          const blocked = opt.usesGoogle && googleReason !== null;
          const inputId = `mining-fonte-${opt.id}`;
          return (
            <div key={opt.id} className="flex flex-col gap-0.5">
              <label
                htmlFor={inputId}
                className={`flex items-center gap-2 text-sm ${blocked ? 'text-slate-400' : 'text-slate-300'}`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="mining-fonte"
                  value={opt.id}
                  checked={value === opt.id}
                  disabled={disabled || blocked}
                  onChange={() => onChange(opt.id)}
                  aria-describedby={blocked ? `${inputId}-hint` : undefined}
                  className="h-4 w-4 border-slate-600 bg-slate-900 accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                {opt.label}
              </label>
              {blocked && (
                <p id={`${inputId}-hint`} className="pl-6 text-xs text-amber-400/90">
                  {googleReason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
};

export default SourcePicker;
