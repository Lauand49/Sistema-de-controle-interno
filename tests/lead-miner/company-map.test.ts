import { describe, expect, it } from 'vitest';
import {
  EMPTY_VALUE,
  MAP_COLORS,
  MAP_LEGEND,
  fichaHref,
  markerColor,
  popupContent,
  truncationNotice,
} from '@/components/lead-miner/company-map-helpers';

describe('CompanyMap helpers', () => {
  it('usa quatro cores distintas, uma por prioridade e uma sem prioridade (Req. 13.4)', () => {
    expect(new Set(Object.values(MAP_COLORS)).size).toBe(4);
    expect(markerColor('ALTA')).toBe('#22c55e');
    expect(markerColor('MEDIA')).toBe('#f59e0b');
    expect(markerColor('BAIXA')).toBe('#94a3b8');
    expect(markerColor(null)).toBe('#a855f7');
  });

  it('legenda relaciona cada cor a um rótulo em texto (Req. 13.4, 19.7)', () => {
    expect(MAP_LEGEND.map((l) => l.label)).toEqual(['Alta', 'Média', 'Baixa', 'Sem prioridade (não analisada)']);
    expect(MAP_LEGEND.map((l) => l.color)).toEqual(Object.values(MAP_COLORS));
  });

  it('popup de empresa analisada mostra categoria, score, prioridade e link (Req. 13.5)', () => {
    const c = popupContent({ id: 'abc', nome: 'Padaria <b>X</b>', categoria: 'CRIAR_SITE', scoreFinal: 82, prioridade: 'ALTA' });
    expect(c).toEqual({
      nome: 'Padaria <b>X</b>',
      categoria: 'Criar Site do Zero',
      score: '82',
      prioridade: 'Alta',
      href: '/tools/lead-miner/leads/abc',
    });
  });

  it('popup de empresa não analisada mostra "—" (Req. 13.5)', () => {
    const c = popupContent({ id: 'x', nome: 'Loja', categoria: null, scoreFinal: null, prioridade: null });
    expect([c.categoria, c.score, c.prioridade]).toEqual([EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE]);
  });

  it('link da ficha codifica o id', () => {
    expect(fichaHref('a/b')).toBe('/tools/lead-miner/leads/a%2Fb');
  });

  it('aviso de truncamento só aparece quando total > exibidos (Req. 13.2)', () => {
    expect(truncationNotice(10, 10)).toBeNull();
    expect(truncationNotice(0, 0)).toBeNull();
    const msg = truncationNotice(2000, 3500);
    expect(msg).toContain('2.000');
    expect(msg).toContain('3.500');
  });
});
