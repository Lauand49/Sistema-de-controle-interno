# Checklist de conferência visual (Etapa 6)

Marque no navegador (tema escuro, zoom 100%). Larguras: **1280, 1024, 768, 390 px**. Em todas: a **página não rola na horizontal** (só o kanban e tabelas largas, dentro do próprio contêiner), nada cortado sem tooltip, foco visível ao usar Tab, alvos de toque confortáveis.

| Rota | Estados a ver | O que conferir |
|---|---|---|
| `/login` | normal, erro (`?error=ContaDesativada`), modo dev | botão Google legível, foco visível |
| Tela "Aguardando aprovação" / "Conta desativada" | conta pendente, inativa | botões Sair e Verificar novamente |
| `/` | com dados, sem dados | cartões alinhados; "Solicitações entre setores" |
| `/setores/midias` (e negocios, admjurfin, gente) | carregando, funil vazio, com 5+ fases, somente leitura | chip do usuário truncado e com tooltip; menu só com ícones em 1280/1024; faixa "Workspace Mídias", "1 funil", "0 pendentes"; abas (Funis, Leads, Ferramentas, Solicitações); botão "Nova Solicitação" |
| kanban (`/setores/*`, `/pipe`) | colunas com e sem campos obrigatórios, coluna vazia | altura igual dos cabeçalhos; "Nenhum projeto nesta fase" alinhado; tooltip nos títulos; aviso "Role para o lado"; "campos configurados" × "campos preenchidos" |
| Modal do card | aberto, aba Histórico, somente leitura, erro de fase (campos pendentes) | caixas em todos os campos; calendário visível; valor "4,00"; descrição cresce; Salvar roxo; Esc fecha; Tab não sai do modal |
| Modais de criar card/campo/funil/solicitação, transição de fase, converter lead, gerenciar membro | aberto, erro | Esc fecha, foco entra no 1º campo, rótulos ligados |
| `/tasks` | vazio, com tarefas, modal de tarefa | prazo mostra o dia certo; sem emoji |
| `/requests` | vazio, com itens, filtros | termo "Solicitação"; "URGENTE" sem emoji |
| `/team` | lista, modal de membro, auditoria | selects com o mesmo estilo |
| `/paineis`, `/paineis/unidades/[code]`, `/paineis/membros/[id]` | carregando, vazio, erro, com dados | container e títulos iguais aos demais |
| `/tools`, `/tools/lead-filter`, `/tools/lead-sheet`, `/tools/pricing` | normal, somente leitura (fora de Negócios) | cadeados são ícones; campos uniformes |
| `/tools/lead-miner`, `/runs`, `/leads`, `/leads/[id]` | formulário, minerações, ranking, ficha, mapa | filtros com o mesmo estilo de campo |
| `/rota-que-nao-existe` | 404 | botão "Ir para o Início" |
| Erro de página | forçar erro | botão "Tentar novamente" |
| Título da aba | cada rota acima | formato `<Página> · SciTec Jr. OS` |

## Rodada 2 (conferir também)
| O quê | Larguras | Esperado |
|---|---|---|
| Menu superior | 1512, 1366, 1280 | rótulos visíveis (Início, Setores, Solicitações, Tarefas, Equipe, Painéis) sem quebrar linha; em 1536+ aparece "Minhas Tarefas" completo; abaixo de 1280 só ícones com tooltip |
| Chip do usuário | 1280, 1024 | nome truncado com tooltip a partir de 1024; só avatar abaixo disso |
| Cabeçalhos de página | todas | título h1 + subtítulo + ações, sem banner colorido antigo (Início, Tarefas, Solicitações, Equipe, Setores, Ferramentas, Precificação, Minerador, Painéis) |
| Cartões de número | todas | mesmo estilo em Início, Tarefas, Solicitações e Setores |
| Estados vazio/carregando/erro | todas | mesmo visual (ícone, título, texto); erro de painel com "Tentar novamente" |
| Modais (card, tarefa, solicitação, funil, campo, lançamento, importação, atribuição, CNPJ, membro, transição, conversão, fechamento) | 1280, 390 | cabeçalho e rodapé fixos, corpo rola; Esc fecha; Tab fica dentro; botão de envio no rodapé funciona; em 390px ocupa a tela toda por baixo |
| Importar planilha (triagem) | 1280, 390 | área de soltar é botão focável; depois de escolher, o mapeamento aparece e "Iniciar Triagem" fica no rodapé |

## Rodada 3 (conferir também)
| O quê | Larguras | Esperado |
|---|---|---|
| Menu do perfil (clicar no avatar) | 1280, 390 | ícones de Tarefas, Equipe e Sair com o mesmo tamanho; linhas com 40px; avatar do cabeçalho do menu alinhado |
| Botões "Novo card" e "Nova solicitação" | 1280, 1024 | rótulo de texto visível a partir de 1024px |
| Menu superior | 1280 a 1535 | Início, Setores, Solicitações, Tarefas visíveis; Equipe e Painéis dentro de "Mais"; a partir de 1536 todos inline |
| Tabelas (equipe/auditoria, planilha, setores, minerações, histórico de análises) | 1024, 768, 390 | só a tabela rola de lado; a página nunca |
| Botões primários roxos | todas | mesmo visual e foco visível; mesmos cliques e estados desativados de antes |
| Rótulos | planilha de leads, precificação (linhas de serviço e despesas) | clicar no rótulo foca o campo correspondente |
| Acesso restrito (triagem e planilha, com usuário fora de Negócios) e fila vazia da triagem | 1280, 390 | cartão de aviso/vazio padrão com links e botões funcionando |
