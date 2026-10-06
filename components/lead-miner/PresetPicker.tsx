'use client';
/**
 * Escolha de Preset (Req. 10.2): marca exatamente os nichos do preset; o usuário pode ajustar
 * nichos individuais em seguida no `NicheChecklist`.
 */
import React from 'react';
import { Layers } from 'lucide-react';
import type { PresetId } from '@/lib/leads/config';
import { PRESET_OPTIONS, presetNiches } from './mining-form-helpers';

export interface PresetPickerProps {
  /** Preset que coincide com a seleção atual (null = seleção personalizada). */
  active: PresetId | null;
  onPick: (preset: PresetId) => void;
  disabled?: boolean;
}

export const PresetPicker: React.FC<PresetPickerProps> = ({ active, onPick, disabled = false }) => (
  <fieldset className="space-y-2">
    <legend className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
      <Layers className="h-4 w-4 text-purple-400" aria-hidden="true" />
      Preset
    </legend>
    <div className="flex flex-wrap gap-2">
      {PRESET_OPTIONS.map((opt) => {
        const pressed = active === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            aria-pressed={pressed}
            onClick={() => onPick(opt.id)}
            title={opt.description}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50 ${
              pressed
                ? 'border-purple-500 bg-purple-950/70 text-purple-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-purple-500/60 hover:text-white'
            }`}
          >
            {opt.label}
            <span className="ml-1 font-normal text-slate-400">({presetNiches(opt.id).length})</span>
          </button>
        );
      })}
    </div>
    <p className="text-xs text-slate-400">
      {active ? 'Os nichos do preset foram marcados; ajuste-os abaixo se quiser.' : 'Seleção personalizada de nichos.'}
    </p>
  </fieldset>
);

export default PresetPicker;
