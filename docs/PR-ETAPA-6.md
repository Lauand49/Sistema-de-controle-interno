# Texto do PR — Etapa 6 (Revisão de design)

> Rascunho pronto para colar. O PR **não foi aberto** e nada foi enviado ao remoto.
> Branch: `etapa-6-design`, criada a partir de `etapa-5-revisao-acesso`. **Base sugerida: `etapa-5-revisao-acesso`**.

## Título
```
Etapa 6: unificação visual (tokens, components/ui, cabeçalho, kanban e modal do card)
```

## Resumo
Só apresentação. Nenhuma rota de API, permissão, schema, migração ou formato de dado salvo mudou. `middleware.ts`, `auth.ts`, `auth.config.ts` e `lib/permissions.ts` **não foram tocados**.

- **Fundação:** tokens no Tailwind; `components/ui` (Button, Field, Input/Select/Textarea/DateInput, CurrencyInput, Modal/ModalFrame, Tabs, Badge, StatCard, EmptyState, PageHeader); tema escuro fixo.
- **Cabeçalho/estrutura:** navbar e chip do usuário sem overflow; container único; títulos de aba por página (`<Página> · SciTec Jr. OS`); termo único "Solicitação"; nome de exibição da unidade; plural correto.
- **Kanban:** colunas uniformes, cabeçalhos de mesma altura, tooltips, aviso de rolagem; rótulos "campos configurados" × "campos preenchidos".
- **Modal do card:** controles com caixa, calendário visível, valor em pt-BR (grava o mesmo), descrição que cresce, cor primária única, ícones lucide.
- **Resto do site:** campos com estilo único, Esc/foco preso nos modais, rótulos ligados, emojis e azul primário removidos, contraste.
- **Guarda:** `tests/ui/design-guard.test.ts`; regra no `AGENTS.md`.

## Segunda rodada
- **Menu:** rótulos a partir de 1280px; nome no chip a partir de 1024px.
- **Padrão completo:** `PageHeader`, `StatCard`, `EmptyState`, `LoadingState` e `ErrorState` nas telas e nos painéis; `DashboardStates` reaproveita os mesmos.
- **Modais:** 13 diálogos migrados de `ModalFrame`/markup próprio para `Modal`; os dados enviados não mudaram (mesmos `body`, mesmos ids). `ModalFrame` só no painel lateral de leads descartados.
- **Controles:** ~90 controles crus trocados por `Input`/`Select`/`Textarea`/`DateInput` (inclui `MiningForm`, `Combobox` e filtros do minerador).
- **Guarda:** agora falha também com `<input>`, `<select>` ou `<textarea>` crus (exceções: checkbox, radio, file, range, color, hidden).

## Como testar
```bash
export PATH=$HOME/.local/bin:$PATH
npx tsc --noEmit && npm run typecheck:tests && npm test && npm run build
```
Depois, conferir no navegador com `docs/DESIGN-CHECKLIST.md`.

## Não verificado
Aparência real em 1280/1024/768/390 px (só leitura de classes). Migração completa das telas para `PageHeader`/`StatCard`/`EmptyState` fica para uma próxima etapa (ver HANDOFF).
