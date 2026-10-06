/**
 * Guarda de consistência visual (Etapa 6). Falha se aparecer:
 *  - emoji usado como ícone em app/ ou components/ (use lucide-react);
 *  - botão/aba azul sólido (a cor primária é roxo/índigo; azul só como cor semântica translúcida de status).
 * Exceções (documentadas em docs/DESIGN.md): texto GERADO/salvo pelo sistema que contém emoji como conteúdo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23E9}-\u{23FF}\u{2B50}\u{2B06}\u{2705}\u{274C}\u{2714}\u{2728}\u{2794}]/u;

/** arquivo -> motivo. Só pode ter emoji em texto que vira dado (proposta copiada, descrição salva). */
const EMOJI_EXCEPTIONS: Record<string, string> = {
  'app/tools/pricing/page.tsx': 'texto da proposta comercial copiado para a área de transferência',
  'components/modals/CreateRequestModal.tsx': 'descrição da solicitação gravada no banco (formato salvo não muda)',
  'components/modals/ClosedDealContractModal.tsx': 'descrição da solicitação gravada no banco (formato salvo não muda)',
};
/** Azul sólido permitido: cor de identidade da ferramenta/departamento, não botão primário. */
const BLUE_EXCEPTIONS: Record<string, string> = {
  'app/tools/page.tsx': 'cartão da ferramenta usa gradiente azul como identidade da categoria',
  'app/tasks/page.tsx': 'indicador de status "em andamento" (ponto)',
};
/**
 * `bg-gradient-to-` só em components/ui (Button, etc.). Exceções por arquivo: decoração de marca/ícones,
 * barras de progresso, estado ativo da navbar e cores de identidade dos departamentos / cartão de /tools.
 */
const GRADIENT_EXCEPTIONS: Record<string, string> = {
  'app/tools/page.tsx': 'cartões das ferramentas: cor de identidade de cada categoria',
  'app/setores/[dept]/page.tsx': 'cores de identidade dos departamentos (faixas e cartões de ferramentas)',
  'app/tools/pricing/page.tsx': 'cartões decorativos de resultado',
  'app/tools/lead-sheet/page.tsx': 'destaques decorativos da planilha',
  'app/tools/lead-filter/page.tsx': 'destaque decorativo da triagem',
  'app/tools/lead-miner/leads/page.tsx': 'ícone decorativo do cabeçalho',
  'app/team/page.tsx': 'destaques decorativos de cartões de pessoas',
  'app/page.tsx': 'cartões de workspace com cor de identidade do departamento',
  'app/not-found.tsx': 'botão da página 404 (links de retorno)',
  'components/lead-miner/ficha/CompanyHeader.tsx': 'ícone decorativo da ficha',
  'components/lead-miner/ficha/ScoreBreakdownCard.tsx': 'barra de progresso do score',
  'components/lead-miner/RunProgressCard.tsx': 'barra de progresso da mineração',
  'components/lead-miner/BulkActionsBar.tsx': 'ação primária da barra em massa (links/botões próprios)',
  'components/navigation/SciTecNavbar.tsx': 'estado ativo da navbar e marca',
  'components/dashboards/PipePhases.tsx': 'barra de progresso',
  'components/dashboards/DashboardSection.tsx': 'ícone decorativo da seção',
  'components/dashboards/LeadsSummary.tsx': 'barra de progresso',
};
const SOLID_BLUE = /\b(?:bg|from|to)-(?:blue|sky)-[5-7]00(?![\d/])/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}
const files = [...walk('app'), ...walk('components')];
const code = (p: string) =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('{/*') && !l.trim().startsWith('*'));

/** Fim da tag JSX que começa em `i`, respeitando {...} e aspas. */
function tagEnd(src: string, i: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return j;
  }
  return src.length;
}

/**
 * Controles crus permitidos: tipos que não têm componente em components/ui (caixa de seleção, opção, arquivo,
 * faixa, cor, oculto). Textos, datas, números, <select> e <textarea> devem usar Input/Select/Textarea/DateInput.
 */
const RAW_INPUT_TYPES = ['checkbox', 'radio', 'file', 'range', 'color', 'hidden'];
/** arquivo -> motivo, para controles crus de outros tipos. Vazio de propósito. */
const RAW_CONTROL_EXCEPTIONS: Record<string, string> = {};

function rawControls(p: string): string[] {
  const src = readFileSync(p, 'utf8');
  const found: string[] = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    const tag = src.slice(m.index!, tagEnd(src, m.index! + m[0].length) + 1);
    const type = /type=["']([a-z-]+)["']/.exec(tag)?.[1];
    if (m[1] === 'input' && type && RAW_INPUT_TYPES.includes(type)) continue;
    found.push(`${p}: ${tag.replace(/\s+/g, ' ').slice(0, 70)}`);
  }
  return found;
}

describe('guarda de design', () => {
  it('nenhum <input>/<select>/<textarea> cru fora de components/ui (use Input, Select, Textarea, DateInput)', () => {
    const found = files.filter((p) => !p.startsWith('components/ui/') && !(p in RAW_CONTROL_EXCEPTIONS)).flatMap(rawControls);
    expect(found).toEqual([]);
  });

  it('nenhum emoji como ícone (exceções documentadas)', () => {
    const found = files
      .filter((p) => !(p in EMOJI_EXCEPTIONS))
      .flatMap((p) => code(p).map((l, i) => ({ p, i, l })).filter(({ l }) => EMOJI.test(l)).map(({ p, l }) => `${p}: ${l.trim().slice(0, 80)}`));
    expect(found).toEqual([]);
  });

  it('nenhum botão/aba em azul sólido fora das exceções', () => {
    const found = files
      .filter((p) => !(p in BLUE_EXCEPTIONS))
      .flatMap((p) => code(p).filter((l) => SOLID_BLUE.test(l)).map((l) => `${p}: ${l.trim().slice(0, 90)}`));
    expect(found).toEqual([]);
  });

  it('nenhum gradiente escrito à mão fora de components/ui e das exceções documentadas', () => {
    const found = files
      .filter((p) => !p.startsWith('components/ui/') && !(p in GRADIENT_EXCEPTIONS))
      .flatMap((p) => code(p).filter((l) => l.includes('bg-gradient-to-')).map((l) => `${p}: ${l.trim().slice(0, 90)}`));
    expect(found).toEqual([]);
  });

  it('as exceções existem e têm motivo', () => {
    for (const [p, why] of Object.entries({ ...EMOJI_EXCEPTIONS, ...BLUE_EXCEPTIONS, ...GRADIENT_EXCEPTIONS })) {
      expect(statSync(p).isFile()).toBe(true);
      expect(why.length).toBeGreaterThan(10);
    }
  });

  it('o <html> fixa o tema escuro e a config usa darkMode por classe', () => {
    expect(readFileSync('app/layout.tsx', 'utf8')).toContain('className="dark');
    expect(readFileSync('tailwind.config.js', 'utf8')).toContain("darkMode: 'class'");
  });
});
