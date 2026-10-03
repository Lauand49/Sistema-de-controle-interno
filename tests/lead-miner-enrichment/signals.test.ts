/**
 * Exemplos do Detector_Sinais (lib/leads/signals.ts): formatos de link do Instagram e do
 * WhatsApp, caminhos reservados, tamanhos de número, desempate, fallback OSM e tecnologias.
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 21.5**
 */
import { describe, expect, it } from 'vitest';
import { TECH_CATALOG } from '@/lib/leads/config';
import {
  INSTAGRAM_RESERVED,
  detectSignals,
  detectTechnologies,
  findInstagramHandles,
  findWhatsappNumbers,
  normalizeInstagram,
  normalizeWhatsapp,
} from '@/lib/leads/signals';

const a = (href: string, text = 'link') => `<a href="${href}">${text}</a>`;
const page = (body: string, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const NO_OSM = { instagram: null, whatsapp: null };

describe('Instagram (Req. 8.1)', () => {
  it.each([
    ['https://instagram.com/Padaria.Sol', 'padaria.sol'],
    ['https://www.instagram.com/padaria_sol/', 'padaria_sol'],
    ['http://www.instagram.com/padaria', 'padaria'],
    ['//instagram.com/padaria', 'padaria'],
    ['instagram.com/padaria', 'padaria'],
  ])('reconhece %s', (href, handle) => {
    expect(findInstagramHandles(page(a(href)))).toEqual([handle]);
  });

  it.each(INSTAGRAM_RESERVED.map((r) => [r]))('ignora o caminho reservado /%s', (r) => {
    expect(findInstagramHandles(page(a(`https://www.instagram.com/${r}/abc123/`)))).toEqual([]);
    expect(findInstagramHandles(page(a(`https://instagram.com/${r.toUpperCase()}`)))).toEqual([]);
  });

  it('desconsidera query e fragmento', () => {
    const html = page(
      a('https://www.instagram.com/padaria?igshid=abc123&utm_source=x') + a('https://instagram.com/padaria#top'),
    );
    expect(findInstagramHandles(html)).toEqual(['padaria', 'padaria']);
  });

  it('ignora links sem handle e de outros domínios', () => {
    const html = page(a('https://www.instagram.com/') + a('https://notinstagram.com/x') + a('https://facebook.com/x'));
    expect(findInstagramHandles(html)).toEqual([]);
  });

  it('normaliza valores soltos (tag OSM)', () => {
    expect(normalizeInstagram('@Padaria.Sol')).toBe('padaria.sol');
    expect(normalizeInstagram('padaria/')).toBe('padaria');
    expect(normalizeInstagram('https://instagram.com/Padaria?x=1')).toBe('padaria');
    expect(normalizeInstagram('reels')).toBeNull();
    expect(normalizeInstagram('nome inválido')).toBeNull();
    expect(normalizeInstagram('  ')).toBeNull();
    expect(normalizeInstagram(null)).toBeNull();
  });
});

describe('WhatsApp (Req. 8.2, 8.3)', () => {
  it.each([
    ['https://wa.me/5511987654321', '5511987654321'],
    ['https://wa.me/11987654321?text=Ol%C3%A1', '5511987654321'],
    ['https://api.whatsapp.com/send?phone=5511987654321&text=oi', '5511987654321'],
    ['https://web.whatsapp.com/send?phone=11987654321', '5511987654321'],
    ['whatsapp://send?phone=551133334444', '551133334444'],
    ['https://api.whatsapp.com/send?text=oi&phone=%2B55%2011%2098765-4321', '5511987654321'],
  ])('reconhece %s', (href, number) => {
    expect(findWhatsappNumbers(page(a(href)))).toEqual([number]);
  });

  it.each([
    ['123456789', null], // 9 dígitos
    ['1133334444', '551133334444'], // 10 → +55
    ['11987654321', '5511987654321'], // 11 → +55
    ['551133334444', '551133334444'], // 12
    ['5511987654321', '5511987654321'], // 13
    ['55119876543210', null], // 14
  ])('normaliza %s → %s', (raw, expected) => {
    expect(normalizeWhatsapp(raw)).toBe(expected);
    expect(findWhatsappNumbers(page(a(`https://wa.me/${raw}`)))).toEqual(expected ? [expected] : []);
  });

  it('ignora links sem número válido', () => {
    const html = page(a('https://wa.me/') + a('https://wa.me/message/ABCDEF') + a('https://api.whatsapp.com/send?text=oi'));
    expect(findWhatsappNumbers(html)).toEqual([]);
  });
});

describe('desempate (Req. 8.4)', () => {
  it('escolhe o mais frequente', () => {
    const html = page(
      a('https://instagram.com/aaa') + a('https://instagram.com/bbb') + a('https://www.instagram.com/bbb/') +
        a('https://wa.me/11911111111') + a('https://wa.me/11922222222') + a('whatsapp://send?phone=11922222222'),
    );
    const s = detectSignals(html, NO_OSM);
    expect(s.instagram).toBe('bbb');
    expect(s.whatsapp).toBe('5511922222222');
  });

  it('em empate, escolhe o primeiro na ordem do documento', () => {
    const html = page(
      a('https://instagram.com/zzz') + a('https://instagram.com/aaa') +
        a('https://wa.me/11922222222') + a('https://wa.me/11911111111'),
    );
    const s = detectSignals(html, NO_OSM);
    expect(s.instagram).toBe('zzz');
    expect(s.whatsapp).toBe('5511922222222');
  });
});

describe('fallback para tags OSM (Req. 8.5)', () => {
  const osm = { instagram: '@Loja.OSM', whatsapp: '+55 (11) 3333-4444' };

  it('usa as tags normalizadas com origem OSM quando o site não fornece o sinal', () => {
    expect(detectSignals(page('<p>sem links</p>'), osm)).toMatchObject({
      instagram: 'loja.osm',
      instagramOrigem: 'OSM',
      whatsapp: '551133334444',
      whatsappOrigem: 'OSM',
    });
  });

  it('usa as tags quando não há HTML', () => {
    expect(detectSignals(null, osm)).toEqual({
      instagram: 'loja.osm',
      instagramOrigem: 'OSM',
      whatsapp: '551133334444',
      whatsappOrigem: 'OSM',
      tecnologias: [],
    });
  });

  it('o sinal do site vence a tag OSM', () => {
    const html = page(a('https://instagram.com/site') + a('https://wa.me/11987654321'));
    expect(detectSignals(html, osm)).toMatchObject({
      instagram: 'site',
      instagramOrigem: 'SITE',
      whatsapp: '5511987654321',
      whatsappOrigem: 'SITE',
    });
  });

  it('cada sinal cai no OSM de forma independente', () => {
    const s = detectSignals(page(a('https://instagram.com/site')), osm);
    expect(s).toMatchObject({ instagramOrigem: 'SITE', whatsapp: '551133334444', whatsappOrigem: 'OSM' });
  });

  it('tags inválidas resultam em sinal ausente', () => {
    const s = detectSignals(page(''), { instagram: 'explore', whatsapp: '123' });
    expect(s).toMatchObject({ instagram: null, instagramOrigem: null, whatsapp: null, whatsappOrigem: null });
  });
});

describe('tecnologias (Req. 9.1)', () => {
  const examples: Record<string, string> = {
    wordpress: page('', '<meta name="generator" content="WordPress 6.4.2">'),
    wix: page('<script src="https://static.parastorage.com/services/main.js"></script>'),
    squarespace: page('', '<link rel="stylesheet" href="https://static1.squarespace.com/static/site.css">'),
    webflow: '<html data-wf-page="abc" data-wf-site="def"><body></body></html>',
    shopify: page('<script src="https://cdn.shopify.com/s/files/1/theme.js"></script>'),
    nuvemshop: page('<script src="https://d26lpennugtm8s.cloudfront.net/stores/001/app.js"></script>'),
    loja_integrada: page('<script src="https://cdn.awsli.com.br/x.js"></script><link rel="stylesheet" href="https://lojaintegrada.com.br/css/loja.css">'),
    tray: page('<script src="https://images.tcdn.com.br/traycdn/app.js"></script>'),
    google_analytics: page('<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>'),
    google_tag_manager: page("<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-AB12CD');</script>"),
    meta_pixel: page("<script>fbq('init', '1234567890'); fbq('track', 'PageView');</script>"),
    jquery: page('<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>'),
    react: page('<div id="root" data-reactroot=""></div>'),
    nextjs: page('<script id="__NEXT_DATA__" type="application/json">{}</script>'),
    bootstrap: page('', '<link rel="stylesheet" href="/css/bootstrap.min.css">'),
  };

  it('há um exemplo para cada tecnologia do catálogo', () => {
    expect(Object.keys(examples).sort()).toEqual(TECH_CATALOG.map((t) => t.id).sort());
  });

  it.each(TECH_CATALOG.map((t) => [t.id, t]))('detecta %s', (id, entry) => {
    const hits = detectTechnologies(examples[id]);
    expect(hits.map((h) => h.id)).toEqual([id]);
    expect(hits[0]).toEqual({ id: entry.id, label: entry.label, group: entry.group });
    expect(detectSignals(examples[id], NO_OSM).tecnologias.map((h) => h.id)).toEqual([id]);
  });

  it('HTML sem padrões devolve lista vazia', () => {
    expect(detectTechnologies(page('<p>Olá</p>'))).toEqual([]);
    expect(detectTechnologies('')).toEqual([]);
  });

  it('lista cada tecnologia uma vez, ordenada por grupo e rótulo', () => {
    const html = page(
      '<script src="/wp-content/x.js"></script><script src="/wp-includes/y.js"></script>' +
        '<script src="https://code.jquery.com/jquery.js"></script><link rel="stylesheet" href="bootstrap.css">',
      '<meta name="generator" content="WordPress 6">',
    );
    expect(detectTechnologies(html).map((h) => h.id)).toEqual(['wordpress', 'bootstrap', 'jquery']);
  });
});
