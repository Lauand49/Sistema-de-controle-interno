import { describe, expect, it } from 'vitest';
import { buildCsv, CSV_HEADER, limitExport, parseCsv, sanitizeCell, toCsvRow, type ExportRow } from '@/lib/leads/csv';

const BOM = '\uFEFF';

const baseRow: ExportRow = {
  nome: 'Clínica Sorriso',
  nicho: 'clinica_odontologica',
  endereco: 'Rua A, 10',
  bairro: 'Centro',
  cidade: 'São José dos Campos',
  uf: 'SP',
  telefone: '(12) 3333-4444',
  website: 'https://sorriso.com.br',
  categoria: 'OTIMIZACAO_SEGURANCA',
  scoreFinal: 72.4,
  prioridade: 'ALTA',
  responsavelNome: 'Fulano',
  ultimaAnaliseEm: new Date('2026-03-05T15:00:00Z'),
};

describe('buildCsv — formato', () => {
  it('começa com BOM, usa ";" como separador e CRLF entre registros', () => {
    const csv = buildCsv([[...CSV_HEADER], ['a', 'b']]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}${CSV_HEADER.join(';')}\r\na;b`);
  });

  it('cabeçalho tem 13 colunas na ordem do requisito', () => {
    expect(CSV_HEADER).toHaveLength(13);
    expect(CSV_HEADER[0]).toBe('Nome');
    expect(CSV_HEADER[12]).toBe('Data da última análise');
  });
});

describe('buildCsv — escape RFC 4180', () => {
  it('coloca entre aspas e duplica aspas internas', () => {
    expect(buildCsv([['diz "oi"', 'x']])).toBe(`${BOM}"diz ""oi""";x`);
  });

  it('coloca entre aspas valores com ";", CR e LF', () => {
    expect(buildCsv([['a;b', 'l1\nl2', 'l1\r\nl2', 'fim\r']])).toBe(`${BOM}"a;b";"l1\nl2";"l1\r\nl2";"fim\r"`);
  });

  it('não coloca aspas em valores simples', () => {
    expect(buildCsv([['São Paulo', 'ação']])).toBe(`${BOM}São Paulo;ação`);
  });
});

describe('sanitizeCell — neutralização de fórmulas', () => {
  it.each(['=SUM(A1)', '+55 12', '-1', '@cmd', '\tx', '\rx'])('prefixa apóstrofo em %j', (v) => {
    expect(sanitizeCell(v)).toBe(`'${v}`);
  });

  it.each(['', 'abc', "'=x", ' =x', '1+1'])('mantém %j inalterado', (v) => {
    expect(sanitizeCell(v)).toBe(v);
  });

  it('buildCsv aplica o prefixo e o escape juntos', () => {
    expect(buildCsv([['=1;2', '\r']])).toBe(`${BOM}"'=1;2";"'\r"`);
  });
});

describe('round-trip', () => {
  it('parseCsv recupera as células (com o prefixo de proteção)', () => {
    const rows = [[...CSV_HEADER], toCsvRow(baseRow), toCsvRow({ ...baseRow, telefone: '+55 12 9999', nome: 'A "B"; C\nD' })];
    const parsed = parseCsv(buildCsv(rows));
    expect(parsed).toHaveLength(3);
    expect(parsed[1]).toEqual(rows[1]);
    expect(parsed[2][0]).toBe('A "B"; C\nD');
    expect(parsed[2][6]).toBe("'+55 12 9999");
  });
});

describe('toCsvRow — formatação', () => {
  it('converte nicho, categoria, score, prioridade e data', () => {
    const row = toCsvRow(baseRow);
    expect(row).toHaveLength(13);
    expect(row[1]).toBe('Clínica odontológica');
    expect(row[8]).toBe('Otimização / Segurança');
    expect(row[9]).toBe('72');
    expect(row[10]).toBe('Alta');
    expect(row[11]).toBe('Fulano');
    expect(row[12]).toBe('05/03/2026');
  });

  it('campos ausentes viram células vazias', () => {
    const row = toCsvRow({
      ...baseRow,
      nicho: null,
      telefone: null,
      categoria: null,
      scoreFinal: null,
      prioridade: null,
      responsavelNome: null,
      ultimaAnaliseEm: null,
    });
    expect([row[1], row[6], row[8], row[9], row[10], row[11], row[12]]).toEqual(['', '', '', '', '', '', '']);
  });
});

describe('limitExport', () => {
  it('5.001 linhas → 5.000 e truncated = true', () => {
    const rows = Array.from({ length: 5001 }, (_, i) => i);
    const res = limitExport(rows);
    expect(res.rows).toHaveLength(5000);
    expect(res.rows[4999]).toBe(4999);
    expect(res.truncated).toBe(true);
    expect(res.total).toBe(5001);
  });

  it('5.000 linhas → sem corte', () => {
    const res = limitExport(Array.from({ length: 5000 }, (_, i) => i));
    expect(res.rows).toHaveLength(5000);
    expect(res.truncated).toBe(false);
    expect(res.total).toBe(5000);
  });
});
