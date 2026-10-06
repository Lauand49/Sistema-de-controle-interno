# Auditoria de design (Etapa 6, fase D0)

Inventário por leitura e `grep` (sem navegador). Números são ocorrências em `app/` e `components/` no início da etapa.

| Padrão ad hoc | Onde aparece | Ação |
|---|---|---|
| Sem tokens no Tailwind (`theme.extend` vazio); cores `slate/purple/indigo` soltas | todo o site | D1: tokens semânticos (`primary`, `surface`, `border`, `muted`, `danger`, `warning`, `success`) sem mudar a aparência |
| Azul como primária (`bg-blue-*`, `text-blue-*`, `border-blue-*`): 141 ocorrências em 18 arquivos | `setores/[dept]` (65), `tasks`, `CardDetailModal` (botão Salvar e aba ativa), `page.tsx`, `tools`, `requests`, `CreateCardModal`, `SectorTaskBoard` | D4/D5: botões e abas vão para `primary`. Azul permanece só como cor **semântica de informação/status** (documentado em `DESIGN.md`) |
| Emojis como ícones: 32 ocorrências em 13 arquivos | `tools/pricing` (6), `setores/[dept]` (4), `CardDetailModal` (4), `lead-sheet`, `SectorTaskBoard`, `LeadDecisionCard` (3), `lead-filter`, `CreateRequestModal`, `page.tsx`, `tasks`, `requests`, `ClosedDealContractModal`, `KanbanBoard` | D4/D5: trocar por lucide-react |
| `<input>/<select>/<textarea>` escritos à mão, cada um com classes próprias: ~150 em 31 arquivos | `tools/pricing` (15), `lead-sheet` (13), `tasks` (9), `setores/[dept]` (8), modais, miner | Criar `Input/Select/Textarea/Field`; aplicar por grupo |
| `DynamicField` (campos de fase do card) sem borda/fundo | `components/ui/DynamicField.tsx` | D4: usar os controles novos |
| Modais com `fixed inset-0` repetidos, sem foco preso nem Esc em parte deles: 17 arquivos | 9 modais em `components/modals` e `team`, `AssignDialog`, `StopRunButton`, `CnpjSection`, `DiscardedLeadsDrawer`, `tasks`, `lead-filter`, `setores/[dept]`, `SectorTaskBoard` | Criar `Modal`; aplicar nos modais de card e de criação, demais por grupo |
| Botões primários com gradiente repetido (`from-purple-600 to-indigo-600`) | quase todas as telas | `Button` variante `primary` |
| Abas feitas à mão (`setores/[dept]`, `CardDetailModal`, `ContatoTabs`) | 3+ lugares | `Tabs` |
| Badges/chips à mão (status, prioridade, departamento) | todas as listas | `Badge` (tons) |
| Cartões de número (métricas) à mão | `setores/[dept]`, dashboards, `app/page.tsx` | `StatCard` |
| Estados vazio/carregando/erro à mão, com textos diferentes | `tasks`, `requests`, `team`, dashboards (`DashboardStates` já existe), miner | `EmptyState` + skeleton simples |
| Cabeçalho de página escrito à mão em cada tela (título, subtítulo, ações) | todas | `PageHeader` |
| Título da aba igual em todas as páginas ("Gestão de Processos & Vendas") | `app/layout.tsx` | D2: `metadata` por rota, formato `<Página> · SciTec Jr. OS` |
| "Solicitação", "Solicitar Demanda", "Demandas do Setor" para a mesma coisa | `setores/[dept]`, `requests`, modais, navbar | D2: padronizar em "Solicitação" |
| Nome interno da unidade (`MIDIAS`) exibido ao usuário | faixa de resumo em `setores/[dept]` | D2: `unitName()` |
| Ícone nativo de calendário escuro sobre fundo escuro | todos os `type="date"` | D1/D4: `color-scheme: dark` em `globals.css` |
| Chip do usuário e menu da navbar sem truncar | `SciTecNavbar` | D2 |
| Colunas do kanban com altura de cabeçalho variável e título cortado sem tooltip | `KanbanColumn` | D3 |

Fora do escopo desta etapa: fluxo do campo "Gerente Responsável" (texto livre) e qualquer lógica de dados.
