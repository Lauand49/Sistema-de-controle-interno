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

describe('guarda de design', () => {
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

  it('as exceções existem e têm motivo', () => {
    for (const [p, why] of Object.entries({ ...EMOJI_EXCEPTIONS, ...BLUE_EXCEPTIONS })) {
      expect(statSync(p).isFile()).toBe(true);
      expect(why.length).toBeGreaterThan(10);
    }
  });

  it('o <html> fixa o tema escuro e a config usa darkMode por classe', () => {
    expect(readFileSync('app/layout.tsx', 'utf8')).toContain('className="dark');
    expect(readFileSync('tailwind.config.js', 'utf8')).toContain("darkMode: 'class'");
  });
});
