/**
 * Lógica pura de apresentação da Etapa 3 (Req. 2.6, 4.9, 6.4, 6.5, 12.6, 17.2). Sem React e
 * sem rede: testável em node. Todas as funções recebem dados já tipados do `client-api`.
 */
import type { ApproachFallbackReason, MiningSource, ServicesStatus } from '@/lib/leads/client-api';
import type { CnpjOrigin, PageSpeedAbsence } from '@/lib/leads/types';

// ---------------------------------------------------------------------------
// PageSpeed (Req. 17.2)
// ---------------------------------------------------------------------------

export type PageSpeedBand = 'BOM' | 'MELHORAR' | 'RUIM';

export interface PageSpeedBandInfo {
  band: PageSpeedBand;
  /** Rótulo em português, sempre acompanhando a cor (acessibilidade, Req. 17.6). */
  label: string;
  /** Classe Tailwind de cor do texto. */
  className: string;
}

/** Faixa de uma nota 0–100 do PageSpeed: "Bom" ≥ 90, "Precisa melhorar" 50–89, "Ruim" < 50. */
export function pageSpeedBand(score: number | null | undefined): PageSpeedBandInfo | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score >= 90) return { band: 'BOM', label: 'Bom', className: 'text-emerald-400' };
  if (score >= 50) return { band: 'MELHORAR', label: 'Precisa melhorar', className: 'text-amber-400' };
  return { band: 'RUIM', label: 'Ruim', className: 'text-rose-400' };
}

/** Motivo da ausência do Resultado_PageSpeed, em português (Req. 17.2). */
const PAGESPEED_ABSENCE_LABEL: Record<PageSpeedAbsence, string> = {
  SEM_SITE: 'Empresa sem site informado',
  SITE_OFFLINE: 'Site fora do ar durante a análise',
  DESABILITADO_NA_MINERACAO: 'Análise de desempenho desativada nesta mineração',
  COTA_ESGOTADA: 'Cota mensal do PageSpeed esgotada',
  ERRO: 'Falha ao consultar o PageSpeed',
  TIMEOUT: 'O PageSpeed não respondeu a tempo',
  RESPOSTA_INVALIDA: 'O PageSpeed devolveu uma resposta inválida',
};

export function pageSpeedAbsenceLabel(reason: PageSpeedAbsence | null | undefined): string {
  return reason ? PAGESPEED_ABSENCE_LABEL[reason] ?? 'Desempenho não avaliado' : 'Desempenho não avaliado';
}

// ---------------------------------------------------------------------------
// WhatsApp (Req. 15.7, 17.1)
// ---------------------------------------------------------------------------

/**
 * Formata um número só de dígitos (12–13, iniciando em 55) como "+55 (11) 99999-8888".
 * Devolve o valor original quando não reconhece o formato.
 */
export function formatWhatsapp(number: string | null | undefined): string | null {
  if (!number) return null;
  const d = number.replace(/\D/g, '');
  if (d.length < 12 || d.length > 13 || !d.startsWith('55')) return number;
  const ddd = d.slice(2, 4);
  const resto = d.slice(4);
  const corte = resto.length === 9 ? 5 : 4;
  return `+55 (${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

// ---------------------------------------------------------------------------
// Situação cadastral (Req. 12.6)
// ---------------------------------------------------------------------------

export interface SituacaoAlert {
  /** true quando a situação é diferente de ATIVA (badge de alerta). */
  alerta: boolean;
  label: string;
  className: string;
}

/** Alerta de situação cadastral: ATIVA é neutra; qualquer outra é destacada (Req. 12.6). */
export function situacaoAlert(situacao: string | null | undefined): SituacaoAlert | null {
  const s = (situacao ?? '').trim();
  if (s === '') return null;
  const ativa = s.toUpperCase() === 'ATIVA';
  return {
    alerta: !ativa,
    label: ativa ? 'Ativa' : `CNPJ ${s.toUpperCase()}`,
    className: ativa ? 'text-emerald-400' : 'text-amber-400',
  };
}

// ---------------------------------------------------------------------------
// Origem do CNPJ (Req. 17.3)
// ---------------------------------------------------------------------------

const CNPJ_ORIGIN_LABEL: Record<CnpjOrigin, string> = {
  SITE: 'Encontrado no site',
  MANUAL: 'Informado manualmente',
};

export function cnpjOriginLabel(origem: CnpjOrigin | null | undefined): string {
  return origem ? CNPJ_ORIGIN_LABEL[origem] ?? 'Origem desconhecida' : 'Origem desconhecida';
}

// ---------------------------------------------------------------------------
// Fallback da mensagem de abordagem (Req. 15.4)
// ---------------------------------------------------------------------------

const FALLBACK_LABEL: Record<ApproachFallbackReason, string> = {
  IA_SEM_CHAVE: 'Mensagem gerada pelo modelo padrão (IA sem chave configurada)',
  IA_COTA_ESGOTADA: 'Mensagem gerada pelo modelo padrão (cota de IA esgotada)',
  IA_ERRO: 'Mensagem gerada pelo modelo padrão (falha na IA)',
  IA_TIMEOUT: 'Mensagem gerada pelo modelo padrão (a IA não respondeu a tempo)',
  IA_RESPOSTA_INVALIDA: 'Mensagem gerada pelo modelo padrão (resposta inválida da IA)',
};

/** Texto exibido quando a mensagem veio do modelo fixo (Req. 15.4); null quando veio da IA. */
export function fallbackLabel(reason: ApproachFallbackReason | null | undefined): string | null {
  if (!reason) return null;
  return FALLBACK_LABEL[reason] ?? 'Mensagem gerada pelo modelo padrão';
}

// ---------------------------------------------------------------------------
// Serviços indisponíveis (Req. 2.6, 2.7)
// ---------------------------------------------------------------------------

/** Rótulo do estado de um Servico_Externo a partir do motivo (Req. 2.6). */
export function unavailableLabel(motivo: 'SEM_CHAVE' | 'COTA_ESGOTADA' | null | undefined): string {
  if (motivo === 'SEM_CHAVE') return 'chave não configurada';
  if (motivo === 'COTA_ESGOTADA') return 'cota mensal esgotada';
  return 'disponível';
}

/** "N de M chamadas" de um serviço no mês (Req. 2.6). */
export function usageSummary(usados: number, limite: number): string {
  return `${usados} de ${limite} chamadas`;
}

// ---------------------------------------------------------------------------
// Fonte_Efetiva (Req. 4.9, 18.3)
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<MiningSource, string> = {
  OSM: 'OpenStreetMap',
  GOOGLE: 'Google Places',
  MISTA: 'Google + OpenStreetMap',
};

export function sourceLabel(fonte: MiningSource): string {
  return SOURCE_LABEL[fonte] ?? fonte;
}

/** "solicitada → efetiva" (Req. 18.3); quando iguais, só o rótulo da fonte. */
export function sourceSummary(solicitada: MiningSource, efetiva: MiningSource): string {
  return solicitada === efetiva
    ? sourceLabel(efetiva)
    : `${sourceLabel(solicitada)} → ${sourceLabel(efetiva)}`;
}

// ---------------------------------------------------------------------------
// Google Places não usado (Req. 4.9)
// ---------------------------------------------------------------------------

export type GoogleUnusedReason = 'SEM_CHAVE' | 'COTA_ESGOTADA' | 'ERRO';

const GOOGLE_UNUSED_TEXT: Record<GoogleUnusedReason, string> = {
  SEM_CHAVE: 'Google Places não usado: chave não configurada',
  COTA_ESGOTADA: 'Google Places não usado: cota mensal esgotada',
  ERRO: 'Google Places falhou; Nichos concluídos pelo OpenStreetMap',
};

/** Um dos três textos do Req. 4.9; null quando o Google foi usado normalmente. */
export function googleUnusedText(motivo: GoogleUnusedReason | null | undefined): string | null {
  return motivo ? GOOGLE_UNUSED_TEXT[motivo] ?? null : null;
}

/** Estado resumido de disponibilidade de cada serviço, para o painel (Req. 2.6). */
export function serviceLine(state: ServicesStatus['places']): { label: string; usage: string } {
  return { label: unavailableLabel(state.motivo), usage: usageSummary(state.usados, state.limite) };
}
