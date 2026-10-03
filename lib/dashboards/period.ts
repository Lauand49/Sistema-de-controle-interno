/**
 * Periodo, Dia_Referencia e janelas dos painéis (puro e isomórfico).
 *
 * Todos os dias civis são calculados em America/Sao_Paulo via Intl, então o
 * resultado não depende de `process.env.TZ`. O Dia_Prazo (`dueDate`) é lido
 * pela parte de data em UTC, porque a API grava "AAAA-MM-DD" como meia-noite UTC.
 */

export const PERIODS = ['7d', '30d', '90d', 'tudo'] as const;
export type Periodo = (typeof PERIODS)[number];
export const DEFAULT_PERIODO: Periodo = '30d';
export const PERIOD_DAYS: Record<Exclude<Periodo, 'tudo'>, number> = { '7d': 7, '30d': 30, '90d': 90 };
export const TIME_ZONE = 'America/Sao_Paulo';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'en-CA' formata como 'AAAA-MM-DD'. */
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Partes de data e hora em São Paulo, para medir o deslocamento do fuso. */
const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** null/'' → '30d'; valor válido → ele; qualquer outro → null (rota responde 400). */
export function parsePeriodo(raw: string | null | undefined): Periodo | null {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_PERIODO;
  return (PERIODS as readonly string[]).includes(raw) ? (raw as Periodo) : null;
}

/** Dia civil de um instante em São Paulo, 'AAAA-MM-DD' (Dia_Referencia). */
export function saoPauloDayKey(instant: Date): string {
  return dayKeyFormatter.format(instant);
}

/** Dia_Prazo: parte de data em UTC de `dueDate` ('AAAA-MM-DD'); a hora não altera o dia. */
export function dueDayKey(due: Date): string {
  return due.toISOString().slice(0, 10);
}

function parseDayKey(dayKey: string): [number, number, number] {
  const [y, m, d] = dayKey.split('-').map(Number);
  return [y, m, d];
}

/** Soma dias a uma chave 'AAAA-MM-DD' (aritmética em UTC, sem fuso). */
export function addDays(dayKey: string, days: number): string {
  const [y, m, d] = parseDayKey(dayKey);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Deslocamento de São Paulo em `ms` (hora local − hora UTC), em milissegundos. */
function saoPauloOffsetMs(ms: number): number {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  // Ignora milissegundos: formatToParts não os expõe.
  return localAsUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * Primeiro instante cujo dia em São Paulo é `dayKey` (deslocamento lido via Intl.formatToParts).
 * Normalmente é 00:00 local; em dias de início do horário de verão (00:00 salta para 01:00,
 * a meia-noite não existe) é 01:00 local, o instante da transição.
 */
export function startOfSaoPauloDay(dayKey: string): Date {
  const [y, m, d] = parseDayKey(dayKey);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - saoPauloOffsetMs(guess);
  // Segunda passada: cobre a fronteira de mudança de horário.
  const second = guess - saoPauloOffsetMs(first);
  // `second` é 00:00 local de `dayKey` se a meia-noite existe nesse dia.
  if (second + saoPauloOffsetMs(second) === guess) return new Date(second);

  // Meia-noite inexistente: os dois candidatos ficam um em cada lado da transição.
  // Busca binária pelo primeiro milissegundo que já pertence a `dayKey`.
  let lo = Math.min(first, second);
  let hi = Math.max(first, second);
  if (saoPauloDayKey(new Date(lo)) === dayKey || saoPauloDayKey(new Date(hi)) !== dayKey) {
    return new Date(second);
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (saoPauloDayKey(new Date(mid)) === dayKey) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

export interface PeriodWindow {
  key: Periodo;
  from: Date | null;
  to: Date;
}

/** 'Nd': from = início do dia (N − 1) dias antes do Dia_Referencia; 'tudo': from = null; to = now. */
export function periodWindow(periodo: Periodo, now: Date): PeriodWindow {
  if (periodo === 'tudo') return { key: periodo, from: null, to: now };
  const firstDay = addDays(saoPauloDayKey(now), -(PERIOD_DAYS[periodo] - 1));
  return { key: periodo, from: startOfSaoPauloDay(firstDay), to: now };
}

export interface MetricContext {
  now: Date;
  /** Dia_Referencia. */
  todayKey: string;
  /** Meia-noite UTC do Dia_Referencia: dueDate < corte ⇔ Dia_Prazo < hoje. */
  overdueCutoff: Date;
  window: PeriodWindow;
}

export function buildMetricContext(now: Date, periodo: Periodo): MetricContext {
  const todayKey = saoPauloDayKey(now);
  return {
    now,
    todayKey,
    overdueCutoff: new Date(`${todayKey}T00:00:00.000Z`),
    window: periodWindow(periodo, now),
  };
}

/** (from === null || from ≤ t) && t ≤ to. */
export function inWindow(instant: Date, w: PeriodWindow): boolean {
  const t = instant.getTime();
  return (w.from === null || w.from.getTime() <= t) && t <= w.to.getTime();
}
