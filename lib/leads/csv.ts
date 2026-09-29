/**
 * Exportador CSV do Minerador de Leads (Req. 17.2–17.7).
 *
 * Módulo puro e isomórfico: sem imports de Node, Prisma ou `server-only`.
 *
 * Formato gerado por `buildCsv`:
 * - UTF-8 com BOM (`\uFEFF`) no início do texto;
 * - separador `;` e registros separados por CRLF;
 * - valores com `"`, `;`, CR ou LF entre aspas duplas, com aspas internas duplicadas (RFC 4180);
 * - valores iniciados por `=`, `+`, `-`, `@`, TAB ou CR prefixados com `'` (injeção de fórmulas).
 */

import { CATEGORY_LABEL, EXPORT_MAX, NICHES, PRIORITY_LABEL } from './config';
import type { CategoryCode, PriorityCode } from './types';

// ---------------------------------------------------------------------------
// Cabeçalho e linha (Req. 17.2, 17.3)
// ---------------------------------------------------------------------------

/** Rótulos das 13 colunas, na ordem do Req. 17.2. */
export const CSV_HEADER: readonly string[] = [
  'Nome',
  'Nicho',
  'Endereço',
  'Bairro',
  'Cidade',
  'UF',
  'Telefone',
  'Website',
  'Categoria',
  'Score Final',
  'Prioridade',
  'Responsável',
  'Data da última análise',
];

/** Dados de uma Empresa necessários para uma linha do CSV. */
export interface ExportRow {
  nome: string;
  /** Id do nicho (convertido para o rótulo em português). */
  nicho: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  website: string | null;
  categoria: CategoryCode | null;
  scoreFinal: number | null;
  prioridade: PriorityCode | null;
  /** Nome do Responsável; null quando não há. */
  responsavelNome: string | null;
  /** Data da última análise; null quando a Empresa nunca foi analisada. */
  ultimaAnaliseEm: Date | string | null;
}

const NICHE_LABEL: ReadonlyMap<string, string> = new Map(NICHES.map((n) => [n.id, n.label]));

/** Fuso usado para a data exibida (as datas são gravadas em UTC). */
const DATE_TIME_ZONE = 'America/Sao_Paulo';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: DATE_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Formata a data como DD/MM/AAAA; célula vazia para ausente ou inválida. */
function formatDate(value: Date | string | null): string {
  if (value === null || value === undefined) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = dateFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/** Score_Final como inteiro de 0 a 100; célula vazia se ausente. */
function formatScore(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(Math.min(100, Math.max(0, Math.round(value))));
}

const text = (v: string | null | undefined): string => v ?? '';

/** Converte uma Empresa nas 13 células (sem escape nem sanitização). */
export function toCsvRow(c: ExportRow): string[] {
  return [
    text(c.nome),
    c.nicho ? (NICHE_LABEL.get(c.nicho) ?? c.nicho) : '',
    text(c.endereco),
    text(c.bairro),
    text(c.cidade),
    text(c.uf),
    text(c.telefone),
    text(c.website),
    c.categoria ? CATEGORY_LABEL[c.categoria] : '',
    formatScore(c.scoreFinal),
    c.prioridade ? PRIORITY_LABEL[c.prioridade] : '',
    text(c.responsavelNome),
    formatDate(c.ultimaAnaliseEm),
  ];
}

// ---------------------------------------------------------------------------
// Sanitização e escape (Req. 17.4, 17.5)
// ---------------------------------------------------------------------------

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Prefixa `'` quando o primeiro caractere pode iniciar uma fórmula; caso contrário, inalterado. */
export function sanitizeCell(v: string): string {
  return v.length > 0 && FORMULA_TRIGGERS.has(v[0]) ? `'${v}` : v;
}

const NEEDS_QUOTES = /[";\r\n]/;

/** Escape RFC 4180: aspas quando há `"`, `;`, CR ou LF, duplicando as aspas internas. */
function escapeCell(v: string): string {
  return NEEDS_QUOTES.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const BOM = '\uFEFF';
const SEPARATOR = ';';
const CRLF = '\r\n';

/** Gera o texto CSV (BOM + `;` + CRLF + RFC 4180), sanitizando cada célula. */
export function buildCsv(rows: string[][]): string {
  const lines = rows.map((row) => {
    // Registro de uma única célula vazia vira `""` para não ser confundido com linha em branco.
    if (row.length === 1 && row[0] === '') return '""';
    return row.map((cell) => escapeCell(sanitizeCell(cell))).join(SEPARATOR);
  });
  return BOM + lines.join(CRLF);
}

// ---------------------------------------------------------------------------
// Parser (usado nos testes de round-trip, Req. 17.6)
// ---------------------------------------------------------------------------

/**
 * Parser RFC 4180 com separador `;`. Remove o BOM inicial, aceita CRLF, LF ou CR como fim
 * de registro fora de aspas e ignora um fim de linha final. Não remove o prefixo `'`.
 */
export function parseCsv(input: string): string[][] {
  const src = input.startsWith(BOM) ? input.slice(BOM.length) : input;
  const records: string[][] = [];
  if (src.length === 0) return records;

  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endRecord = () => {
    record.push(field);
    records.push(record);
    record = [];
    field = '';
  };

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === SEPARATOR) {
      record.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      // Fim de linha no final do texto não abre um novo registro.
      if (i >= src.length) return records;
    } else {
      field += ch;
      i += 1;
    }
  }

  endRecord();
  return records;
}

// ---------------------------------------------------------------------------
// Limite de exportação (Req. 17.7)
// ---------------------------------------------------------------------------

/** Mantém as `max` primeiras linhas, na ordem original, e informa se houve corte. */
export function limitExport<T>(
  rows: T[],
  max: number = EXPORT_MAX,
): { rows: T[]; truncated: boolean; total: number } {
  const total = rows.length;
  const truncated = total > max;
  return { rows: truncated ? rows.slice(0, max) : rows, truncated, total };
}
