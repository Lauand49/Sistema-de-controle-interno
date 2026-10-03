# Requirements Document

Painéis de departamento, setor e membro (Etapa 2)

## Introduction

A Etapa 2 do plano mestre (`docs/PLANO-INTEGRACAO.md`, seções 4, 7 e 8) entrega os **Painéis**: visões de acompanhamento por departamento, por setor e por membro, com tarefas abertas/atrasadas/concluídas, cards por fase dos funis, solicitações intersetoriais e, em Negócios, leads por status e taxa de conversão.

A Etapa 0 já entregou: Postgres, Auth.js restrito a `@scitecjr.com`, `lib/permissions.ts` como matriz única (inclusive `canViewUnit`, `visibleUnitCodes`, `progressScope`, `canViewRequest`, `canUseNegociosTools`), `withAuth` em `lib/api.ts`, `Unit`/`SectorMember`, `Pipe.unitId` e `Task.unitId`. A Etapa 1 entregou o Minerador de Leads e a ligação `ProspectLead.companyId`. Os painéis são **somente leitura**: não criam nem alteram registros de negócio.

Situação atual relevante (código lido):

- `app/setores/[dept]/page.tsx` atende apenas os 4 departamentos (abas KANBAN / LEADS / TOOLS / REQUESTS). Não existe página para setores.
- `app/page.tsx` mostra métricas globais calculadas no navegador por heurística de nome de fase ("proposta", "ganho"). Esta etapa não altera essa tela além do link de navegação (ver Decisões).
- `Card` não tem `unitId` próprio: pertence à unidade do `Pipe` da sua `Phase`.
- `CrossDeptRequest` usa apenas códigos de **departamento** (`fromDept`, `toDept`, com `GLOBAL` para a Presidência); setores não têm solicitações.
- `Task` não registra data de conclusão (só `updatedAt`).

### Fora de escopo

- Etapa 3 (Google Places, PageSpeed, CNPJ, Instagram/WhatsApp, mensagem por IA) e Etapa 4 (deploy, Cloud Run, Neon, OAuth Internal).
- Métricas do Minerador (empresas por prioridade/categoria, minerações por período).
- Metas, exportação de painéis, gráficos históricos (séries temporais), notificações e alterações nas regras da matriz de permissões da seção 4.
- Reescrita das métricas da página inicial (`app/page.tsx`).

## Glossary

- **Modulo_Paineis**: conjunto formado pela API_Paineis, a Calculadora_Metricas e as Telas_Paineis.
- **API_Paineis**: rotas de leitura `/api/dashboards/**`.
- **Calculadora_Metricas**: módulo puro (sem Prisma e sem rede) em `lib/dashboards/` que recebe registros já carregados, a Data_Referencia e o Periodo e devolve as métricas.
- **Matriz_Permissoes**: arquivo `lib/permissions.ts`, fonte única das regras de acesso.
- **Telas_Paineis**: Tela_Hub, Painel_Departamento, Painel_Setor e Painel_Membro.
- **Tela_Hub**: página `/paineis`, que lista os painéis que o usuário da sessão pode abrir.
- **Painel_Departamento**: página `/paineis/unidades/[code]` quando `code` é um dos 4 códigos de departamento.
- **Painel_Setor**: página `/paineis/unidades/[code]` quando `code` é um dos 5 códigos de setor.
- **Painel_Membro**: página `/paineis/membros/[userId]`.
- **Unidade**: registro `Unit` (departamento ou setor), identificado pelo código (`NEGOCIOS`, `TEC_SOFTWARE`, ...).
- **Presidencia**: usuário ATIVO com `globalRole` PRESIDENTE ou VICE_PRESIDENTE (`isGlobal`).
- **Ator**: usuário da sessão, lido do banco a cada requisição por `withAuth`.
- **Alvo**: usuário cujo Painel_Membro é consultado.
- **Escopo_Progresso**: valor de `progressScope(Ator, Alvo)`: `'ALL'` (todas as atividades do Alvo), lista de códigos de setor (apenas atividades desses setores) ou `null` (sem acesso).
- **Tarefa_da_Unidade**: `Task` com `unitId` igual ao da Unidade.
- **Card_da_Unidade**: `Card` cuja `Phase` pertence a um `Pipe` com `unitId` igual ao da Unidade.
- **Tarefa_Aberta**: `Task` com status `TODO` ou `IN_PROGRESS`.
- **Tarefa_Concluida**: `Task` com status `DONE`.
- **Tarefa_Cancelada**: `Task` com status `CANCELLED`; não entra em nenhuma contagem dos painéis.
- **Dia_Referencia**: dia civil corrente no fuso `America/Sao_Paulo` no momento da requisição.
- **Dia_Prazo**: dia civil do campo `dueDate` (tarefa ou solicitação), interpretado como data sem horário (a hora gravada não altera o dia).
- **Tarefa_Atrasada**: Tarefa_Aberta com Dia_Prazo anterior ao Dia_Referencia.
- **Data_Conclusao**: campo `Task.completedAt`, instante em que a tarefa passou para `DONE`.
- **Periodo**: janela de datas escolhida no painel: `7d`, `30d`, `90d` ou `tudo`. Para `Nd`, a janela vai do início do dia (N − 1) dias antes do Dia_Referencia até o instante da requisição, no fuso `America/Sao_Paulo`. `tudo` não tem limite inferior. Padrão: `30d`.
- **Solicitacao**: registro `CrossDeptRequest`.
- **Solicitacao_Aberta**: Solicitacao com status `PENDING`, `APPROVED` ou `IN_PROGRESS`.
- **Solicitacao_Atrasada**: Solicitacao_Aberta com Dia_Prazo anterior ao Dia_Referencia.
- **Lead_de_Triagem**: registro `ProspectLead`, com status `RAW`, `PENDING`, `IN_PROGRESS`, `CONVERTED_TO_PIPE` ou `DISCARDED`.
- **Taxa_Conversao**: entre os Leads_de_Triagem criados no Periodo com status diferente de `RAW`, a razão entre os de status `CONVERTED_TO_PIPE` e o total, exibida em porcentagem inteira arredondada (meio para cima); quando o total é zero, exibida como "—".
- **API_Tarefas**: rotas existentes `/api/tasks` e `/api/tasks/[id]`.
- **Migracao_Etapa_2**: migração Prisma versionada criada nesta etapa.
- **Barra_Navegacao**: componente `components/navigation/SciTecNavbar.tsx`.
- **Pagina_Departamento**: página existente `app/setores/[dept]/page.tsx`.
- **Resumo_Membro**: linha com nome do membro e contagens de Tarefas_Abertas, Tarefas_Atrasadas e Tarefas_Concluidas no Periodo, dentro de um painel de Unidade.

## Requirements

### Requirement 1: Regras de acesso na matriz única

**User Story:** Como Presidente, quero que as regras de quem vê cada painel fiquem na matriz de permissões, para que servidor e interface decidam da mesma forma.

#### Acceptance Criteria

1. THE Matriz_Permissoes SHALL expor a função `canViewUnitDashboard(ator, codigoUnidade)` com resultado igual a `canViewUnit(ator, codigoUnidade)` para todo código de Unidade válido e resultado falso para código inválido.
2. THE Matriz_Permissoes SHALL expor a função `canViewMemberDashboard(ator, alvo)` com resultado verdadeiro exatamente quando o Escopo_Progresso de ator e alvo é diferente de `null`.
3. THE Matriz_Permissoes SHALL conceder à Presidencia acesso a todos os Paineis_Departamento, todos os Paineis_Setor e todos os Paineis_Membro.
4. THE Matriz_Permissoes SHALL conceder a Gerente de Departamento, Gerente de Setor e Assessor acesso ao Painel_Departamento do próprio departamento e aos Paineis_Setor dos setores dos quais participam.
5. IF o Ator não é Presidencia e não participa de um setor, THEN THE Matriz_Permissoes SHALL negar o acesso ao Painel_Setor desse setor, inclusive quando o Ator é Gerente de Departamento.
6. THE Matriz_Permissoes SHALL conceder ao Gerente de Departamento Escopo_Progresso `'ALL'` sobre os membros ativos do próprio departamento, ao Gerente de Setor Escopo_Progresso restrito aos setores que gerencia e dos quais o Alvo participa, e a todo usuário ATIVO Escopo_Progresso `'ALL'` sobre si mesmo.
7. IF o Ator não está com status ATIVO, THEN THE Matriz_Permissoes SHALL negar acesso a qualquer painel.

### Requirement 2: API dos painéis

**User Story:** Como Presidente, quero que os painéis verifiquem permissões no servidor, para que ninguém obtenha números de outra unidade ou pessoa pela URL.

#### Acceptance Criteria

1. THE API_Paineis SHALL proteger toda rota `/api/dashboards/**` com `withAuth` e SHALL avaliar `canViewUnitDashboard` ou `canViewMemberDashboard` no servidor antes de consultar métricas.
2. IF a requisição não possui sessão válida, THEN THE API_Paineis SHALL responder com status 401 sem retornar métricas.
3. IF o Ator não tem acesso ao painel solicitado, THEN THE API_Paineis SHALL responder com status 403 e mensagem em português indicando falta de permissão, sem retornar métricas.
4. IF o código de Unidade não corresponde a um dos 4 departamentos ou 5 setores, THEN THE API_Paineis SHALL responder com status 404.
5. IF o identificador do Alvo não corresponde a um usuário existente, THEN THE API_Paineis SHALL responder com status 404.
6. IF o parâmetro de Periodo é diferente de `7d`, `30d`, `90d` e `tudo`, THEN THE API_Paineis SHALL responder com status 400 e mensagem indicando o parâmetro inválido.
7. WHEN o parâmetro de Periodo é omitido, THE API_Paineis SHALL usar o Periodo `30d`.
8. THE API_Paineis SHALL responder apenas ao método GET e SHALL manter inalterados todos os registros do banco ao atender qualquer requisição.
9. THE API_Paineis SHALL incluir na resposta a Data_Referencia usada e os limites do Periodo aplicado.
10. THE API_Paineis SHALL incluir na resposta somente os campos exibidos pelas Telas_Paineis (identificador, título, status, prazo e responsável de itens listados; nome e avatar de pessoas), sem incluir descrições, valores de campos de cards, contatos de leads ou e-mails.

### Requirement 3: Métricas de tarefas

**User Story:** Como gerente, quero contagens de tarefas com definições claras, para que "atrasada" e "concluída" signifiquem a mesma coisa em todos os painéis.

#### Acceptance Criteria

1. THE Calculadora_Metricas SHALL contar como abertas as Tarefas_Abertas do conjunto recebido, independentemente do Periodo.
2. THE Calculadora_Metricas SHALL contar como atrasadas as Tarefas_Atrasadas do conjunto recebido, independentemente do Periodo.
3. THE Calculadora_Metricas SHALL contar como concluídas as Tarefas_Concluidas cuja Data_Conclusao está dentro do Periodo.
4. THE Calculadora_Metricas SHALL excluir as Tarefas_Canceladas de todas as contagens.
5. THE Calculadora_Metricas SHALL tratar uma Tarefa_Aberta com Dia_Prazo igual ao Dia_Referencia como não atrasada e uma Tarefa_Aberta sem `dueDate` como não atrasada.
6. FOR ALL conjuntos de tarefas, THE Calculadora_Metricas SHALL produzir contagem de atrasadas menor ou igual à contagem de abertas.
7. FOR ALL conjuntos de tarefas e Periodos, THE Calculadora_Metricas SHALL produzir contagem de concluídas no Periodo `7d` menor ou igual à do `30d`, esta menor ou igual à do `90d` e esta menor ou igual à do `tudo`.
8. WHEN uma tarefa é criada com status `DONE` ou tem o status alterado para `DONE`, THE API_Tarefas SHALL gravar a Data_Conclusao com o instante da operação.
9. WHEN o status de uma tarefa passa de `DONE` para outro status, THE API_Tarefas SHALL apagar a Data_Conclusao.
10. THE Migracao_Etapa_2 SHALL preencher a Data_Conclusao das tarefas já existentes com status `DONE` usando o valor de `updatedAt`.

### Requirement 4: Painel do departamento

**User Story:** Como Gerente de Departamento, quero ver o andamento do meu departamento em uma tela, para que eu acompanhe tarefas, funis e solicitações.

#### Acceptance Criteria

1. WHEN um Ator com acesso abre o Painel_Departamento, THE Painel_Departamento SHALL exibir as contagens de tarefas abertas, atrasadas e concluídas no Periodo calculadas sobre as Tarefas_da_Unidade.
2. THE Painel_Departamento SHALL exibir, para cada `Pipe` da Unidade, o nome do funil e a quantidade de Cards_da_Unidade em cada fase, com as fases na ordem do campo `order` e incluindo fases com zero cards.
3. THE Painel_Departamento SHALL exibir as contagens de Solicitacoes recebidas (`toDept` igual ao código do departamento) e enviadas (`fromDept` igual ao código do departamento) agrupadas por status, com os rótulos "Pendente", "Aprovada", "Recusada", "Em andamento" e "Concluída".
4. THE Painel_Departamento SHALL exibir a contagem de Solicitacoes_Atrasadas recebidas pelo departamento.
5. THE Painel_Departamento SHALL exibir até 10 Tarefas_Atrasadas da Unidade, ordenadas por Dia_Prazo crescente, com título, responsável e Dia_Prazo no formato DD/MM/AAAA.
6. THE Painel_Departamento SHALL contar no status "Concluída" apenas as Solicitacoes com status `COMPLETED` e `updatedAt` dentro do Periodo, e SHALL contar os demais status sobre todas as Solicitacoes do departamento, independentemente do Periodo.
7. WHERE o departamento é Negócios, THE Painel_Departamento SHALL exibir a seção de leads do Requisito 6.

### Requirement 5: Painel do setor

**User Story:** Como Gerente de Setor, quero ver o andamento do meu setor, para que eu acompanhe o trabalho dos membros de vários departamentos.

#### Acceptance Criteria

1. WHEN um Ator com acesso abre o Painel_Setor, THE Painel_Setor SHALL exibir as contagens de tarefas abertas, atrasadas e concluídas no Periodo calculadas sobre as Tarefas_da_Unidade.
2. THE Painel_Setor SHALL exibir, para cada `Pipe` do setor, o nome do funil e a quantidade de Cards_da_Unidade em cada fase, com as fases na ordem do campo `order` e incluindo fases com zero cards.
3. THE Painel_Setor SHALL exibir até 10 Tarefas_Atrasadas do setor, ordenadas por Dia_Prazo crescente, com título, responsável e Dia_Prazo no formato DD/MM/AAAA.
4. THE Painel_Setor SHALL exibir o nome do gerente do setor e a quantidade de membros ativos.
5. THE Painel_Setor SHALL omitir a seção de solicitações.

### Requirement 6: Leads de Negócios

**User Story:** Como Gerente de Negócios, quero ver os leads por status e a taxa de conversão, para que eu saiba quanto da prospecção vira oportunidade no funil.

#### Acceptance Criteria

1. THE Painel_Departamento de Negócios SHALL exibir a quantidade atual de Leads_de_Triagem em cada status, com os rótulos "Importado", "Pendente", "Em andamento", "Convertido em card" e "Descartado", incluindo status com zero leads.
2. THE Painel_Departamento de Negócios SHALL exibir a Taxa_Conversao do Periodo acompanhada do numerador e do denominador (ex.: "25% (5 de 20)").
3. THE Painel_Departamento de Negócios SHALL exibir, para cada responsável com ao menos um Lead_de_Triagem atribuído, a quantidade de leads em cada status, mais uma linha "Sem responsável" para leads sem `assignedTo`.
4. FOR ALL conjuntos de Leads_de_Triagem, THE Calculadora_Metricas SHALL produzir contagens por status cuja soma é igual ao total de Leads_de_Triagem recebidos.
5. FOR ALL conjuntos de Leads_de_Triagem, THE Calculadora_Metricas SHALL produzir Taxa_Conversao entre 0% e 100% ou "—".
6. FOR ALL conjuntos de Leads_de_Triagem, THE Calculadora_Metricas SHALL produzir a Taxa_Conversao sem alteração quando Leads_de_Triagem com status `RAW` são acrescentados ao conjunto.

### Requirement 7: Resumo por membro nos painéis de unidade

**User Story:** Como gerente, quero ver quanto cada membro tem de tarefas na unidade, para que eu identifique sobrecarga e atrasos, sem expor o progresso individual a quem não pode vê-lo.

#### Acceptance Criteria

1. THE Painel_Departamento SHALL exibir um Resumo_Membro para cada membro ativo do departamento, calculado sobre as Tarefas_da_Unidade atribuídas ao membro.
2. THE Painel_Setor SHALL exibir um Resumo_Membro para cada membro ativo do setor, calculado sobre as Tarefas_da_Unidade atribuídas ao membro.
3. THE API_Paineis SHALL incluir na resposta somente os Resumos_Membro de membros cujo Escopo_Progresso em relação ao Ator é `'ALL'` ou é uma lista de setores que contém o código da Unidade do painel.
4. WHILE o Ator é Assessor sem cargo de gerente, THE Telas_Paineis SHALL exibir no Painel_Departamento e no Painel_Setor apenas o Resumo_Membro do próprio Ator.
5. WHEN o Ator aciona o nome de um membro em um Resumo_Membro, THE Telas_Paineis SHALL navegar para o Painel_Membro desse membro.
6. FOR ALL conjuntos de tarefas de uma Unidade, THE Calculadora_Metricas SHALL produzir, para cada contagem, soma dos Resumos_Membro menor ou igual à contagem total da Unidade (tarefas sem responsável ou de pessoas inativas entram só no total).

### Requirement 8: Painel do membro

**User Story:** Como gerente, quero ver o progresso individual de um membro dentro do que me cabe, para que eu acompanhe a pessoa sem ver atividades de outras áreas.

#### Acceptance Criteria

1. WHILE o Escopo_Progresso é `'ALL'`, THE Painel_Membro SHALL exibir as contagens de tarefas abertas, atrasadas e concluídas no Periodo sobre todas as tarefas atribuídas ao Alvo, incluindo tarefas sem Unidade.
2. WHILE o Escopo_Progresso é uma lista de setores, THE Painel_Membro SHALL exibir as contagens de tarefas somente sobre tarefas atribuídas ao Alvo com `unitId` de um desses setores.
3. WHILE o Escopo_Progresso é `'ALL'`, THE Painel_Membro SHALL exibir a quantidade de cards atribuídos ao Alvo agrupada por funil e fase.
4. WHILE o Escopo_Progresso é uma lista de setores, THE Painel_Membro SHALL exibir a quantidade de cards atribuídos ao Alvo somente nos funis desses setores.
5. WHILE o Escopo_Progresso é `'ALL'`, THE Painel_Membro SHALL exibir a quantidade de Solicitacoes_Abertas e Solicitacoes_Atrasadas em que o Alvo é responsável (`handlerId`).
6. WHILE o Escopo_Progresso é `'ALL'` e o Alvo possui Leads_de_Triagem atribuídos, THE Painel_Membro SHALL exibir a quantidade desses leads por status.
7. WHILE o Escopo_Progresso é uma lista de setores, THE Painel_Membro SHALL omitir solicitações e leads e SHALL exibir o aviso "Exibindo apenas atividades dos setores: {nomes}".
8. THE Painel_Membro SHALL exibir até 10 Tarefas_Atrasadas do Alvo dentro do Escopo_Progresso, ordenadas por Dia_Prazo crescente, com título, Unidade (ou "Geral") e Dia_Prazo no formato DD/MM/AAAA.
9. FOR ALL Alvos, conjuntos de tarefas e listas de setores, THE Calculadora_Metricas SHALL produzir, com escopo de setores, cada contagem menor ou igual à produzida com escopo `'ALL'`.
10. THE Painel_Membro SHALL exibir nome, avatar, título (`personTitle`) e status do Alvo, com a indicação "Conta desativada" quando o status é INATIVO.

### Requirement 9: Tela de painéis e navegação

**User Story:** Como membro, quero um ponto de entrada único para os painéis, para que eu encontre os painéis que posso ver.

#### Acceptance Criteria

1. THE Tela_Hub SHALL listar os Paineis_Departamento e Paineis_Setor para os quais `canViewUnitDashboard` é verdadeiro para o Ator, separados em "Departamentos" e "Setores".
2. THE Tela_Hub SHALL exibir o atalho "Meu painel" para o Painel_Membro do próprio Ator.
3. WHERE o Ator é Presidencia, Gerente de Departamento ou Gerente de Setor, THE Tela_Hub SHALL listar os membros ativos para os quais `canViewMemberDashboard` é verdadeiro, com busca por nome sem diferenciar maiúsculas, minúsculas e acentos.
4. THE Barra_Navegacao SHALL exibir o item "Painéis" com link para a Tela_Hub, na versão desktop e na versão móvel.
5. WHILE `canViewUnitDashboard` é verdadeiro para o Ator e o departamento aberto, THE Pagina_Departamento SHALL exibir o link "Ver painel" para o Painel_Departamento desse departamento.
6. IF o Ator acessa pela URL um painel sem permissão, THEN THE Telas_Paineis SHALL exibir uma mensagem de acesso negado no lugar do conteúdo, sem exibir métricas.
7. IF o Ator acessa pela URL um painel de Unidade ou membro inexistente, THEN THE Telas_Paineis SHALL exibir a mensagem "Painel não encontrado" com link para a Tela_Hub.

### Requirement 10: Seletor de período

**User Story:** Como gerente, quero escolher o período das métricas de conclusão, para que eu compare a última semana com o último trimestre.

#### Acceptance Criteria

1. THE Painel_Departamento, o Painel_Setor e o Painel_Membro SHALL exibir um seletor de Periodo com as opções "Últimos 7 dias", "Últimos 30 dias", "Últimos 90 dias" e "Todo o período", com "Últimos 30 dias" selecionado ao abrir o painel.
2. WHEN o Ator altera o Periodo, THE Telas_Paineis SHALL recarregar as métricas com o novo Periodo e SHALL refletir o Periodo na URL (parâmetro `periodo`).
3. WHEN um painel é aberto com parâmetro `periodo` válido na URL, THE Telas_Paineis SHALL usar esse Periodo.
4. THE Telas_Paineis SHALL identificar com o texto "no período" as métricas que dependem do Periodo (tarefas concluídas, solicitações concluídas e Taxa_Conversao).

### Requirement 11: Interface, estilo e acessibilidade

**User Story:** Como membro, quero painéis no mesmo estilo do sistema e acessíveis, para que eu os use com teclado e leitor de tela.

#### Acceptance Criteria

1. THE Telas_Paineis SHALL usar fundo `bg-slate-950`, cards `rounded-2xl` com `border-slate-800`, destaques em roxo/índigo, ícones exclusivamente de `lucide-react` e toasts exclusivamente de `sonner`.
2. THE Telas_Paineis SHALL exibir em português todos os rótulos, mensagens e avisos, com datas no formato DD/MM/AAAA e números no formato `pt-BR`.
3. WHILE as métricas estão sendo carregadas, THE Telas_Paineis SHALL exibir um indicador de carregamento com texto acessível "Carregando painel".
4. IF a API_Paineis responde com erro diferente de 403 e 404, THEN THE Telas_Paineis SHALL exibir uma mensagem de erro em português com o botão "Tentar novamente".
5. WHEN uma seção não tem dados, THE Telas_Paineis SHALL exibir uma mensagem de estado vazio específica da seção (ex.: "Nenhuma tarefa atrasada").
6. THE Telas_Paineis SHALL apresentar toda contagem exibida em barra ou cor também como número em texto, e SHALL nomear cada status em texto junto de qualquer indicação por cor.
7. THE Telas_Paineis SHALL permitir alcançar todos os elementos interativos com Tab e Shift+Tab e acioná-los com Enter ou Espaço, com indicador de foco visível, e SHALL associar um rótulo programático ao seletor de Periodo e ao campo de busca.
8. THE Telas_Paineis SHALL usar títulos de seção em hierarquia de cabeçalhos (`h1` para o painel, `h2` para cada seção).

### Requirement 12: Qualidade da entrega

**User Story:** Como desenvolvedor, quero testes das regras de acesso e das métricas, para que os painéis mostrem números corretos a quem pode vê-los.

#### Acceptance Criteria

1. THE Modulo_Paineis SHALL incluir testes automatizados da Calculadora_Metricas que cubram, no mínimo: Tarefa_Aberta com Dia_Prazo ontem (atrasada), hoje (não atrasada) e sem prazo (não atrasada); tarefa com `dueDate` gravada à meia-noite UTC do dia do Dia_Referencia (não atrasada); Tarefa_Concluida com Data_Conclusao imediatamente antes e no início da janela do Periodo; exclusão das Tarefas_Canceladas; e Taxa_Conversao com denominador zero ("—") e com arredondamento de meio para cima.
2. THE Modulo_Paineis SHALL incluir testes automatizados baseados em propriedades (`fast-check`) para os critérios 3.6, 3.7, 6.4, 6.5, 6.6, 7.6 e 8.9, com no mínimo 100 execuções cada.
3. THE Modulo_Paineis SHALL incluir testes automatizados de `canViewUnitDashboard` e `canViewMemberDashboard` que cubram os 5 tipos de pessoa da seção 4 do plano mestre, incluindo Gerente de Departamento sem acesso a setor do qual não participa, Gerente de Setor com escopo restrito sobre membro de outro departamento e usuário PENDENTE ou INATIVO sem acesso.
4. THE Modulo_Paineis SHALL incluir testes automatizados da API_Paineis para as respostas 401, 403, 404 e 400 e para a omissão dos Resumos_Membro não autorizados (critério 7.3).
5. THE Modulo_Paineis SHALL executar todos os testes com `npm test` sem acesso à rede; os testes que dependem de Postgres SHALL rodar apenas com `RUN_DB_TESTS=1`, como na Etapa 1.
6. WHEN a etapa é entregue, THE projeto SHALL concluir `npm run build` sem erros e `npm test` com zero falhas.
7. WHEN a etapa é entregue, THE seção 8 do plano mestre (`docs/PLANO-INTEGRACAO.md`) SHALL registrar a Etapa 2 como concluída, com uma subseção 8.3 contendo as decisões desta etapa.
8. THE entrega SHALL ser feita na branch `etapa-2-paineis`, criada a partir de `etapa-1-minerador`, com Pull Request aberto.

## Decisões (confirmadas)

Escolhas feitas onde o plano não define. **Todos os 12 itens abaixo foram confirmados pelo usuário como escritos** (inclusive os pontos que pediam confirmação, nos itens 8 e 12); o design segue essas decisões.

1. **Rotas novas, não abas.** Os painéis ficam em `/paineis` (hub), `/paineis/unidades/[code]` e `/paineis/membros/[userId]`, porque setores não têm página hoje e o `setores/[dept]` já tem ~1.900 linhas. O departamento ganha só um link "Ver painel". (Confirmado.)
2. **"Atrasada"** = aberta (TODO/IN_PROGRESS) com prazo em dia anterior a hoje (fuso de São Paulo). Vencendo hoje não é atrasada. Canceladas não contam em nada.
3. **Data de conclusão.** Adiciona `Task.completedAt` (migração com preenchimento a partir de `updatedAt` para as já concluídas), para que "concluídas no período" não mude quando alguém edita uma tarefa antiga. (Confirmado.)
4. **Período.** 7/30/90 dias ou "todo o período", padrão 30 dias. Afeta só concluídas, solicitações concluídas e conversão; abertas, atrasadas, cards por fase e leads por status são sempre a foto atual.
5. **Taxa de conversão** = leads criados no período que viraram card ÷ leads criados no período que já saíram de `RAW` (pendentes, em andamento, convertidos, descartados). Não há data de conversão no `ProspectLead`, então a coorte é pela data de criação. (Confirmado.)
6. **Solicitações só em departamento.** `CrossDeptRequest` não tem setor, então o painel de setor não mostra solicitações. No painel de membro: solicitações em que a pessoa é responsável.
7. **Resumo por membro** aparece nos painéis de unidade somente para quem pode ver o progresso daquela pessoa naquela unidade (Assessor vê só a própria linha; Gerente de Setor não vê linhas de membros no painel do departamento, pois seu escopo é só o setor), para não furar a regra "Assessor: só o próprio".
8. **Gerente de Departamento com escopo total** sobre membros do seu departamento (como `progressScope` já faz): vê também cards/tarefas desses membros em setores dos quais o gerente não participa. Confirmado: vale o `progressScope` atual, sem limitar pelo `canViewUnit`.
9. **Membros inativos.** Não aparecem no hub nem nos resumos, mas o painel de uma conta desativada continua acessível pela URL para quem tem escopo (útil para redistribuir trabalho).
10. **Página inicial** (`app/page.tsx`) continua como está; só a barra de navegação ganha "Painéis". Trocar as métricas heurísticas da home fica para depois, se desejado.
11. **Desempenho.** Nenhum requisito de tempo foi fixado; o design deve agregar no banco (contagens/agrupamentos) em vez de carregar registros inteiros.
12. **PR.** Como as PRs das Etapas 0 e 1 ainda não foram mergeadas, a sugestão é abrir a PR da Etapa 2 com base em `etapa-1-minerador` (diff limpo) e retargetar para `main` depois. Confirmado.
