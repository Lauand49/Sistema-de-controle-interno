/**
 * Utilitários de HTML do Minerador (Etapa 3): decodificação por charset e extração
 * tolerante de texto, links e recursos. Isomórfico: sem imports de Node/Prisma, sem DOM.
 *
 * Toda a varredura é feita por um scanner manual em uma única passada (cada caractere é
 * consumido uma vez), sem regex com backtracking sobre o documento — entradas adversariais
 * de até 1 MiB são processadas em tempo linear.
 *
 * Requisitos: 7.3, 7.4, 11.3.
 */

/** Quantos bytes iniciais são inspecionados em busca de `<meta charset>` / `http-equiv`. */
export const META_SNIFF_BYTES = 2048;

const HTML_MIME_TYPES = new Set(['text/html', 'application/xhtml+xml']);

/** `true` quando o tipo MIME (antes do `;`) é `text/html` ou `application/xhtml+xml`. */
export function isHtmlContentType(ct: string | null): boolean {
  if (ct == null) return false;
  const semi = ct.indexOf(';');
  const mime = (semi === -1 ? ct : ct.slice(0, semi)).trim().toLowerCase();
  return HTML_MIME_TYPES.has(mime);
}

// ---------------------------------------------------------------------------
// Charset
// ---------------------------------------------------------------------------

const CT_CHARSET = /;\s*charset\s*=\s*["']?([^"';\s,]+)/i;
// Aplicada só sobre os primeiros 2 KiB (entrada limitada). Cobre `<meta charset=x>` e
// `<meta http-equiv="Content-Type" content="text/html; charset=x">`.
const META_CHARSET = /<meta\b[^>]{0,512}?charset\s*=\s*["']?\s*([A-Za-z0-9_:.+-]{1,64})/i;

function charsetFromContentType(ct: string | null): string | null {
  if (ct == null) return null;
  const m = CT_CHARSET.exec(ct.slice(0, 1024));
  return m ? m[1].trim().toLowerCase() : null;
}

function charsetFromMeta(body: Uint8Array): string | null {
  const head = body.subarray(0, META_SNIFF_BYTES);
  // Bytes → caracteres 1:1 (Latin-1); suficiente para achar ASCII da tag <meta>.
  let s = '';
  for (let i = 0; i < head.length; i++) s += String.fromCharCode(head[i]);
  const m = META_CHARSET.exec(s);
  if (!m) return null;
  const label = m[1].toLowerCase();
  // HTML: rótulo UTF-16 declarado em <meta> é tratado como UTF-8.
  return label.startsWith('utf-16') ? 'utf-8' : label;
}

function makeDecoder(label: string | null): TextDecoder {
  if (label) {
    try {
      return new TextDecoder(label, { fatal: false });
    } catch {
      // charset desconhecido → UTF-8
    }
  }
  return new TextDecoder('utf-8', { fatal: false });
}

/**
 * Decodifica o Corpo_HTML: charset do `Content-Type`; senão `<meta charset>`/`http-equiv`
 * nos primeiros 2 KiB; senão UTF-8. Bytes inválidos viram U+FFFD; charset desconhecido
 * cai para UTF-8. Nunca lança.
 */
export function decodeHtml(body: Uint8Array, contentType: string | null): string {
  const label = charsetFromContentType(contentType) ?? charsetFromMeta(body);
  try {
    return makeDecoder(label).decode(body);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(body);
  }
}

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  agrave: 'à', Agrave: 'À', ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', Uuml: 'Ü',
  ordm: 'º', ordf: 'ª', copy: '©', reg: '®', ndash: '–', mdash: '—',
};

const ENTITY = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z]{2,8});/g;

/** Decodifica entidades numéricas e as nomeadas mais comuns; as demais ficam como estão. */
export function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(ENTITY, (whole, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return whole;
      return String.fromCodePoint(cp);
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : whole;
  });
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

interface Tag {
  /** nome em minúsculas */
  name: string;
  /** atributos na ordem do documento; nome em minúsculas, valor bruto (sem decodificar) */
  attrs: Array<[string, string]>;
}

interface ScanVisitor {
  text?(raw: string): void;
  tag?(tag: Tag): void;
  /** corpo bruto de <script>/<style> (texto puro) */
  rawText?(tag: Tag, content: string): void;
}

const RAW_TEXT_TAGS = new Set(['script', 'style']);

/** Minúsculas apenas em A–Z: preserva o comprimento (índices alinhados com o original). */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

function isAlpha(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 12 || c === 13;
}

/** Varre o documento uma única vez. */
function scan(html: string, v: ScanVisitor): void {
  const n = html.length;
  let lower: string | null = null;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      v.text?.(html.slice(i));
      return;
    }
    if (lt > i) v.text?.(html.slice(i, lt));
    const c1 = html.charCodeAt(lt + 1);
    // Comentário
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    // Fechamento, doctype, instruções de processamento
    if (c1 === 47 /* / */ || c1 === 33 /* ! */ || c1 === 63 /* ? */) {
      const end = html.indexOf('>', lt + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (!isAlpha(c1)) {
      // "<" literal no texto
      v.text?.('<');
      i = lt + 1;
      continue;
    }
    // Nome da tag
    let j = lt + 1;
    while (j < n) {
      const c = html.charCodeAt(j);
      if (isSpace(c) || c === 47 || c === 62) break;
      j++;
    }
    const tag: Tag = { name: asciiLower(html.slice(lt + 1, j)), attrs: [] };
    // Atributos
    while (j < n) {
      let c = html.charCodeAt(j);
      if (isSpace(c) || c === 47) {
        j++;
        continue;
      }
      if (c === 62 /* > */) break;
      const ns = j;
      while (j < n) {
        c = html.charCodeAt(j);
        if (isSpace(c) || c === 47 || c === 62 || c === 61 /* = */) break;
        j++;
      }
      const attrName = asciiLower(html.slice(ns, j));
      while (j < n && isSpace(html.charCodeAt(j))) j++;
      let value = '';
      if (j < n && html.charCodeAt(j) === 61) {
        j++;
        while (j < n && isSpace(html.charCodeAt(j))) j++;
        const q = html.charCodeAt(j);
        if (q === 34 || q === 39) {
          const end = html.indexOf(q === 34 ? '"' : "'", j + 1);
          const stop = end === -1 ? n : end;
          value = html.slice(j + 1, stop);
          j = end === -1 ? n : end + 1;
        } else {
          const vs = j;
          while (j < n) {
            c = html.charCodeAt(j);
            if (isSpace(c) || c === 62) break;
            j++;
          }
          value = html.slice(vs, j);
        }
      }
      if (attrName) tag.attrs.push([attrName, value]);
    }
    i = j < n ? j + 1 : n;
    v.tag?.(tag);
    if (RAW_TEXT_TAGS.has(tag.name)) {
      if (lower === null) lower = asciiLower(html);
      const close = lower.indexOf('</' + tag.name, i);
      const stop = close === -1 ? n : close;
      v.rawText?.(tag, html.slice(i, stop));
      if (close === -1) return;
      const gt = html.indexOf('>', close);
      i = gt === -1 ? n : gt + 1;
    }
  }
}

function attr(tag: Tag, name: string): string | null {
  for (const [k, val] of tag.attrs) if (k === name) return val;
  return null;
}

// Tags que, renderizadas, separam o texto (as demais — <b>, <span>… — não separam).
const BREAKING_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'li', 'main', 'nav', 'ol', 'option', 'p', 'pre', 'section', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'title', 'tr', 'ul', 'img', 'input', 'button', 'select', 'textarea',
]);

/**
 * Texto visível (sem <script>/<style>/comentários, entidades básicas decodificadas) seguido
 * dos valores de todos os atributos, para a busca de CNPJ (Req. 11.3).
 */
export function htmlSearchText(html: string): string {
  const text: string[] = [];
  const attrs: string[] = [];
  scan(html, {
    text: (raw) => text.push(raw),
    tag: (tag) => {
      if (BREAKING_TAGS.has(tag.name)) text.push(' ');
      for (const [, val] of tag.attrs) if (val) attrs.push(val);
    },
  });
  const visible = decodeEntities(text.join('')).replace(/\s+/g, ' ').trim();
  const attrText = attrs.map((a) => decodeEntities(a).replace(/\s+/g, ' ').trim()).filter(Boolean);
  return [visible, ...attrText].filter(Boolean).join('\n');
}

function pushUnique(out: string[], seen: Set<string>, raw: string | null): void {
  if (raw == null) return;
  const v = decodeEntities(raw).trim();
  if (!v || seen.has(v)) return;
  seen.add(v);
  out.push(v);
}

/** Valores de `href` de qualquer elemento (entidades decodificadas, sem repetição, na ordem). */
export function extractLinks(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  scan(html, {
    tag: (tag) => {
      for (const [k, val] of tag.attrs) if (k === 'href') pushUnique(out, seen, val);
    },
  });
  return out;
}

/**
 * Todos os valores de `href` (entidades decodificadas, com repetições, na ordem do documento).
 * Usado pelo Detector_Sinais, que precisa da frequência de cada link (Req. 8.4).
 */
export function extractHrefs(html: string): string[] {
  const out: string[] = [];
  scan(html, {
    tag: (tag) => {
      for (const [k, val] of tag.attrs) {
        if (k !== 'href') continue;
        const v = decodeEntities(val).trim();
        if (v) out.push(v);
      }
    },
  });
  return out;
}

/**
 * - `generator`: `content` de `<meta name="generator">`;
 * - `assets`: `src` de `<script>` e `href` de `<link>`;
 * - `inline`: corpo de `<script>` sem `src` (não vazio).
 */
export function extractAssets(html: string): { generator: string[]; assets: string[]; inline: string[] } {
  const generator: string[] = [];
  const assets: string[] = [];
  const inline: string[] = [];
  const seenGen = new Set<string>();
  const seenAsset = new Set<string>();
  scan(html, {
    tag: (tag) => {
      if (tag.name === 'meta') {
        const name = attr(tag, 'name');
        if (name != null && name.trim().toLowerCase() === 'generator') pushUnique(generator, seenGen, attr(tag, 'content'));
      } else if (tag.name === 'script') {
        pushUnique(assets, seenAsset, attr(tag, 'src'));
      } else if (tag.name === 'link') {
        pushUnique(assets, seenAsset, attr(tag, 'href'));
      }
    },
    rawText: (tag, content) => {
      if (tag.name === 'script' && attr(tag, 'src') == null && content.trim()) inline.push(content);
    },
  });
  return { generator, assets, inline };
}
