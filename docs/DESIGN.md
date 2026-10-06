# Guia de design — SciTec Jr. OS

Identidade: tema escuro, roxo/índigo como cor primária, cards `rounded-2xl`, ícones `lucide-react`, toasts `sonner`. Este guia **unifica** o que já existia; não redesenha.

## Tokens (`tailwind.config.js`)
| Token | Uso | Valor de origem |
|---|---|---|
| `bg-surface` / `-raised` / `-overlay` | fundo da página / cards e modais / hover e controles | slate-950 / 900 / 800 |
| `border-border` / `-strong` | divisórias / bordas de controles | slate-800 / 700 |
| `text-fg` / `text-fg-muted` | texto / texto secundário (nunca mais apagado que isto) | slate-100 / slate-400 |
| `bg-primary`, `from-primary-from to-primary-to`, `text-primary-soft`, `bg-primary-subtle` | ação principal, aba ativa, destaque | purple-600 → indigo-600 |
| `danger`, `warning`, `success`, `info` (`DEFAULT`, `soft`, `subtle`) | estados semânticos | rose, amber, emerald, sky |
| `rounded-card` / `rounded-control` | cards e modais / botões e campos | 1rem / 0.75rem |
| `shadow-card` / `overlay` / `glow` | elevação | — |
| `ring-focus` | anel de foco (`focus-visible:ring-2 ring-focus`) | purple-400 |

**Azul não é cor primária.** `info` (azul-céu) só sinaliza informação/status; botão principal e aba ativa são sempre `primary`.

## Componentes (`components/ui/`)
- `Button`: `primary` (ação principal da tela/modal, no máximo uma), `secondary` (cancelar, ações neutras), `ghost` (ações discretas), `danger` (excluir). Tamanhos `sm|md|lg`, todos com alvo ≥ 40px. `loading` desativa e mostra spinner. Botão só com ícone precisa de `aria-label`.
- `Field` + `Input` / `Select` / `Textarea` / `DateInput` / `CurrencyInput`: todo controle de formulário vive dentro de um `Field` (rótulo ligado, selo "Obrigatório", dica, erro). O estilo do controle é único (`CONTROL_CLASS`). `Textarea` cresce com o conteúdo (mín. 96px, máx. 320px). `CurrencyInput` mostra pt-BR e grava o mesmo texto de antes (ponto decimal).
- `Modal`: `role="dialog"`, foco preso, Esc fecha, trava rolagem, cabeçalho e rodapé fixos, corpo rolável.
- `Tabs`, `Badge` (tons), `StatCard`, `EmptyState`, `PageHeader`.
- Utilidades em `lib/ui/format.ts`: `cn`, `pluralize`, `formatBRL`, `normalizeDecimalInput`.

## Regras
- **Ícones**: somente lucide-react. Emoji só como conteúdo digitado pelo usuário.
- **Espaçamento**: múltiplos de 4px (`p-2`, `p-4`, `gap-3`...). Página: `max-w-7xl mx-auto px-4 sm:px-6 py-6`.
- **Títulos**: um `h1` por página (`PageHeader`), seções em `h2`. Nomes de unidade com `unitName()`, nunca o código.
- **Contagens**: número + unidade por extenso, plural correto (`pluralize`): "1 funil", "0 pendentes".
- **Termo**: "Solicitação" (não "Demanda").
- **Texto longo**: `truncate` + `title` (tooltip); nunca deixar a página rolar na horizontal.
- **Acessibilidade**: label em todo campo; `focus-visible` visível; alvos ≥ 40px; `aria-label` em botão de ícone; Esc fecha modal.
- **Estados**: vazio → `EmptyState`; carregando → texto "Carregando..." com `role="status"`; erro → mensagem em `danger` com ação de tentar de novo.
- **Tema nativo**: `color-scheme: dark` em `globals.css` (calendário e selects legíveis).

## Exemplo
```tsx
<Modal title="Nova solicitação" onClose={close} footer={<Button onClick={save} loading={saving}>Enviar</Button>}>
  <Field label="Título" required><Input value={t} onChange={(e) => setT(e.target.value)} /></Field>
  <Field label="Valor"><CurrencyInput value={v} onChange={setV} /></Field>
</Modal>
```
