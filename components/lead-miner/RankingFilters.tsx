'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Search, RotateCcw, AlertCircle } from 'lucide-react';
import { CATEGORY_LABEL, NICHES, PRIORITY_LABEL, UFS } from '@/lib/leads/config';
import type { RankingUiState } from '@/lib/leads/filters';
import type { Assignee } from '@/lib/leads/client-api';
import { NO_PRIORITY_LABEL } from './PriorityBadge';
import {
  INVALID_MESSAGES,
  LEAD_STATUS_LABEL,
  SOURCE_LABEL,
  type RankingInvalidField,
  type RankingUiKey,
} from './ranking-helpers';

const TEXT_DEBOUNCE_MS = 400;

const FIELD =
  'w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 aria-[invalid=true]:border-red-500';
const LABEL = 'mb-1 block text-xs font-semibold text-slate-400';

interface RankingFiltersProps {
  value: RankingUiState;
  invalid: readonly RankingInvalidField[];
  onChange: (patch: RankingUiState) => void;
  onClear: () => void;
  /** Lista de responsáveis (só para Atribuidor); `null` = oferecer "Atribuídas a mim". */
  assignees: Assignee[] | null;
  currentUserId?: string | null;
}

/** Campo de texto com estado local e envio com debounce (a URL só muda ao parar de digitar). */
function DebouncedInput({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  const [local, setLocal] = useState(value);
  const committed = useRef(value);

  // Mudança externa (ex.: "Limpar filtros", voltar no histórico) reinicia o campo.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setLocal(value);
    }
  }, [value]);

  useEffect(() => {
    if (local === committed.current) return;
    const t = setTimeout(() => {
      committed.current = local;
      onCommit(local);
    }, TEXT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [local, onCommit]);

  return <input {...rest} value={local} onChange={(e) => setLocal(e.target.value)} />;
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} className={FIELD} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

/** Busca e filtros da Tela_Ranking (Req. 12.2, 12.3, 12.9–12.11). */
export const RankingFilters: React.FC<RankingFiltersProps> = ({
  value,
  invalid,
  onChange,
  onClear,
  assignees,
  currentUserId,
}) => {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const v = (k: RankingUiKey) => value[k] ?? '';
  const set = (k: RankingUiKey) => (next: string) => onChange({ [k]: next });

  // Commits estáveis por campo para não reiniciar o debounce a cada render.
  const commitRef = useRef(onChange);
  commitRef.current = onChange;
  const commits = useRef<Partial<Record<RankingUiKey, (s: string) => void>>>({});
  const commit = (k: RankingUiKey) => {
    let fn = commits.current[k];
    if (!fn) {
      fn = (s: string) => commitRef.current({ [k]: s.trim() === '' ? '' : s });
      commits.current[k] = fn;
    }
    return fn;
  };

  const scoreInvalid = invalid.includes('score');
  const datesInvalid = invalid.includes('datas');
  const scoreErrId = id('score-err');
  const datesErrId = id('dates-err');

  return (
    <section
      aria-label="Filtros do ranking"
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label htmlFor={id('q')} className={LABEL}>
            Buscar por nome, endereço ou telefone
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden="true" />
            <DebouncedInput
              id={id('q')}
              type="search"
              maxLength={100}
              placeholder="Ex.: Clínica Sorriso"
              className={`${FIELD} pl-9`}
              value={v('q')}
              onCommit={commit('q')}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Limpar filtros
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={id('cidade')} className={LABEL}>
            Cidade
          </label>
          <DebouncedInput id={id('cidade')} maxLength={100} className={FIELD} value={v('cidade')} onCommit={commit('cidade')} />
        </div>
        <div>
          <label htmlFor={id('bairro')} className={LABEL}>
            Bairro
          </label>
          <DebouncedInput id={id('bairro')} maxLength={100} className={FIELD} value={v('bairro')} onCommit={commit('bairro')} />
        </div>
        <SelectField id={id('uf')} label="UF" value={v('uf')} onChange={set('uf')}>
          <option value="">Todas</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </SelectField>
        <SelectField id={id('nicho')} label="Nicho" value={v('nicho')} onChange={set('nicho')}>
          <option value="">Todos</option>
          {[1, 2, 3].map((tier) => (
            <optgroup key={tier} label={`Tier ${tier}`}>
              {NICHES.filter((n) => n.tier === tier).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <SelectField id={id('categoria')} label="Categoria" value={v('categoria')} onChange={set('categoria')}>
          <option value="">Todas</option>
          {Object.entries(CATEGORY_LABEL).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField id={id('prioridade')} label="Prioridade" value={v('prioridade')} onChange={set('prioridade')}>
          <option value="">Todas</option>
          {Object.entries(PRIORITY_LABEL).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
          <option value="SEM">{NO_PRIORITY_LABEL}</option>
        </SelectField>

        <fieldset className="sm:col-span-2 lg:col-span-1">
          <legend className={LABEL}>Faixa de score (0 a 100)</legend>
          <div className="flex items-center gap-2">
            <label htmlFor={id('scoreMin')} className="sr-only">
              Score mínimo
            </label>
            <DebouncedInput
              id={id('scoreMin')}
              inputMode="numeric"
              placeholder="Mín."
              className={FIELD}
              value={v('scoreMin')}
              onCommit={commit('scoreMin')}
              aria-invalid={scoreInvalid}
              aria-describedby={scoreInvalid ? scoreErrId : undefined}
            />
            <span className="text-slate-500" aria-hidden="true">
              –
            </span>
            <label htmlFor={id('scoreMax')} className="sr-only">
              Score máximo
            </label>
            <DebouncedInput
              id={id('scoreMax')}
              inputMode="numeric"
              placeholder="Máx."
              className={FIELD}
              value={v('scoreMax')}
              onCommit={commit('scoreMax')}
              aria-invalid={scoreInvalid}
              aria-describedby={scoreInvalid ? scoreErrId : undefined}
            />
          </div>
          {scoreInvalid && (
            <p id={scoreErrId} role="alert" className="mt-1 flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {INVALID_MESSAGES.score}
            </p>
          )}
        </fieldset>

        <SelectField id={id('hasSite')} label="Tem site" value={v('hasSite')} onChange={set('hasSite')}>
          <option value="">Indiferente</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </SelectField>
        <SelectField id={id('isHttps')} label="Tem HTTPS" value={v('isHttps')} onChange={set('isHttps')}>
          <option value="">Indiferente</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </SelectField>
        <SelectField id={id('fonte')} label="Fonte" value={v('fonte')} onChange={set('fonte')}>
          <option value="">Todas</option>
          {Object.entries(SOURCE_LABEL).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField id={id('assignedTo')} label="Responsável" value={v('assignedTo')} onChange={set('assignedTo')}>
          <option value="">Todos</option>
          <option value="NONE">Sem responsável</option>
          {assignees
            ? assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))
            : currentUserId && <option value={currentUserId}>Atribuídas a mim</option>}
          {/* Valor vindo da URL fora da lista: mantém o select coerente. */}
          {v('assignedTo') &&
            v('assignedTo') !== 'NONE' &&
            v('assignedTo') !== currentUserId &&
            !assignees?.some((a) => a.id === v('assignedTo')) && (
              <option value={v('assignedTo')}>Responsável selecionado</option>
            )}
        </SelectField>
        <SelectField id={id('leadStatus')} label="Status na triagem" value={v('leadStatus')} onChange={set('leadStatus')}>
          <option value="">Todos</option>
          {Object.entries(LEAD_STATUS_LABEL).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </SelectField>

        <SelectField id={id('temInstagram')} label="Tem Instagram" value={v('temInstagram')} onChange={set('temInstagram')}>
          <option value="">Indiferente</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </SelectField>
        <SelectField id={id('temWhatsapp')} label="Tem WhatsApp" value={v('temWhatsapp')} onChange={set('temWhatsapp')}>
          <option value="">Indiferente</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </SelectField>
        <SelectField id={id('temCnpj')} label="Tem CNPJ" value={v('temCnpj')} onChange={set('temCnpj')}>
          <option value="">Indiferente</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </SelectField>
        <SelectField id={id('situacao')} label="Situação cadastral" value={v('situacao')} onChange={set('situacao')}>
          <option value="">Todas</option>
          <option value="ATIVA">Ativa</option>
          <option value="BAIXADA">Baixada</option>
          <option value="INAPTA">Inapta</option>
          <option value="SUSPENSA">Suspensa</option>
          <option value="NULA">Nula</option>
        </SelectField>
        <SelectField id={id('desempenhoRuim')} label="Desempenho PageSpeed" value={v('desempenhoRuim')} onChange={set('desempenhoRuim')}>
          <option value="">Indiferente</option>
          <option value="true">Ruim (nota &lt; 50)</option>
          <option value="false">Bom</option>
        </SelectField>

        <fieldset className="sm:col-span-2">
          <legend className={LABEL}>Data da última análise</legend>
          <div className="flex items-center gap-2">
            <label htmlFor={id('analyzedFrom')} className="sr-only">
              Analisadas a partir de
            </label>
            <input
              id={id('analyzedFrom')}
              type="date"
              className={FIELD}
              value={v('analyzedFrom')}
              onChange={(e) => onChange({ analyzedFrom: e.target.value })}
              aria-invalid={datesInvalid}
              aria-describedby={datesInvalid ? datesErrId : undefined}
            />
            <span className="text-xs text-slate-500">até</span>
            <label htmlFor={id('analyzedTo')} className="sr-only">
              Analisadas até
            </label>
            <input
              id={id('analyzedTo')}
              type="date"
              className={FIELD}
              value={v('analyzedTo')}
              onChange={(e) => onChange({ analyzedTo: e.target.value })}
              aria-invalid={datesInvalid}
              aria-describedby={datesInvalid ? datesErrId : undefined}
            />
          </div>
          {datesInvalid && (
            <p id={datesErrId} role="alert" className="mt-1 flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {INVALID_MESSAGES.datas}
            </p>
          )}
        </fieldset>
      </div>
    </section>
  );
};

export default RankingFilters;
