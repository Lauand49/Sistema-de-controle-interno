/**
 * Lógica pura da Tela_Minerar (Req. 7.5, 10.1–10.6, 10.10). Sem React e sem rede: testável em node.
 */
import { NICHES, PRESETS, UFS, type Niche, type NicheTier, type PresetId } from '@/lib/leads/config';
import type { CreateRunInput, RunLookup } from '@/lib/leads/client-api';

export const TEXT_MAX = 100;

export interface MiningFormValues {
  bairro: string;
  cidade: string;
  uf: string;
  nichos: string[];
  excluirRedes: boolean;
  iaEnabled: boolean;
}

export type MiningFormField = 'bairro' | 'cidade' | 'uf' | 'nichos';
export const MINING_FORM_FIELDS: readonly MiningFormField[] = ['bairro', 'cidade', 'uf', 'nichos'];

export const INITIAL_FORM_VALUES: MiningFormValues = {
  bairro: '',
  cidade: '',
  uf: '',
  nichos: [],
  excluirRedes: false,
  iaEnabled: false,
};

export const PENDING_MESSAGES: Record<MiningFormField, string> = {
  bairro: 'Preencha o bairro.',
  cidade: 'Preencha a cidade.',
  uf: 'Selecione a UF.',
  nichos: 'Selecione ao menos um nicho.',
};

export const IA_UNAVAILABLE_TEXT = 'IA indisponível: chave não configurada';
export const RUN_NOT_STARTED_TEXT = 'A mineração não foi iniciada.';

export const PRESET_OPTIONS: readonly { id: PresetId; label: string; description: string }[] = [
  { id: 'icp', label: 'ICP', description: 'Nichos do tier 1' },
  { id: 'servico', label: 'Serviços', description: 'Negócios de prestação de serviço' },
  { id: 'produto', label: 'Produtos', description: 'Negócios de venda de produto' },
  { id: 'todos', label: 'Todos', description: `Os ${NICHES.length} nichos` },
];

export const TIER_LABEL: Record<NicheTier, string> = {
  1: 'Tier 1 · ICP',
  2: 'Tier 2',
  3: 'Tier 3',
};

const UF_SET = new Set(UFS);
const NICHE_ORDER = new Map(NICHES.map((n, i) => [n.id, i]));

/** Nichos agrupados por tier, na ordem da configuração. */
export function nichesByTier(): { tier: NicheTier; niches: Niche[] }[] {
  const tiers: NicheTier[] = [1, 2, 3];
  return tiers
    .map((tier) => ({ tier, niches: NICHES.filter((n) => n.tier === tier) }))
    .filter((g) => g.niches.length > 0);
}

function sortNiches(ids: Iterable<string>): string[] {
  return Array.from(new Set(ids))
    .filter((id) => NICHE_ORDER.has(id))
    .sort((a, b) => NICHE_ORDER.get(a)! - NICHE_ORDER.get(b)!);
}

/** Exatamente os nichos do preset (Req. 10.2). */
export function presetNiches(preset: PresetId): string[] {
  return sortNiches(PRESETS[preset]);
}

/** Marca/desmarca um nicho, mantendo a ordem da configuração. */
export function toggleNiche(nichos: readonly string[], id: string, checked: boolean): string[] {
  const set = new Set(nichos);
  if (checked) set.add(id);
  else set.delete(id);
  return sortNiches(set);
}

/** Marca/desmarca todos os nichos de um tier. */
export function toggleTier(nichos: readonly string[], tier: NicheTier, checked: boolean): string[] {
  const set = new Set(nichos);
  for (const n of NICHES) {
    if (n.tier !== tier) continue;
    if (checked) set.add(n.id);
    else set.delete(n.id);
  }
  return sortNiches(set);
}

/** Preset cuja lista coincide exatamente com a seleção atual (ou null). */
export function matchingPreset(nichos: readonly string[]): PresetId | null {
  const sel = sortNiches(nichos);
  for (const opt of PRESET_OPTIONS) {
    const p = presetNiches(opt.id);
    if (p.length === sel.length && p.every((id, i) => id === sel[i])) return opt.id;
  }
  return null;
}

/** Campos pendentes com a indicação a exibir junto de cada um (Req. 10.3). */
export function pendingFields(v: MiningFormValues): Partial<Record<MiningFormField, string>> {
  const out: Partial<Record<MiningFormField, string>> = {};
  if (v.bairro.trim() === '') out.bairro = PENDING_MESSAGES.bairro;
  if (v.cidade.trim() === '') out.cidade = PENDING_MESSAGES.cidade;
  if (!UF_SET.has(v.uf)) out.uf = PENDING_MESSAGES.uf;
  if (sortNiches(v.nichos).length === 0) out.nichos = PENDING_MESSAGES.nichos;
  return out;
}

/** O botão de iniciar só fica habilitado sem pendências e fora de um envio (Req. 10.3, 10.6). */
export function canSubmit(v: MiningFormValues, submitting: boolean): boolean {
  return !submitting && Object.keys(pendingFields(v)).length === 0;
}

/** Corpo do `POST /runs`; "usar IA" só vale quando a IA está disponível (Req. 7.5). */
export function buildCreateRunInput(v: MiningFormValues, iaAvailable: boolean): CreateRunInput {
  return {
    bairro: v.bairro.trim(),
    cidade: v.cidade.trim(),
    uf: v.uf,
    nichos: sortNiches(v.nichos),
    excluirRedes: v.excluirRedes,
    iaEnabled: iaAvailable && v.iaEnabled,
  };
}

/** Parâmetros do `/runs/lookup`, ou null enquanto bairro/cidade/UF não estão completos (Req. 10.4). */
export function lookupParams(v: Pick<MiningFormValues, 'bairro' | 'cidade' | 'uf'>): { bairro: string; cidade: string; uf: string } | null {
  const bairro = v.bairro.trim();
  const cidade = v.cidade.trim();
  if (bairro === '' || cidade === '' || bairro.length > TEXT_MAX || cidade.length > TEXT_MAX) return null;
  if (!UF_SET.has(v.uf)) return null;
  return { bairro, cidade, uf: v.uf };
}

/** Chave estável dos parâmetros do lookup (para evitar consultas repetidas). */
export function lookupKey(p: { bairro: string; cidade: string; uf: string } | null): string {
  return p ? JSON.stringify([p.bairro, p.cidade, p.uf]) : '';
}

/** DD/MM no fuso local; string vazia para data inválida. */
export function formatDayMonth(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/** "Bairro já minerado em DD/MM por Fulano (N leads)" (Req. 10.4). */
export function previousRunMessage(run: Pick<RunLookup, 'createdAt' | 'total' | 'createdBy'>): string {
  const name = run.createdBy?.name?.trim() || 'usuário desconhecido';
  return `Bairro já minerado em ${formatDayMonth(run.createdAt)} por ${name} (${run.total} leads)`;
}

/**
 * Distribui os erros por campo de um 400: campos conhecidos vão para o formulário; o restante
 * (ex.: `_`, `preset`, `excluirRedes`) vira uma mensagem geral.
 */
export function splitFieldErrors(fields: Record<string, string> | undefined): {
  byField: Partial<Record<MiningFormField, string>>;
  general: string[];
} {
  const byField: Partial<Record<MiningFormField, string>> = {};
  const general: string[] = [];
  for (const [key, msg] of Object.entries(fields ?? {})) {
    if ((MINING_FORM_FIELDS as readonly string[]).includes(key)) byField[key as MiningFormField] = msg;
    else if (!general.includes(msg)) general.push(msg);
  }
  return { byField, general };
}

/** Rótulo curto da mineração criada nesta tela, para o card de progresso. */
export function runTitle(input: Pick<CreateRunInput, 'bairro' | 'cidade' | 'uf'>): string {
  return `${input.bairro}, ${input.cidade}/${input.uf}`;
}
