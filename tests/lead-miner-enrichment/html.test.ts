/**
 * Exemplos de lib/leads/html.ts (decodificação e extração tolerante).
 * **Validates: Requirements 7.3, 7.4, 11.3**
 */
import { describe, expect, it } from 'vitest';
import { decodeHtml, extractAssets, extractLinks, htmlSearchText, isHtmlContentType } from '@/lib/leads/html';

const utf8 = (s: string) => new TextEncoder().encode(s);
/** windows-1252 para o subconjunto Latin-1 usado nos testes. */
const latin1 = (s: string) => Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0)));

describe('isHtmlContentType', () => {
  it('aceita text/html e application/xhtml+xml com parâmetros e maiúsculas', () => {
    expect(isHtmlContentType('text/html')).toBe(true);
    expect(isHtmlContentType(' Text/HTML ; charset=UTF-8')).toBe(true);
    expect(isHtmlContentType('application/xhtml+xml')).toBe(true);
  });
  it('rejeita null e outros tipos', () => {
    expect(isHtmlContentType(null)).toBe(false);
    expect(isHtmlContentType('application/json')).toBe(false);
    expect(isHtmlContentType('text/htmlx')).toBe(false);
  });
});

describe('decodeHtml', () => {
  const texto = 'Padaria São João — açúcar';
  it('usa o charset do Content-Type', () => {
    expect(decodeHtml(latin1('Padaria São João'), 'text/html; charset=windows-1252')).toBe('Padaria São João');
    expect(decodeHtml(utf8(texto), 'text/html; charset="utf-8"')).toBe(texto);
  });
  it('usa <meta charset> e http-equiv nos primeiros 2 KiB', () => {
    const a = '<meta charset="iso-8859-1"><p>Ação</p>';
    expect(decodeHtml(latin1(a), 'text/html')).toBe(a);
    const b = '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><p>Café</p>';
    expect(decodeHtml(latin1(b), null)).toBe(b);
  });
  it('ignora <meta charset> além de 2 KiB e cai para UTF-8', () => {
    const doc = ' '.repeat(2100) + '<meta charset="windows-1252">Ação';
    expect(decodeHtml(utf8(doc), 'text/html')).toBe(doc);
  });
  it('o cabeçalho vence a meta', () => {
    const doc = '<meta charset="windows-1252">Ação';
    expect(decodeHtml(utf8(doc), 'text/html; charset=utf-8')).toBe(doc);
  });
  it('charset desconhecido e bytes inválidos: UTF-8 com substituição, sem lançar', () => {
    expect(decodeHtml(utf8('olá'), 'text/html; charset=x-nao-existe')).toBe('olá');
    expect(decodeHtml(Uint8Array.from([0x61, 0xff, 0x62]), null)).toBe('a\uFFFDb');
  });
});

describe('htmlSearchText', () => {
  it('inclui texto visível e atributos, sem script/style/comentários, com entidades', () => {
    const html =
      '<html><head><style>.x{content:"11.111.111/0001-11"}</style>' +
      '<script>var c="22.222.222/0001-22";</script></head>' +
      '<body><!-- 33.333.333/0001-33 --><p>CNPJ: 12.345.678<b>/0001-95</b></p>' +
      '<p>Caf&eacute; &amp; P&atilde;o&nbsp;&#x41;&#66;</p>' +
      '<a data-cnpj="45.723.174/0001-10" href="/x">link</a></body></html>';
    const out = htmlSearchText(html);
    expect(out).toContain('CNPJ: 12.345.678/0001-95');
    expect(out).toContain('Café & Pão AB');
    expect(out).toContain('45.723.174/0001-10');
    expect(out).not.toContain('11.111.111');
    expect(out).not.toContain('22.222.222');
    expect(out).not.toContain('33.333.333');
  });
});

describe('extractLinks / extractAssets', () => {
  const html = `<!doctype html><HTML><head>
    <META NAME="Generator" CONTENT="WordPress 6.4">
    <link rel=stylesheet href=/wp-content/themes/x/style.css>
    <script src='https://code.jquery.com/jquery.min.js'></script>
    <script>fbq('init', '123');</script>
    <SCRIPT type="text/javascript">gtag("GTM-ABC1")</SCRIPT >
  </head><body>
    <a href="https://www.instagram.com/padaria.sj/?hl=pt">IG</a>
    <a class="btn" href="https://wa.me/5511999998888?text=oi&amp;x=1">WA</a>
    <a href="https://www.instagram.com/padaria.sj/?hl=pt">dup</a>
  </body></HTML>`;

  it('extrai hrefs de qualquer elemento, decodificados e sem repetição', () => {
    expect(extractLinks(html)).toEqual([
      '/wp-content/themes/x/style.css',
      'https://www.instagram.com/padaria.sj/?hl=pt',
      'https://wa.me/5511999998888?text=oi&x=1',
    ]);
  });

  it('separa generator, assets e scripts inline', () => {
    const a = extractAssets(html);
    expect(a.generator).toEqual(['WordPress 6.4']);
    expect(a.assets).toEqual(['/wp-content/themes/x/style.css', 'https://code.jquery.com/jquery.min.js']);
    expect(a.inline).toEqual(["fbq('init', '123');", 'gtag("GTM-ABC1")']);
  });

  it('tolera HTML malformado sem lançar', () => {
    for (const bad of ['<a href="x', '<script>nunca fecha', '<!-- sem fim', '< <<a', '<a =b href=c>', '</']) {
      expect(() => extractAssets(bad)).not.toThrow();
      expect(() => extractLinks(bad)).not.toThrow();
      expect(() => htmlSearchText(bad)).not.toThrow();
    }
    expect(extractLinks('<a =b href=c>')).toEqual(['c']);
  });

  it('processa entradas adversariais de 1 MiB rapidamente', () => {
    const MiB = 1 << 20;
    const inputs = [
      '<script>'.repeat(MiB / 8),
      '<style>'.repeat(MiB / 7) ,
      '<a href='.repeat(MiB / 8),
      '<a b c d e f '.repeat(MiB / 13),
      '<!--'.repeat(MiB / 4),
      '&#'.repeat(MiB / 2),
      '<meta charset='.repeat(MiB / 14),
    ];
    const t0 = Date.now();
    for (const s of inputs) {
      htmlSearchText(s);
      extractLinks(s);
      extractAssets(s);
      decodeHtml(utf8(s), 'text/html');
    }
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
