'use client';
/**
 * Formulário da Tela_Minerar (Req. 7.5, 10.1–10.6, 10.10, 8.15).
 *
 * - Botão "Iniciar" desabilitado com campo pendente e durante o envio (uma mineração por clique).
 * - 400: mensagens por campo, valores mantidos. Outras falhas: "A mineração não foi iniciada".
 * - 409: a mineração equivalente já em andamento passa a ser acompanhada (`onRunStarted(runId)`).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Loader2, Pickaxe, Sparkles } from 'lucide-react';
import { UFS, type PresetId } from '@/lib/leads/config';
import {
  conflictRunId,
  isLeadMinerApiError,
  leadMinerApi,
  NETWORK_ERROR_MESSAGE,
  type RunProgress,
} from '@/lib/leads/client-api';
import type { ServicesStatus } from '@/lib/leads/client-api';
import { useCities, useNeighborhoods } from '@/hooks/lead-miner/useLocalidades';
import { Combobox } from './Combobox';
import { findExactOption } from './combobox-helpers';
import { NicheChecklist } from './NicheChecklist';
import { PresetPicker } from './PresetPicker';
import { PreviousRunNotice } from './PreviousRunNotice';
import { ServiceStatusPanel } from './ServiceStatusPanel';
import { SourcePicker } from './SourcePicker';
import {
  applyCidadeChange,
  applyUfChange,
  bairroEnabled,
  buildCreateRunInput,
  canSubmit,
  cidadeEnabled,
  defaultSource,
  LOCALIDADE_HINTS,
  IA_UNAVAILABLE_TEXT,
  INITIAL_FORM_VALUES,
  lookupParams,
  matchingPreset,
  pagespeedUnavailableReason,
  pendingFields,
  presetNiches,
  RUN_NOT_STARTED_TEXT,
  runTitle,
  splitFieldErrors,
  TEXT_MAX,
  type MiningFormField,
  type MiningFormValues,
} from './mining-form-helpers';
import { Select } from '@/components/ui/Input';

type IaState = 'loading' | 'available' | 'unavailable' | 'error';

export interface MiningFormProps {
  /** Mineração criada (progresso) ou já em andamento (runId de um 409). */
  onRunStarted: (run: RunProgress | string, title: string) => void;
}

const inputClass = 'w-full';

export const MiningForm: React.FC<MiningFormProps> = ({ onRunStarted }) => {
  const [values, setValues] = useState<MiningFormValues>(INITIAL_FORM_VALUES);
  const [serverErrors, setServerErrors] = useState<Partial<Record<MiningFormField, string>>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [ia, setIa] = useState<IaState>('loading');
  const [services, setServices] = useState<ServicesStatus | null>(null);
  /** Garante que a fonte padrão (OSM/MISTA) só é aplicada uma vez, sem sobrescrever a escolha do usuário. */
  const sourceDefaulted = useRef(false);

  useEffect(() => {
    const ac = new AbortController();
    leadMinerApi
      .getConfig({ signal: ac.signal })
      .then((cfg) => {
        if (ac.signal.aborted) return;
        setIa(cfg.iaAvailable ? 'available' : 'unavailable');
        setServices(cfg.services);
        if (!sourceDefaulted.current) {
          sourceDefaulted.current = true;
          const fonte = defaultSource(cfg.services);
          if (fonte !== INITIAL_FORM_VALUES.fonte) setValues((v) => ({ ...v, fonte }));
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setIa('error');
      });
    return () => ac.abort();
  }, []);

  const iaAvailable = ia === 'available';
  const pagespeedBlocked = pagespeedUnavailableReason(services);
  const pending = pendingFields(values);
  const enabled = canSubmit(values, submitting);

  // ---- Localização em cascata: UF → Cidade → Bairro (T2) ----
  const cidadeOk = cidadeEnabled(values);
  const bairroOk = bairroEnabled(values);
  const cities = useCities(values.uf);
  /** Cidade confirmada (escolhida/Enter/saída do campo) para a qual se buscam os bairros no OSM. */
  const [cidadeCommitted, setCidadeCommitted] = useState('');
  /** Cidade digitada que não está na lista do IBGE: usada como digitada, sem consultar o OSM. */
  const [cidadeForaDaLista, setCidadeForaDaLista] = useState(false);
  const bairros = useNeighborhoods(values.uf, cidadeCommitted);

  const clearServerErrors = (...keys: MiningFormField[]) =>
    setServerErrors((e) => {
      if (!keys.some((k) => k in e)) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });

  const changeUf = (uf: string) => {
    setValues((v) => applyUfChange(v, uf));
    setCidadeCommitted('');
    setCidadeForaDaLista(false);
    clearServerErrors('uf', 'cidade', 'bairro');
  };
  const changeCidade = (cidade: string) => {
    setValues((v) => applyCidadeChange(v, cidade));
    setCidadeCommitted('');
    setCidadeForaDaLista(false);
    clearServerErrors('cidade', 'bairro');
  };
  const commitCidade = (typed: string) => {
    const text = typed.trim();
    if (text === '') return;
    const exact = findExactOption(cities.items, text);
    // Grafia canônica do IBGE ("sao paulo" → "São Paulo") sem apagar o bairro (é a mesma cidade).
    if (exact && exact !== typed) setValues((v) => (v.cidade === typed ? { ...v, cidade: exact } : v));
    const known = exact !== null;
    if (known || cities.status !== 'ready') {
      setCidadeForaDaLista(false);
      setCidadeCommitted(exact ?? text);
    } else {
      // Lista do IBGE carregada e a cidade não consta: digitação livre, sem consulta ao OSM.
      setCidadeForaDaLista(true);
      setCidadeCommitted('');
    }
  };

  const cidadeNote = !cidadeOk
    ? LOCALIDADE_HINTS.escolhaUf
    : cities.status === 'loading'
      ? LOCALIDADE_HINTS.carregandoCidades
      : cities.status === 'unavailable'
        ? LOCALIDADE_HINTS.cidadesIndisponiveis
        : cidadeForaDaLista
          ? LOCALIDADE_HINTS.cidadeForaDaLista
          : null;
  const bairroNote = !bairroOk
    ? LOCALIDADE_HINTS.escolhaCidade
    : bairros.status === 'loading'
      ? LOCALIDADE_HINTS.carregandoBairros
      : bairros.status === 'unavailable' || cidadeForaDaLista
        ? LOCALIDADE_HINTS.bairrosIndisponiveis
        : null;

  const update = <K extends keyof MiningFormValues>(key: K, value: MiningFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (key in serverErrors) {
      setServerErrors((e) => {
        const next = { ...e };
        delete next[key as MiningFormField];
        return next;
      });
    }
  };

  const pickPreset = (preset: PresetId) => update('nichos', presetNiches(preset));

  const submit = useCallback(async () => {
    // Guarda síncrona: cliques repetidos antes do re-render não criam outra mineração (Req. 10.6).
    if (submittingRef.current || !canSubmit(values, false)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setGeneralError(null);
    setServerErrors({});
    const input = buildCreateRunInput(values, iaAvailable);
    const title = runTitle(input);
    try {
      const progress = await leadMinerApi.createRun(input);
      onRunStarted(progress, title);
      toast.success('Mineração iniciada', { description: title });
    } catch (e) {
      if (isLeadMinerApiError(e) && e.status === 409 && conflictRunId(e)) {
        onRunStarted(conflictRunId(e)!, title);
        toast.info('Já existe uma mineração em andamento com esses parâmetros', {
          description: 'Acompanhando o progresso dela abaixo.',
        });
      } else {
        const message = e instanceof Error ? e.message : NETWORK_ERROR_MESSAGE;
        if (isLeadMinerApiError(e) && e.status === 400) {
          const { byField, general } = splitFieldErrors(e.fields);
          setServerErrors(byField);
          setGeneralError(general.length > 0 ? general.join(' ') : Object.keys(byField).length > 0 ? 'Revise os campos indicados.' : message);
        } else {
          setGeneralError(message);
        }
        toast.error(RUN_NOT_STARTED_TEXT, { description: message });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [values, iaAvailable, onRunStarted]);

  const hint = (field: MiningFormField) => {
    const error = serverErrors[field];
    const text = error ?? pending[field];
    if (!text) return null;
    return (
      <p id={`mining-${field}-hint`} className={`mt-1 text-xs ${error ? 'text-red-300' : 'text-amber-300/90'}`}>
        {text}
      </p>
    );
  };
  const describedBy = (field: MiningFormField) =>
    serverErrors[field] || pending[field] ? `mining-${field}-hint` : undefined;
  const joinIds = (...ids: Array<string | undefined>) => ids.filter(Boolean).join(' ') || undefined;
  const cidadeHintId = joinIds(describedBy('cidade'), cidadeNote ? 'mining-cidade-note' : undefined);
  const bairroHintId = joinIds(describedBy('bairro'), bairroNote ? 'mining-bairro-note' : undefined);
  const border = (field: MiningFormField) => (serverErrors[field] ? '!border-danger' : '');

  const pendingCount = Object.keys(pending).length;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-busy={submitting}
      className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
    >
      <ServiceStatusPanel services={services} loading={ia === 'loading'} />

      {/* Localização em cascata: UF → Cidade → Bairro (T2). Cada campo só habilita após o anterior. */}
      <div className="grid gap-4 md:grid-cols-[8rem_1fr_1fr]">
        <div>
          <label htmlFor="mining-uf" className="mb-1 block text-sm font-semibold text-slate-200">
            UF
          </label>
          <Select
            id="mining-uf"
            value={values.uf}
            onChange={(e) => changeUf(e.target.value)}
            aria-describedby={describedBy('uf')}
            aria-invalid={!!serverErrors.uf || undefined}
            aria-required="true"
            className={`${inputClass} ${border('uf')}`}
          >
            <option value="">Selecione</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
          {hint('uf')}
        </div>
        <div>
          <label htmlFor="mining-cidade" className="mb-1 block text-sm font-semibold text-slate-200">
            Cidade
          </label>
          <Combobox
            id="mining-cidade"
            value={values.cidade}
            options={cities.items}
            loading={cities.status === 'loading'}
            disabled={!cidadeOk}
            maxLength={TEXT_MAX}
            placeholder="Ex.: São Paulo"
            onChange={changeCidade}
            onCommit={commitCidade}
            aria-describedby={cidadeHintId}
            aria-invalid={!!serverErrors.cidade || undefined}
            aria-required
            className={`${inputClass} ${border('cidade')}`}
          />
          {hint('cidade')}
          {cidadeNote && (
            <p id="mining-cidade-note" className="mt-1 text-xs text-slate-400">
              {cidadeNote}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="mining-bairro" className="mb-1 block text-sm font-semibold text-slate-200">
            Bairro
          </label>
          <Combobox
            id="mining-bairro"
            value={values.bairro}
            options={bairros.items}
            loading={bairros.status === 'loading'}
            disabled={!bairroOk}
            maxLength={TEXT_MAX}
            placeholder="Ex.: Vila Mariana"
            onChange={(t) => update('bairro', t)}
            aria-describedby={bairroHintId}
            aria-invalid={!!serverErrors.bairro || undefined}
            aria-required
            className={`${inputClass} ${border('bairro')}`}
          />
          {hint('bairro')}
          {bairroNote && (
            <p id="mining-bairro-note" className="mt-1 text-xs text-slate-400">
              {bairroNote}
            </p>
          )}
        </div>
      </div>

      <PreviousRunNotice
        params={lookupParams(values)}
        onRemine={() => void submit()}
        remineDisabled={!enabled}
        remineHint={submitting ? 'Iniciando…' : pending.nichos ? 'Selecione ao menos um nicho.' : undefined}
      />

      <SourcePicker
        value={values.fonte}
        onChange={(fonte) => update('fonte', fonte)}
        services={services}
        disabled={submitting}
      />

      <PresetPicker active={matchingPreset(values.nichos)} onPick={pickPreset} />

      <div>
        <NicheChecklist
          selected={values.nichos}
          onChange={(nichos) => update('nichos', nichos)}
          describedBy={describedBy('nichos')}
          invalid={!!serverErrors.nichos}
        />
        {hint('nichos')}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
        <div className="flex items-center gap-2">
          <input
            id="mining-excluir-redes"
            type="checkbox"
            checked={values.excluirRedes}
            onChange={(e) => update('excluirRedes', e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          />
          <label htmlFor="mining-excluir-redes" className="text-sm text-slate-300">
            Excluir redes e franquias
          </label>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <input
              id="mining-ia"
              type="checkbox"
              checked={iaAvailable && values.iaEnabled}
              disabled={!iaAvailable}
              onChange={(e) => update('iaEnabled', e.target.checked)}
              aria-describedby={!iaAvailable ? 'mining-ia-hint' : undefined}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <label
              htmlFor="mining-ia"
              className={`flex items-center gap-1 text-sm ${iaAvailable ? 'text-slate-300' : 'text-slate-400'}`}
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
              Usar IA
            </label>
          </div>
          {!iaAvailable && (
            <p id="mining-ia-hint" className="text-xs text-slate-400">
              {ia === 'loading'
                ? 'Verificando disponibilidade da IA…'
                : ia === 'error'
                  ? 'IA indisponível: não foi possível verificar a configuração'
                  : IA_UNAVAILABLE_TEXT}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <input
              id="mining-pagespeed"
              type="checkbox"
              checked={values.pagespeedEnabled && !pagespeedBlocked}
              disabled={!!pagespeedBlocked}
              onChange={(e) => update('pagespeedEnabled', e.target.checked)}
              aria-describedby="mining-pagespeed-hint"
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <label htmlFor="mining-pagespeed" className={`text-sm ${pagespeedBlocked ? 'text-slate-400' : 'text-slate-300'}`}>
              Analisar desempenho (PageSpeed)
            </label>
          </div>
          <p id="mining-pagespeed-hint" className="text-xs text-slate-400">
            {pagespeedBlocked ?? (services?.pagespeed.semChave ? 'Sem chave: usa a cota reduzida do Google' : '')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="mining-cnpj"
            type="checkbox"
            checked={values.cnpjEnabled}
            onChange={(e) => update('cnpjEnabled', e.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          />
          <label htmlFor="mining-cnpj" className="text-sm text-slate-300">
            Consultar CNPJ (BrasilAPI)
          </label>
        </div>
      </div>

      {generalError && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {RUN_NOT_STARTED_TEXT} {generalError}
          </span>
        </p>
      )}

      <div className="flex flex-col items-start gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p id="mining-submit-hint" className="text-xs text-slate-400" aria-live="polite">
          {submitting
            ? 'Iniciando mineração…'
            : pendingCount > 0
              ? `Preencha ${pendingCount === 1 ? 'o campo pendente' : `os ${pendingCount} campos pendentes`} para iniciar.`
              : 'Tudo pronto para minerar.'}
        </p>
        <button
          type="submit"
          disabled={!enabled}
          aria-describedby="mining-submit-hint"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:from-purple-500 hover:to-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Pickaxe className="h-4 w-4" aria-hidden="true" />
          )}
          {submitting ? 'Iniciando…' : 'Iniciar mineração'}
        </button>
      </div>
    </form>
  );
};

export default MiningForm;
