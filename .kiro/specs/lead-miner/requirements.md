# Requirements Document

Minerador de Leads (Etapa 1)

## Introduction

A Etapa 1 do plano mestre (`docs/PLANO-INTEGRACAO.md`, seções 5, 6, 7 e 8) integra ao Sistema Interno SciTec jr. o minerador de leads B2B do Projeto-Lead-Manager, reescrito em TypeScript dentro do Next.js (`lib/leads/`). O minerador busca empresas de um bairro/cidade no OpenStreetMap, audita o site de cada uma, classifica a oportunidade comercial, calcula um Lead Score e grava tudo em uma base cumulativa no Postgres. A base alimenta o fluxo de triagem já existente (`ProspectLead` RAW → PENDING → triagem → card no funil de vendas).

A Etapa 0 já entregou: Postgres, Auth.js restrito a `@scitecjr.com`, `lib/permissions.ts` como matriz única, `withAuth` em `lib/api.ts`, `AuditLog` e o fluxo de `ProspectLead`.

### Fora de escopo (Etapa 3)

Google Places, PageSpeed Insights, enriquecimento de CNPJ (BrasilAPI), detecção de Instagram/WhatsApp/tecnologias e mensagem de abordagem gerada por IA. O modelo de dados desta etapa deve comportar esses recursos (campos `googlePlaceId`, `cnpj`, `pagespeed`, `tecnologias`, fonte `GOOGLE`/`MISTA`, `ApiUsage`) sem exigir mudança de estrutura, mas nenhum deles é implementado agora.

## Glossary

- **Minerador**: conjunto de módulos em `lib/leads/` e rotas `/api/tools/lead-miner/**` responsável por buscar, analisar, classificar, pontuar e persistir empresas.
- **Configuracao_Minerador**: módulo `lib/leads/config.ts` com nichos, presets, thresholds e categorias.
- **Nicho**: categoria de negócio pesquisável (ex.: clínica odontológica). Há 22 nichos distribuídos em 3 tiers.
- **Tier**: grupo de nichos com o mesmo peso de aderência ao ICP (tier 1 = maior aderência).
- **ICP**: perfil de cliente ideal da SciTec jr.
- **Preset**: seleção pré-definida de nichos: `icp`, `produto`, `servico`, `todos`.
- **Fonte_OSM**: módulo `lib/leads/sources/osm.ts` que geocodifica pelo Nominatim e consulta o Overpass.
- **Nominatim**: serviço de geocodificação do OpenStreetMap.
- **Overpass**: API de consulta de dados do OpenStreetMap.
- **Rede**: empresa identificada como franquia/cadeia (campo `marcaRede` preenchido, ex.: tag `brand` do OSM).
- **Analisador_de_Site**: módulo `lib/leads/site-analyzer.ts` que verifica disponibilidade, status HTTP, HTTPS/SSL e latência de um site.
- **Lento**: site com tempo de resposta > 2.500 ms.
- **Guarda_SSRF**: componente do Analisador_de_Site que valida destinos de rede antes de cada requisição.
- **Endereco_Bloqueado**: endereço IP de loopback, privado (RFC 1918), link-local, CGNAT, multicast, não roteável, IPv6 local/ULA/link-local, IPv4 mapeado em IPv6 de qualquer desses intervalos, ou endereço de metadata de nuvem (ex.: `169.254.169.254`, `metadata.google.internal`).
- **Classificador**: módulo `lib/leads/classifier.ts` que atribui a Categoria.
- **Categoria**: uma de "Criar Site do Zero", "Otimização / Segurança", "Análise de Dados / BI".
- **Pontuador**: módulo `lib/leads/scorer.ts` que calcula scores e Prioridade.
- **Score_Objetivo**: soma dos componentes presença digital (0–40) e ICP (0–25).
- **Score_IA**: componente de IA (0–35).
- **Score_Final**: pontuação 0–100 do lead.
- **Prioridade**: "Alta" (Score_Final ≥ 70), "Média" (40 ≤ Score_Final < 70) ou "Baixa" (Score_Final < 40).
- **Analisador_IA**: módulo `lib/leads/ai.ts` que consulta o Gemini.
- **Pipeline**: módulo `lib/leads/pipeline.ts` que executa a Mineracao em Lotes.
- **Lote**: subconjunto de empresas de uma Mineracao processado em uma única requisição ao servidor.
- **Mineracao**: registro `MiningRun` (bairro, cidade, UF, nichos, excluirRedes, iaEnabled, fonte, status, total, processados, autor, data).
- **Status_Mineracao**: `PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA` ou `ERRO`.
- **Empresa**: registro `Company`, com snapshot desnormalizado da análise mais recente (categoria, scoreFinal, prioridade, hasSite, isHttps, lastAnalyzedAt).
- **Analise**: registro `CompanyAnalysis` com o resultado de uma auditoria/pontuação de uma Empresa em um momento.
- **Vinculo_Mineracao**: registro `MiningRunCompany` (runId, companyId, isNew).
- **Uso_API**: registro `ApiUsage` (provider, month, count).
- **Deduplicador**: rotina que decide se uma empresa encontrada já existe na Base_de_Empresas.
- **Nome_Normalizado**: nome em minúsculas, sem acentos, sem pontuação, sem espaços repetidos e sem sufixos societários (ltda, me, eireli, s/a, sa, epp).
- **Base_de_Empresas**: conjunto cumulativo de todas as Empresas já mineradas.
- **Lead_de_Triagem**: registro `ProspectLead` existente, agora com `companyId` opcional.
- **Usuario_Negocios**: usuário para o qual `canUseNegociosTools` retorna verdadeiro (Presidência ou membro ativo de Negócios).
- **Atribuidor**: usuário para o qual `canAssignLeads` retorna verdadeiro (Presidência ou Gerente de Negócios).
- **Responsavel**: usuário atribuído a uma Empresa (`assignedTo` da Empresa).
- **Tela_Minerar**: página `/tools/lead-miner`.
- **Tela_Mineracoes**: página `/tools/lead-miner/runs`.
- **Tela_Ranking**: página `/tools/lead-miner/leads`.
- **Mapa**: visualização Leaflet com tiles OSM dentro da Tela_Ranking.
- **Ficha_Empresa**: visualização detalhada de uma Empresa.
- **Exportador_CSV**: rotina que gera arquivo CSV das Empresas filtradas.
- **Atribuicao_ODbL**: texto "© Colaboradores do OpenStreetMap" com link para `https://www.openstreetmap.org/copyright`.

## Requirements

### Requirement 1: Configuração do minerador

**User Story:** Como membro de Negócios, quero nichos e presets pré-definidos, para que eu escolha rapidamente o público de uma mineração.

#### Acceptance Criteria

1. THE Configuracao_Minerador SHALL definir exatamente 22 Nichos, cada um com identificador único (sem repetição entre os 22), rótulo em português não vazio, Tier com valor 1, 2 ou 3 e um conjunto de no mínimo 1 tag OSM usada na busca.
2. THE Configuracao_Minerador SHALL atribuir pelo menos 1 Nicho a cada um dos Tiers 1, 2 e 3, de modo que a soma dos Nichos dos três Tiers seja 22.
3. THE Configuracao_Minerador SHALL definir exatamente os Presets `icp`, `produto`, `servico` e `todos`, cada um com no mínimo 1 Nicho, sem identificadores repetidos, referenciando apenas identificadores de Nichos existentes, e com `todos` contendo os 22 Nichos.
4. THE Configuracao_Minerador SHALL definir o timeout de requisição de site como 10 segundos.
5. THE Configuracao_Minerador SHALL definir como lento o site cuja latência seja estritamente maior que 2,5 segundos (latência de exatamente 2,5 segundos não é lenta).
6. THE Configuracao_Minerador SHALL definir como erro o site cujo status HTTP seja maior ou igual a 400 (status 399 ou menor não é erro).
7. THE Configuracao_Minerador SHALL definir exatamente três Categorias, com os rótulos "Criar Site do Zero", "Otimização / Segurança" e "Análise de Dados / BI", grafados exatamente dessa forma.
8. THE Configuracao_Minerador SHALL definir os pontos de cada critério do componente de presença digital e os pontos do componente ICP por Tier usados pelo Pontuador (Requisito 6, critérios 1 e 2).
9. THE Configuracao_Minerador SHALL definir o limite mensal de chamadas ao Gemini, lido da variável de ambiente `GEMINI_MONTHLY_LIMIT` quando ela contém um inteiro positivo e, caso contrário, igual a um valor padrão definido na própria Configuracao_Minerador.
10. THE Configuracao_Minerador SHALL ser isomórfica: não importar módulos nativos do Node, Prisma nem módulos restritos ao servidor, podendo ser importada sem erro tanto no servidor quanto na interface.

### Requirement 2: Busca de empresas no OpenStreetMap

**User Story:** Como membro de Negócios, quero buscar empresas de um bairro por nicho, para que eu obtenha uma lista de potenciais clientes.

#### Acceptance Criteria

1. WHEN uma Mineracao inicia, THE Fonte_OSM SHALL geocodificar a combinação de bairro, cidade e UF da Mineracao no Nominatim e usar como área de busca o primeiro resultado retornado.
2. THE Fonte_OSM SHALL enviar no máximo 1 requisição por segundo ao Nominatim, somando todas as Mineracoes em execução no mesmo processo do servidor, inclusive as retentativas.
3. THE Fonte_OSM SHALL enviar em toda requisição ao Nominatim e ao Overpass, inclusive nas retentativas, um cabeçalho User-Agent que identifique o sistema e um contato (ex.: `SciTecJr-SistemaInterno/1.0 (contato@scitecjr.com)`).
4. WHEN a área de busca é obtida, THE Fonte_OSM SHALL consultar o Overpass exatamente uma vez por Nicho selecionado (sem contar retentativas), usando as tags OSM do Nicho definidas na Configuracao_Minerador e restringindo os resultados à área de busca.
5. WHEN o Overpass retorna elementos, THE Fonte_OSM SHALL mapear cada elemento para nome, nicho, endereço, bairro, cidade, UF, telefone, website, latitude, longitude, marcaRede (a partir da tag `brand`) e osmId no formato `tipo/id` (ex.: `node/123`), deixando vazio qualquer campo cuja tag OSM não exista no elemento, sem descartar o elemento por isso.
6. IF o elemento OSM não possui a tag de nome, ou o nome fica vazio após remover espaços em branco, THEN THE Fonte_OSM SHALL descartar o elemento sem incluí-lo na contagem total da Mineracao.
7. IF o Nominatim não retorna nenhum resultado para bairro, cidade e UF informados, THEN THE Minerador SHALL definir o Status_Mineracao como `ERRO`, não consultar o Overpass e exibir na Tela_Minerar e na Tela_Mineracoes a mensagem "Bairro não encontrado no OpenStreetMap".
8. IF o Overpass responde com erro ou não responde em até 60 segundos para um Nicho, THEN THE Fonte_OSM SHALL repetir a consulta desse Nicho até 2 vezes, aguardando 2 segundos antes da primeira retentativa e 4 segundos antes da segunda, e, se as 3 tentativas falharem, registrar o Nicho como falho na Mineracao e continuar com os demais Nichos.
9. WHERE a opção "excluir redes" está marcada, THE Minerador SHALL descartar, antes da análise, toda empresa encontrada com marcaRede preenchido, sem incluí-la na contagem total da Mineracao.
10. IF o Nominatim responde com erro ou não responde em até 15 segundos, THEN THE Fonte_OSM SHALL repetir a geocodificação até 2 vezes, aguardando 2 e 4 segundos entre elas, e, se as 3 tentativas falharem, THE Minerador SHALL definir o Status_Mineracao como `ERRO` e exibir na Tela_Minerar uma mensagem indicando que o serviço de geocodificação está indisponível.
11. IF todos os Nichos selecionados de uma Mineracao ficam registrados como falhos, THEN THE Minerador SHALL definir o Status_Mineracao como `ERRO` e exibir na Tela_Minerar uma mensagem indicando que nenhum Nicho pôde ser consultado no OpenStreetMap.
12. WHEN o mesmo osmId é retornado por mais de um Nicho na mesma Mineracao, THE Fonte_OSM SHALL manter apenas um elemento para esse osmId, associado ao primeiro Nicho que o retornou, e contá-lo uma única vez no total da Mineracao.
13. WHEN ao menos um Nicho selecionado fica registrado como falho e ao menos um Nicho selecionado é consultado com sucesso, THE Minerador SHALL prosseguir com a Mineracao até `CONCLUIDA` usando os resultados dos Nichos consultados com sucesso.
14. WHILE uma Mineracao tem ao menos um Nicho registrado como falho, THE Tela_Minerar SHALL indicar, junto dessa Mineracao, os rótulos dos Nichos que falharam.
15. WHILE uma Mineracao tem ao menos um Nicho registrado como falho, THE Tela_Mineracoes SHALL indicar, na linha dessa Mineracao, os rótulos dos Nichos que falharam.
16. WHILE a Tela_Ranking está filtrada por uma Mineracao com ao menos um Nicho registrado como falho, THE Tela_Ranking SHALL indicar os rótulos dos Nichos que falharam nessa Mineracao.
17. WHILE uma Mineracao listada na Ficha_Empresa (Requisito 14, critério 6) tem ao menos um Nicho registrado como falho, THE Ficha_Empresa SHALL indicar, junto dessa Mineracao, os rótulos dos Nichos que falharam.

### Requirement 3: Análise de site

**User Story:** Como membro de Negócios, quero saber a situação do site de cada empresa, para que eu identifique oportunidades de serviço.

#### Acceptance Criteria

1. WHEN uma Empresa possui website, THE Analisador_de_Site SHALL registrar na Analise: `hasSite = true`, status HTTP da resposta final (após redirecionamentos), uso de HTTPS (`isHttps = true` somente se o esquema da URL final for `https`), validade do certificado SSL (`sslValid`), tempo de resposta em milissegundos e disponibilidade (online/offline).
2. WHEN o website não informa esquema, THE Analisador_de_Site SHALL tentar primeiro `https://` e, somente se essa tentativa falhar por timeout, falha de conexão ou erro de certificado SSL, tentar `http://`. As duas tentativas compartilham o timeout total de 10 segundos da análise.
3. IF a requisição excede o timeout total de 10 segundos ou falha na conexão (falha de resolução DNS, conexão recusada ou conexão encerrada antes da resposta), THEN THE Analisador_de_Site SHALL registrar o site como offline, sem status HTTP, com um motivo que indique o tipo de falha. Se as duas tentativas do critério 2 falharem, o motivo registrado SHALL ser o da última tentativa.
4. IF o certificado SSL é inválido (cadeia não confiável), expirado ou não corresponde ao domínio, THEN THE Analisador_de_Site SHALL registrar `sslValid = false` e o motivo (certificado não confiável, expirado ou domínio divergente). Esse registro SHALL ser mantido mesmo quando a análise prosseguir por `http://` conforme o critério 2.
5. WHEN uma Empresa não possui website (campo vazio ou só com espaços), THE Analisador_de_Site SHALL registrar `hasSite = false`, `isHttps = false` e `sslValid = false`, sem enviar nenhuma requisição de rede.
6. WHEN uma resposta HTTP é recebida com status final entre 100 e 399, inclusive, THE Analisador_de_Site SHALL registrar o site como online.
7. WHEN o site é registrado como online, THE Analisador_de_Site SHALL medir o tempo de resposta desde o início da primeira requisição até o recebimento dos cabeçalhos da resposta final e SHALL marcar o site como lento se esse tempo for maior que 2.500 milissegundos.
8. IF o website informado não forma uma URL válida (host ausente ou caracteres inválidos), THEN THE Analisador_de_Site SHALL registrar `hasSite = true` e o site como offline com motivo "URL inválida", sem enviar requisição de rede, e a Mineracao SHALL continuar com a próxima Empresa.
9. IF o timeout total de 10 segundos se esgota durante a tentativa `https://` do critério 2, THEN THE Analisador_de_Site SHALL não tentar `http://` e SHALL registrar como final o motivo da tentativa `https://`.
10. IF uma resposta HTTP é recebida com status final fora do intervalo de 100 a 399 (incluindo status < 100 ou ≥ 400), THEN THE Analisador_de_Site SHALL registrar o site como offline com um motivo que indique erro HTTP e o código recebido.

### Requirement 4: Proteção contra SSRF

**User Story:** Como responsável pela segurança do sistema, quero que as análises de site acessem apenas destinos públicos, para que URLs vindas de fontes externas não alcancem a rede interna ou a metadata da nuvem.

#### Acceptance Criteria

1. IF a URL a ser analisada (original ou destino de redirecionamento) tem esquema diferente de `http` ou `https`, ou porta explícita diferente de 80 ou 443, THEN THE Guarda_SSRF SHALL rejeitar a URL antes de qualquer resolução DNS ou conexão de rede.
2. IF a URL contém credenciais embutidas (`usuario@` ou `usuario:senha@`, inclusive com usuário ou senha vazios), THEN THE Guarda_SSRF SHALL rejeitar a URL antes de qualquer resolução DNS ou conexão de rede.
3. WHEN o Analisador_de_Site vai abrir uma conexão para uma URL (original ou destino de redirecionamento), THE Guarda_SSRF SHALL resolver o host para todos os seus endereços IPv4 e IPv6 (ou usar o próprio endereço, quando o host é um IP literal em qualquer notação, incluindo decimal, octal, hexadecimal e IPv6 entre colchetes) e SHALL rejeitar a URL se ao menos um dos endereços obtidos for Endereco_Bloqueado.
4. THE Analisador_de_Site SHALL conectar-se somente a um dos endereços IP validados pela Guarda_SSRF no critério 3, sem nova resolução DNS entre a validação e a conexão, mantendo o nome do host original no cabeçalho Host e na verificação do certificado SSL.
5. WHEN a resposta é um redirecionamento (status 301, 302, 303, 307 ou 308), THE Analisador_de_Site SHALL seguir no máximo 3 redirecionamentos por análise e SHALL submeter cada destino aos critérios 1, 2 e 3 antes de conectar.
6. THE Analisador_de_Site SHALL ler no máximo 1 MB (1.048.576 bytes) do corpo de cada resposta e SHALL encerrar a conexão ao atingir o limite, registrando a análise com os dados já obtidos (status HTTP, HTTPS, SSL e tempo de resposta) sem tratá-la como falha.
7. THE Analisador_de_Site SHALL aplicar o timeout total de 10 segundos a cada análise, contado do início da primeira resolução DNS até o fim da leitura da última resposta, incluindo todos os redirecionamentos; ao exceder o limite, SHALL abortar a conexão em curso e registrar o site como offline com motivo de timeout.
8. IF a Guarda_SSRF rejeita um destino (URL original ou redirecionamento), THEN THE Analisador_de_Site SHALL não enviar nenhuma requisição a esse destino, SHALL registrar o site como offline com motivo "destino bloqueado", SHALL manter a Empresa na Base_de_Empresas e SHALL prosseguir para a próxima Empresa da Mineracao sem alterar o Status_Mineracao.
9. THE Analisador_de_Site SHALL enviar apenas requisições `GET` ou `HEAD`, sem corpo, sem cookies e sem cabeçalhos de autenticação ou de sessão do sistema, inclusive nas requisições de redirecionamento.
10. IF a análise atinge um quarto redirecionamento, THEN THE Analisador_de_Site SHALL não seguir o redirecionamento, SHALL registrar o site como offline com motivo de excesso de redirecionamentos e SHALL prosseguir para a próxima Empresa da Mineracao.
11. IF a resolução DNS do host falha ou não retorna nenhum endereço, THEN THE Analisador_de_Site SHALL não abrir conexão, SHALL registrar o site como offline com motivo de falha de DNS e SHALL prosseguir para a próxima Empresa da Mineracao.

### Requirement 5: Classificação

**User Story:** Como membro de Negócios, quero que cada empresa receba uma categoria de oportunidade, para que eu saiba qual serviço oferecer.

#### Acceptance Criteria

1. WHEN o Classificador recebe o resultado do Analisador_de_Site de uma Empresa com `hasSite = false`, THE Classificador SHALL atribuir a Categoria "Criar Site do Zero", independentemente de qualquer outro dado da Empresa.
2. WHEN o Classificador recebe o resultado do Analisador_de_Site de uma Empresa com `hasSite = true` e pelo menos uma destas condições é verdadeira: (a) site offline, incluindo o motivo "destino bloqueado" da Guarda_SSRF; (b) status HTTP ≥ 400; (c) URL final analisada sem HTTPS, inclusive quando o acesso só funcionou pelo fallback `http://`; (d) `sslValid = false`; (e) tempo de resposta estritamente maior que 2.500 milissegundos, THE Classificador SHALL atribuir a Categoria "Otimização / Segurança".
3. WHEN o Classificador recebe o resultado do Analisador_de_Site de uma Empresa com `hasSite = true` e nenhuma das condições (a) a (e) do critério 2 é verdadeira, THE Classificador SHALL atribuir a Categoria "Análise de Dados / BI".
4. THE Classificador SHALL atribuir exatamente uma Categoria por Empresa, usando somente um dos três rótulos definidos na Configuracao_Minerador.
5. THE Classificador SHALL ler os limites de status HTTP (≥ 400) e de latência (> 2.500 ms) da Configuracao_Minerador, sem valores repetidos no próprio Classificador.
6. THE Classificador SHALL registrar uma lista de motivos com 1 a 5 itens. Para "Criar Site do Zero", a lista SHALL ter um único motivo, indicando que a empresa não tem site. Para "Otimização / Segurança", SHALL ter um motivo para cada condição (a) a (e) verdadeira. Para "Análise de Dados / BI", SHALL ter um único motivo, indicando que o site está online, seguro e dentro do limite de latência.
7. THE Classificador SHALL ser uma função pura: não faz requisições de rede, não acessa o banco de dados, não depende da data ou hora atual, e SHALL produzir a mesma Categoria e a mesma lista de motivos, na mesma ordem, sempre que receber o mesmo resultado de análise.
8. IF o resultado recebido indica `hasSite = true`, mas o site está online e falta o status HTTP ou o tempo de resposta, THEN THE Classificador SHALL atribuir a Categoria "Otimização / Segurança" com um motivo indicando análise incompleta, sem interromper a Mineracao.
9. WHEN o Classificador atribui uma Categoria, THE Minerador SHALL gravar a Categoria e a lista de motivos na Analise correspondente e SHALL atualizar a Categoria no snapshot da Empresa.

### Requirement 6: Lead Score

**User Story:** Como membro de Negócios, quero um score de 0 a 100 e uma prioridade por empresa, para que eu foque nos leads mais promissores.

#### Acceptance Criteria

1. THE Pontuador SHALL calcular o componente de presença digital como um número inteiro entre 0 e 40, inclusive. O valor vem da soma dos pontos atribuídos a cada critério da análise do site (hasSite, disponibilidade online/offline, status HTTP ≥ 400, uso de HTTPS, sslValid e latência > 2,5 segundos). Os pontos de cada critério ficam definidos na Configuracao_Minerador, e a soma é limitada ao intervalo 0–40.
2. THE Pontuador SHALL calcular o componente ICP como um número inteiro entre 0 e 25, inclusive, a partir do Tier do Nicho da Empresa. Os pontos por Tier ficam definidos na Configuracao_Minerador, com pontos(Tier 1) ≥ pontos(Tier 2) ≥ pontos(Tier 3), e o Tier 1 vale 25 pontos.
3. THE Pontuador SHALL calcular Score_Objetivo como a soma do componente de presença digital e do componente ICP, com um resultado inteiro entre 0 e 65, inclusive.
4. WHERE a IA está habilitada na Mineracao, WHEN o Analisador_IA retorna um Score_IA numérico entre 0 e 35, inclusive, THE Pontuador SHALL arredondar Score_IA para o inteiro mais próximo (frações .5 arredondadas para cima) e calcular Score_Final = Score_Objetivo + Score_IA.
5. IF a IA está desabilitada na Mineracao, ou o Analisador_IA não retorna resultado, ou retorna um Score_IA não numérico ou fora do intervalo 0–35, THEN THE Pontuador SHALL descartar o Score_IA e calcular Score_Final = round(Score_Objetivo × 100 / 65), com frações .5 arredondadas para cima (ex.: Score_Objetivo 65 → 100; Score_Objetivo 0 → 0).
6. IF o Score_IA é descartado conforme o critério 5, THEN THE Pontuador SHALL registrar no detalhamento que a IA não foi usada e o motivo: "IA desabilitada", "sem resposta" ou "resposta inválida".
7. THE Pontuador SHALL produzir Score_Final inteiro entre 0 e 100, inclusive.
8. THE Pontuador SHALL atribuir Prioridade "Alta" quando Score_Final ≥ 70, "Média" quando 40 ≤ Score_Final < 70 e "Baixa" quando Score_Final < 40 (ex.: 69 → "Média", 70 → "Alta", 39 → "Baixa", 40 → "Média").
9. THE Pontuador SHALL registrar no detalhamento, para cada componente (presença digital, ICP e Score_IA quando usado), o valor obtido, o valor máximo e a lista de critérios que o compuseram com os pontos de cada um. A soma dos pontos dos critérios SHALL ser igual ao valor do componente, antes da limitação ao intervalo.
10. FOR ALL entradas iguais (mesmo resultado de análise, mesmo Tier, mesmo estado de habilitação da IA e mesmo Score_IA), THE Pontuador SHALL produzir o mesmo Score_Final, a mesma Prioridade e o mesmo detalhamento.

### Requirement 7: Análise por IA (opcional)

**User Story:** Como membro de Negócios, quero uma avaliação qualitativa por IA, para que o score considere a oportunidade além dos dados técnicos.

#### Acceptance Criteria

1. WHERE a Mineracao tem IA habilitada e `GEMINI_API_KEY` está configurada, WHEN o Pipeline conclui a análise de site de uma Empresa, THE Analisador_IA SHALL enviar ao Gemini uma única requisição com nome, nicho, bairro, cidade e resultado da análise do site da Empresa (status HTTP, HTTPS, validade SSL, latência e disponibilidade) e obter score, descrição da oportunidade e justificativa.
2. WHEN o Gemini responde, THE Analisador_IA SHALL aceitar a resposta somente se ela contiver score numérico, descrição da oportunidade não vazia de até 500 caracteres e justificativa não vazia de até 1.000 caracteres; e, se o score não for inteiro ou estiver fora do intervalo 0–35, SHALL arredondá-lo para o inteiro mais próximo e limitá-lo ao intervalo 0–35 (valores < 0 viram 0 e valores > 35 viram 35).
3. IF o Gemini retorna erro, não responde em até 20 segundos, ou retorna resposta que não atende ao critério 2 (campo ausente, score não numérico, texto vazio ou acima do limite), THEN THE Analisador_IA SHALL retornar ausência de resultado para a Empresa, THE Pipeline SHALL continuar a análise daquela Empresa sem IA (Score_Final pelo Requisito 6, critério 5) e THE Mineracao SHALL prosseguir para as demais Empresas sem mudar o Status_Mineracao para `ERRO`.
4. WHEN o Analisador_IA envia uma requisição ao Gemini, THE Analisador_IA SHALL incrementar em exatamente 1 o contador do Uso_API do provider `gemini` no mês corrente (ano-mês do servidor), inclusive quando a requisição termina em erro ou timeout.
5. WHILE `GEMINI_API_KEY` não está configurada, THE Tela_Minerar SHALL exibir a opção de IA desmarcada e desabilitada (não interativa) com o aviso "IA indisponível: chave não configurada".
6. IF o contador do Uso_API do provider `gemini` no mês corrente é maior ou igual ao limite mensal definido na Configuracao_Minerador (Requisito 1, critério 9), THEN THE Analisador_IA SHALL retornar ausência de resultado sem enviar requisição ao Gemini e sem incrementar o Uso_API, e THE Pipeline SHALL continuar a análise sem IA.
7. IF uma Mineracao é iniciada com IA habilitada e `GEMINI_API_KEY` não está configurada no servidor, THEN THE Minerador SHALL registrar a Mineracao com iaEnabled = falso e processar todas as Empresas sem IA.
8. WHEN o Analisador_IA retorna resultado para uma Empresa, THE Pipeline SHALL gravar na Analise o score de IA, a descrição da oportunidade e a justificativa; e, quando retorna ausência de resultado, SHALL gravar a Analise indicando que a IA não foi aplicada.
9. IF o Minerador registra a Mineracao com iaEnabled = falso conforme o critério 7, THEN THE Minerador SHALL registrar na Mineracao que a IA foi desativada por falta de `GEMINI_API_KEY`.
10. WHILE uma Mineracao tem a IA desativada por falta de `GEMINI_API_KEY` (critério 9), THE Tela_Minerar SHALL exibir junto dessa Mineracao o aviso "Executada sem IA: chave não configurada".
11. WHILE uma Mineracao tem a IA desativada por falta de `GEMINI_API_KEY` (critério 9), THE Tela_Mineracoes SHALL exibir na linha dessa Mineracao o aviso "Executada sem IA: chave não configurada".

### Requirement 8: Execução em lotes retomável

**User Story:** Como membro de Negócios, quero que uma mineração longa continue mesmo se eu fechar a aba, para que eu não perca o trabalho feito.

#### Acceptance Criteria

1. WHEN um Usuario_Negocios inicia uma mineração, THE Minerador SHALL criar uma Mineracao com status `PENDENTE`, `processados` = 0, o autor da sessão, os parâmetros informados (bairro, cidade, UF, nichos, excluirRedes, iaEnabled) e fonte `OSM`.
2. WHEN a busca no OSM termina, THE Pipeline SHALL persistir as Empresas encontradas na Base_de_Empresas passando pelo Deduplicador, criar um Vinculo_Mineracao para cada Empresa, registrar em `total` o número de Vinculos_Mineracao criados e mudar o status para `EM_ANDAMENTO`.
3. WHEN o autor da Mineracao solicita um Lote de uma Mineracao `EM_ANDAMENTO`, THE Pipeline SHALL analisar, classificar, pontuar e persistir de 1 a 10 Empresas ainda não processadas da Mineracao, criar uma Analise para cada uma, atualizar o snapshot de cada Empresa e somar a `processados` a quantidade de Empresas concluídas no Lote.
4. THE Pipeline SHALL concluir cada requisição de Lote em até 60 segundos, contados do recebimento da requisição. Ao atingir esse limite, o Pipeline SHALL parar de iniciar novas Empresas, devolver o progresso atual e deixar as Empresas não concluídas como não processadas, disponíveis para o próximo Lote.
5. WHEN `processados` fica igual a `total`, THE Pipeline SHALL mudar o status da Mineracao para `CONCLUIDA`.
6. WHEN o autor abre a Tela_Minerar ou a Tela_Mineracoes e tem uma ou mais Mineracoes `EM_ANDAMENTO`, THE Minerador SHALL exibir o progresso de cada uma dessas Mineracoes no formato `processados`/`total`.
7. IF dois ou mais Lotes da mesma Mineracao são solicitados ao mesmo tempo, THEN THE Pipeline SHALL processar cada Empresa da Mineracao exatamente uma vez, criar no máximo uma Analise por Empresa nessa Mineracao e manter `processados` ≤ `total`.
8. IF ocorre erro irrecuperável na Mineracao (geocodificação sem resultado ou indisponível conforme Requisito 2, critérios 7 e 10; falha em todos os Nichos selecionados no Overpass; ou falha de gravação no banco de dados), THEN THE Pipeline SHALL mudar o status para `ERRO`, registrar na Mineracao uma mensagem que indique a causa e manter as Empresas, Analises e o valor de `processados` já gravados.
9. IF a análise, classificação ou pontuação de uma Empresa falha, THEN THE Pipeline SHALL registrar no Vinculo_Mineracao dessa Empresa a falha e o motivo, contar a Empresa como processada, não tentar de novo na mesma Mineracao e continuar com as demais Empresas do Lote.
10. IF o usuário inicia uma mineração com bairro ou cidade vazios ou com mais de 100 caracteres, UF diferente de uma das 27 siglas de UF brasileiras, ou nenhum Nicho selecionado, THEN THE Minerador SHALL rejeitar a solicitação sem criar Mineracao e exibir uma mensagem que indique cada campo inválido, mantendo os valores digitados no formulário.
11. IF um Lote é solicitado para uma Mineracao com status `PENDENTE`, `CONCLUIDA` ou `ERRO`, THEN THE Pipeline SHALL não processar nenhuma Empresa, não alterar `processados` nem o status, e responder com o status e o progresso atuais da Mineracao.
12. IF um usuário que não é o autor da Mineracao solicita um Lote dela, THEN THE Pipeline SHALL rejeitar a solicitação com uma indicação de acesso negado, sem processar Empresas nem alterar a Mineracao.
13. IF `total` resulta 0 ao término da busca no OSM, THEN THE Pipeline SHALL deixar a Mineracao com status final `CONCLUIDA` sem exigir nenhuma solicitação de Lote, sendo aceitável a passagem transitória por `EM_ANDAMENTO`.
14. IF um Lote é solicitado enquanto outro Lote da mesma Mineracao tem Empresas reservadas, THEN THE Pipeline SHALL pular as Empresas reservadas pelo outro Lote e processar somente as Empresas da Mineracao ainda não reservadas nem processadas.
15. WHILE o autor está na Tela_Minerar ou na Tela_Mineracoes, THE Minerador SHALL solicitar Lotes automaticamente para cada Mineracao `EM_ANDAMENTO` do autor, com no máximo uma requisição de Lote em curso por Mineracao, até o status de cada Mineracao deixar de ser `EM_ANDAMENTO`.

### Requirement 9: Base cumulativa e deduplicação

**User Story:** Como membro de Negócios, quero que empresas repetidas entre minerações sejam reconhecidas, para que a base não tenha duplicatas e mantenha o histórico.

#### Acceptance Criteria

1. WHEN uma empresa é encontrada pela Fonte_OSM, THE Deduplicador SHALL procurar uma Empresa existente na Base_de_Empresas comparando os identificadores preenchidos na ordem `googlePlaceId`, `osmId`, `cnpj`. Identificadores vazios ou nulos são ignorados. A busca para no primeiro identificador que coincidir, e essa Empresa é considerada a mesma.
2. IF nenhum identificador coincide, THEN THE Deduplicador SHALL considerar como a mesma a Empresa existente que tenha o mesmo Nome_Normalizado, com Nome_Normalizado não vazio, e distância geodésica entre coordenadas ≤ 100 metros, desde que a empresa encontrada e a Empresa existente tenham latitude e longitude. Se houver mais de uma candidata, vale a de menor distância.
3. IF a empresa encontrada ou a candidata não tem coordenadas, ou o Nome_Normalizado fica vazio, THEN THE Deduplicador SHALL deixar de aplicar o critério 2 e considerar a empresa como inexistente na Base_de_Empresas.
4. WHEN a empresa já existe, THE Minerador SHALL atualizar na Empresa existente os campos cadastrais nome, endereço, bairro, cidade, UF, telefone, website, latitude, longitude e marcaRede. Um valor já preenchido só é sobrescrito se o novo valor não for vazio. `assignedTo`, a data de criação e os identificadores já preenchidos continuam iguais. Em seguida, cria o Vinculo_Mineracao com `isNew = false`.
5. WHEN a empresa não existe, THE Minerador SHALL criar a Empresa com os campos mapeados pela Fonte_OSM e SHALL criar o Vinculo_Mineracao com `isNew = true`.
6. IF a mesma Empresa aparece mais de uma vez nos resultados de uma mesma Mineracao (por exemplo, em dois Nichos), THEN THE Minerador SHALL manter um único Vinculo_Mineracao por par (runId, companyId). O valor de `isNew` é o que foi definido na primeira ocorrência, e a Empresa conta uma única vez no `total` da Mineracao.
7. WHEN uma Empresa é analisada em um Lote, THE Minerador SHALL criar exatamente uma nova Analise e SHALL atualizar o snapshot da Empresa (categoria, scoreFinal, prioridade, hasSite, isHttps, lastAnalyzedAt) com os valores dessa Analise. `lastAnalyzedAt` recebe a data e hora de criação da Analise.
8. IF a criação da Analise ou a atualização do snapshot falha, THEN THE Minerador SHALL desfazer as duas operações, deixando a Empresa com o snapshot anterior e sem nova Analise, e SHALL tratar a falha conforme o critério 9 do Requisito 8.
9. THE Minerador SHALL manter todas as Analises anteriores de uma Empresa, sem alterar nem excluir nenhuma, e a quantidade de Analises de uma Empresa SHALL ser igual ao número de análises concluídas com sucesso para ela.
10. FOR ALL resultados de busca, processar o mesmo resultado duas vezes SHALL produzir o mesmo conjunto de Empresas e o mesmo conjunto de Vinculo_Mineracao que processá-lo uma vez (idempotência da deduplicação).
11. THE Base_de_Empresas SHALL garantir a unicidade de `googlePlaceId`, `osmId` e `cnpj` quando preenchidos, e aceitar várias Empresas com esses campos vazios.
12. IF duas gravações simultâneas tentam criar Empresas com o mesmo `googlePlaceId`, `osmId` ou `cnpj`, THEN THE Minerador SHALL manter uma única Empresa e continuar a Mineracao sem marcá-la como `ERRO`.
13. THE modelo de dados SHALL incluir `Company`, `CompanyAlias`, `CompanyAnalysis`, `MiningRun`, `MiningRunCompany`, `ApiUsage` e `ProspectLead.companyId`, com os campos descritos na seção 5 do plano mestre, por meio de migração versionada do Prisma. A migração SHALL preservar os índices parciais existentes e os registros de `ProspectLead` já gravados, que ficam com `companyId` nulo.
14. WHEN uma gravação perde a disputa descrita no critério 12, THE Minerador SHALL reconsultar a Empresa vencedora e aplicar a ela a atualização de campos cadastrais do critério 4.
15. WHEN uma gravação perde a disputa descrita no critério 12, THE Minerador SHALL criar o Vinculo_Mineracao da Mineracao perdedora para a Empresa vencedora com `isNew = false`.
16. WHEN uma empresa encontrada é considerada a mesma de uma Empresa existente por critério que não seja o seu próprio `osmId`, THE Minerador SHALL registrar o `osmId` encontrado como alias da Empresa, e THE Deduplicador SHALL considerar os aliases como identificadores `osmId`.

### Requirement 10: Tela Minerar

**User Story:** Como membro de Negócios, quero um formulário para iniciar uma mineração, para que eu escolha local e nichos e acompanhe o progresso.

#### Acceptance Criteria

1. THE Tela_Minerar SHALL oferecer os campos bairro (texto, 1 a 100 caracteres após remover espaços nas extremidades), cidade (texto, 1 a 100 caracteres após remover espaços nas extremidades) e UF (lista com exatamente as 27 UFs), a seleção de um Preset ou de Nichos individuais (de 1 a 22 Nichos), a opção "excluir redes" (desmarcada por padrão) e a opção "usar IA".
2. WHEN o usuário seleciona um Preset, THE Tela_Minerar SHALL marcar exatamente os Nichos definidos para esse Preset na Configuracao_Minerador e SHALL permitir marcar ou desmarcar Nichos individuais em seguida.
3. IF bairro ou cidade está vazio ou contém apenas espaços, a UF não está selecionada ou nenhum Nicho está selecionado, THEN THE Tela_Minerar SHALL desabilitar o botão de iniciar e SHALL exibir, junto a cada campo pendente, uma indicação de qual campo precisa ser preenchido.
4. WHEN o usuário preenche bairro, cidade e UF e esses valores coincidem com os de uma Mineracao `CONCLUIDA` anterior, comparando bairro e cidade sem diferenciar maiúsculas/minúsculas, ignorando acentos e ignorando espaços nas extremidades, e UF por igualdade exata, THE Tela_Minerar SHALL exibir o aviso "Bairro já minerado em DD/MM por Fulano (N leads)", em que DD/MM é a data da Mineracao, Fulano é o nome do autor e N é o `total` dessa Mineracao, usando a Mineracao `CONCLUIDA` mais recente, com as ações "Ver" e "Remineirar".
5. WHEN o usuário escolhe "Ver", THE Tela_Minerar SHALL abrir a Tela_Ranking filtrada pela Mineracao citada no aviso.
6. WHEN o usuário escolhe "Remineirar" ou aciona o botão de iniciar, THE Tela_Minerar SHALL solicitar a criação de uma nova Mineracao com os parâmetros informados e SHALL desabilitar o botão de iniciar até a resposta, de modo que cliques repetidos criem no máximo uma Mineracao.
7. WHILE uma Mineracao do autor está `PENDENTE` ou `EM_ANDAMENTO`, THE Tela_Minerar SHALL exibir, para cada uma dessas Mineracoes, uma barra de progresso com `processados` de `total`, a etapa atual ("Buscando no OpenStreetMap" enquanto `PENDENTE`, "Analisando empresas" enquanto `EM_ANDAMENTO`) e as contagens de Empresas novas (Vinculo_Mineracao com `isNew = true`) e já existentes (`isNew = false`), atualizando esses valores ao término de cada Lote.
8. WHEN a Mineracao muda para `CONCLUIDA`, THE Tela_Minerar SHALL exibir um toast de conclusão com o número de Empresas processadas e um link para a Tela_Ranking filtrada por essa Mineracao.
9. IF a Mineracao muda para `ERRO`, THEN THE Tela_Minerar SHALL encerrar a barra de progresso e SHALL exibir a mensagem de erro registrada na Mineracao.
10. IF a solicitação de criação da Mineracao falha, THEN THE Tela_Minerar SHALL exibir uma mensagem de erro indicando que a mineração não foi iniciada, SHALL manter todos os valores preenchidos no formulário e SHALL reabilitar o botão de iniciar.
11. IF a Mineracao muda para `ERRO` com `processados` maior que 0, THEN THE Tela_Minerar SHALL exibir um link para a Tela_Ranking filtrada por essa Mineracao.
12. IF a Mineracao muda para `ERRO` com `processados` igual a 0, THEN THE Tela_Minerar SHALL omitir qualquer link para a Tela_Ranking referente a essa Mineracao.

### Requirement 11: Histórico de minerações

**User Story:** Como membro de Negócios, quero ver as minerações já feitas, para que a equipe não repita trabalho.

#### Acceptance Criteria

1. WHEN um Usuario_Negocios abre a Tela_Mineracoes, THE Tela_Mineracoes SHALL listar as Mineracoes de todos os autores, cada uma com bairro, cidade, UF, data de criação no formato DD/MM/AAAA HH:mm, nome do autor, fonte, Status_Mineracao, `total` e quantidade de Empresas novas (número de Vinculo_Mineracao da Mineracao com `isNew = true`). A lista SHALL vir ordenada por data de criação decrescente.
2. WHEN o usuário digita de 1 a 100 caracteres na busca, THE Tela_Mineracoes SHALL exibir, em até 1 segundo, apenas as Mineracoes cujo bairro, cidade ou nome do autor contém o texto digitado como substring. A comparação SHALL ignorar maiúsculas, acentos e espaços nas extremidades. Com a busca vazia, SHALL exibir todas as Mineracoes que atendem aos demais filtros.
3. THE Tela_Mineracoes SHALL oferecer filtros por UF (lista das 27 UFs), Status_Mineracao, fonte e intervalo de datas (data inicial e data final, ambas inclusivas e opcionais). Os filtros ativos e a busca SHALL ser combinados com E lógico.
4. THE Tela_Mineracoes SHALL paginar os resultados em páginas de no máximo 20 itens, exibir o número da página atual e o total de páginas, e voltar para a página 1 sempre que a busca ou qualquer filtro mudar.
5. WHEN o usuário seleciona uma Mineracao de qualquer Status_Mineracao, exceto `ERRO` com `processados` igual a 0, THE Tela_Mineracoes SHALL abrir a Tela_Ranking filtrada por essa Mineracao.
6. IF nenhuma Mineracao atende à busca e aos filtros ativos, THEN THE Tela_Mineracoes SHALL exibir uma mensagem indicando que nenhuma mineração foi encontrada, sem controles de paginação.
7. IF a data inicial é posterior à data final, THEN THE Tela_Mineracoes SHALL indicar o intervalo de datas como inválido, não aplicar o filtro de datas e manter a lista exibida anteriormente.
8. IF um usuário que não é Usuario_Negocios acessa a Tela_Mineracoes ou solicita a lista de Mineracoes, THEN THE Minerador SHALL negar o acesso, indicar falta de permissão e não retornar nenhum dado de Mineracao.
9. IF uma Mineracao tem status `ERRO` e `processados` igual a 0, THEN THE Tela_Mineracoes SHALL omitir qualquer link ou ação de abertura da Tela_Ranking para essa Mineracao.

### Requirement 12: Ranking de empresas

**User Story:** Como membro de Negócios, quero ver toda a base ordenada por score com filtros, para que eu escolha os melhores leads.

#### Acceptance Criteria

1. WHEN um Usuario_Negocios abre a Tela_Ranking, THE Tela_Ranking SHALL listar as Empresas da Base_de_Empresas em páginas de 50 itens. A lista SHALL seguir Score_Final decrescente, com empate resolvido por nome em ordem alfabética crescente. Empresas sem Analise SHALL aparecer ao final. A tela SHALL exibir o número da página atual e o total de Empresas que atendem aos filtros e, quando nenhuma Empresa atender aos filtros, SHALL exibir uma mensagem indicando que não há resultados.
2. THE Tela_Ranking SHALL oferecer filtros por cidade, bairro, UF, Nicho, Categoria, Prioridade, faixa de Score_Final (valores inteiros de 0 a 100, inclusive), tem site, tem HTTPS, fonte, Responsavel, status do Lead_de_Triagem, intervalo da data da última análise e Mineracao. A lista SHALL conter somente as Empresas que atendem a todos os filtros preenchidos ao mesmo tempo.
3. WHEN o usuário digita na busca um texto de 1 a 100 caracteres, desconsiderados os espaços nas extremidades, THE Tela_Ranking SHALL listar somente as Empresas cujo nome, endereço ou telefone contenha esse texto, sem diferenciar maiúsculas e minúsculas, em conjunto com os filtros ativos.
4. WHEN o usuário altera um filtro, a busca ou a página, THE Tela_Ranking SHALL obter do servidor a página já filtrada e ordenada. Após alteração de filtro ou de busca, a tela SHALL voltar para a página 1.
5. THE Tela_Ranking SHALL permitir selecionar de 1 a 200 Empresas e aplicar a elas as ações em lote "Enviar para triagem", "Atribuir" e "Exportar CSV". O botão de cada ação SHALL ficar desabilitado enquanto nenhuma Empresa estiver selecionada, exceto "Exportar CSV", que sem seleção exporta as Empresas filtradas (Requisito 17, critério 1).
6. THE Tela_Ranking SHALL exibir a Atribuicao_ODbL, com o link para `https://www.openstreetmap.org/copyright`, sempre que a lista ou o Mapa estiver visível.
7. WHEN o usuário aplica "Enviar para triagem", THE Tela_Ranking SHALL criar um Lead_de_Triagem vinculado (`companyId`) para cada Empresa selecionada que ainda não tenha um. As Empresas que já têm Lead_de_Triagem SHALL ficar como estão. A tela SHALL exibir a quantidade de leads criados e a de Empresas ignoradas.
8. IF o usuário não é Atribuidor, THEN THE Tela_Ranking SHALL ocultar a ação "Atribuir" (Requisito 16, critério 6). IF uma requisição de atribuição vier de um usuário que não é Atribuidor, THEN THE Minerador SHALL rejeitá-la sem alterar o Responsavel de nenhuma Empresa e SHALL exibir uma mensagem de erro indicando falta de permissão.
9. IF o valor mínimo da faixa de Score_Final é maior que o máximo, ou se algum dos dois está fora de 0 a 100, THEN THE Tela_Ranking SHALL ignorar somente o filtro de faixa de Score_Final.
10. IF a faixa de Score_Final é inválida conforme o critério 9, THEN THE Tela_Ranking SHALL indicar o campo inválido.
11. WHILE a faixa de Score_Final é inválida conforme o critério 9, THE Tela_Ranking SHALL aplicar os demais filtros e a busca ativos e atualizar a lista conforme eles.

### Requirement 13: Mapa

**User Story:** Como membro de Negócios, quero ver os leads filtrados no mapa, para que eu planeje abordagens por região.

#### Acceptance Criteria

1. WHEN a Tela_Ranking carrega ou o usuário altera filtros ou busca, THE Mapa SHALL exibir, com Leaflet e tiles do OpenStreetMap, exatamente um marcador por Empresa que atende a todos os filtros e à busca ativos da Tela_Ranking, considerando todas as páginas do resultado, e que tenha latitude entre -90 e 90 e longitude entre -180 e 180, ambas preenchidas. Empresas sem coordenadas ou com coordenadas fora desses intervalos não recebem marcador.
2. IF mais de 2.000 Empresas filtradas têm coordenadas válidas, THEN THE Mapa SHALL exibir marcadores apenas para as 2.000 de maior Score_Final e SHALL exibir um aviso com a quantidade exibida e a quantidade total.
3. WHEN os marcadores são exibidos, THE Mapa SHALL ajustar a visualização para que todos os marcadores exibidos fiquem dentro da área visível.
4. THE Mapa SHALL colorir cada marcador com uma de quatro cores distintas: uma para cada Prioridade ("Alta", "Média", "Baixa") e uma para Empresa sem Prioridade (ainda não analisada). THE Mapa SHALL exibir legenda visível que relacione cada uma das quatro cores ao seu rótulo em texto.
5. WHEN o usuário clica em um marcador, THE Mapa SHALL exibir um popup com nome, Categoria, Score_Final, Prioridade em texto e um link que abre a Ficha_Empresa daquela Empresa. Para Empresa ainda não analisada, o popup SHALL exibir "—" no lugar de Categoria, Score_Final e Prioridade.
6. IF nenhuma Empresa filtrada tem coordenadas válidas, THEN THE Mapa SHALL exibir mensagem indicando que não há Empresas com localização para os filtros atuais, sem nenhum marcador.
7. IF os tiles do OpenStreetMap não carregam, THEN THE Mapa SHALL exibir mensagem indicando falha ao carregar o mapa, e THE Tela_Ranking SHALL continuar exibindo a lista de Empresas.
8. THE Mapa SHALL exibir a Atribuicao_ODbL no controle de atribuição do Leaflet, visível sempre que o Mapa estiver visível e com link para `https://www.openstreetmap.org/copyright`.
9. THE Mapa SHALL ser carregado somente no cliente: o HTML da Tela_Ranking gerado no servidor SHALL NOT incluir o Mapa, e a renderização da Tela_Ranking no servidor SHALL NOT falhar por ausência de APIs de navegador.

### Requirement 14: Ficha da empresa

**User Story:** Como membro de Negócios, quero ver o diagnóstico completo de uma empresa, para que eu prepare a abordagem.

#### Acceptance Criteria

1. WHEN um Usuario_Negocios abre a Ficha_Empresa de uma Empresa existente, THE Ficha_Empresa SHALL exibir nome, endereço, bairro, cidade, UF, telefone, website, Nicho (rótulo e Tier), fonte, marcaRede (quando preenchida), Responsavel e status do Lead_de_Triagem vinculado, indicando "não informado" em cada campo vazio e "não enviada para triagem" quando não houver Lead_de_Triagem vinculado.
2. WHEN a Ficha_Empresa é aberta e a Empresa possui ao menos uma Analise, THE Ficha_Empresa SHALL exibir o diagnóstico do site da Analise com a data mais recente: status HTTP, uso de HTTPS, validade do SSL, tempo de resposta em milissegundos, disponibilidade (online/offline), motivo da falha quando offline, Categoria e a lista de motivos registrada pelo Classificador; IF a Empresa não possui website, THEN THE Ficha_Empresa SHALL exibir a indicação "sem site" no lugar de status HTTP, HTTPS, SSL, tempo de resposta e disponibilidade.
3. WHEN a Ficha_Empresa é aberta e a Empresa possui ao menos uma Analise, THE Ficha_Empresa SHALL exibir, da Analise mais recente, o valor de cada componente com seu máximo (presença digital de 0 a 40, ICP de 0 a 25, IA de 0 a 35), os critérios que compuseram cada componente, o Score_Final (0 a 100) e a Prioridade; IF a Analise não possui resultado de IA, THEN THE Ficha_Empresa SHALL indicar o componente IA como "não aplicado" e que o Score_Final foi calculado por round(Score_Objetivo × 100 / 65).
4. WHERE a Analise mais recente possui resultado de IA, THE Ficha_Empresa SHALL exibir a descrição da oportunidade e a justificativa retornadas pelo Analisador_IA.
5. THE Ficha_Empresa SHALL listar todas as Analises da Empresa, ordenadas da mais recente para a mais antiga, cada uma com data e hora (DD/MM/AAAA HH:mm), Score_Final e Categoria; IF a Empresa não possui nenhuma Analise, THEN THE Ficha_Empresa SHALL exibir a indicação "empresa ainda não analisada" no lugar do diagnóstico, do detalhamento do score e do histórico.
6. THE Ficha_Empresa SHALL listar todas as Mineracoes com Vinculo_Mineracao para a Empresa, ordenadas da mais recente para a mais antiga, cada uma com bairro, cidade, UF, data, autor, indicação se a Empresa era nova (`isNew`) naquela Mineracao e link para a Tela_Ranking filtrada por essa Mineracao.
7. WHILE a Empresa não tem Responsavel e o usuário é Usuario_Negocios, THE Ficha_Empresa SHALL exibir a ação "Assumir lead"; WHILE a Empresa tem Responsavel, THE Ficha_Empresa SHALL ocultar a ação "Assumir lead".
8. WHILE a fonte da Empresa é `OSM`, THE Ficha_Empresa SHALL exibir a Atribuicao_ODbL.
9. WHEN o Usuario_Negocios aciona "Assumir lead", THE Minerador SHALL definir o usuário da sessão como Responsavel da Empresa conforme o Requisito 16, critério 3, registrar o evento no AuditLog e, em até 2 segundos após a confirmação do servidor, exibir o novo Responsavel na Ficha_Empresa sem a ação "Assumir lead".
10. IF outro usuário já se tornou Responsavel da Empresa no momento em que "Assumir lead" é processado, THEN THE Minerador SHALL recusar a ação conforme o Requisito 16, critério 4, manter o Responsavel existente inalterado e THE Ficha_Empresa SHALL exibir mensagem de erro indicando que o lead já foi assumido e mostrar o Responsavel atual.
11. IF a Empresa solicitada não existe, THEN THE Ficha_Empresa SHALL exibir indicação de empresa não encontrada sem exibir nenhum dado; IF o usuário não é Usuario_Negocios, THEN THE Minerador SHALL negar o acesso à Ficha_Empresa sem retornar nenhum dado da Empresa.
12. IF a confirmação do servidor para "Assumir lead" demora mais de 2 segundos, THEN THE Ficha_Empresa SHALL exibir um indicador de que a operação está demorando mais que o esperado até a resposta chegar.
13. IF a solicitação de "Assumir lead" falha por motivo diferente do critério 10, THEN THE Ficha_Empresa SHALL exibir mensagem de erro indicando que o lead não foi assumido e SHALL manter a ação "Assumir lead" disponível.

### Requirement 15: Integração com a triagem

**User Story:** Como membro de Negócios, quero enviar empresas mineradas para a triagem existente, para que elas sigam o fluxo até o funil de vendas.

#### Acceptance Criteria

1. WHEN um Usuario_Negocios aciona "Enviar para triagem" com 1 a 200 Empresas selecionadas na Tela_Ranking, THE Minerador SHALL criar, para cada Empresa selecionada sem Lead_de_Triagem vinculado, exatamente um Lead_de_Triagem com status `RAW`, `companyId` igual ao da Empresa, companyName igual ao nome da Empresa, contactInfo com o telefone e o website da Empresa (omitindo os que estiverem vazios), segment igual ao rótulo em português do Nicho e actionPlan derivado da Categoria conforme o critério 2.
2. THE Minerador SHALL preencher o actionPlan do Lead_de_Triagem com um texto fixo distinto para cada uma das três Categorias ("Criar Site do Zero", "Otimização / Segurança", "Análise de Dados / BI") e, quando a Empresa ainda não possui Categoria, com o texto padrão "Aguardando definição de abordagem comercial" usado pela importação de leads existente.
3. IF a Empresa já possui Lead_de_Triagem vinculado, THEN THE Minerador SHALL manter o Lead_de_Triagem existente inalterado, SHALL não criar outro e SHALL contar a Empresa como ignorada.
4. IF dois ou mais envios para triagem incluem a mesma Empresa ao mesmo tempo, THEN THE Minerador SHALL criar no máximo um Lead_de_Triagem para essa Empresa e SHALL contar a Empresa como ignorada nos demais envios.
5. WHEN o envio termina com sucesso, THE Tela_Ranking SHALL exibir um toast com a quantidade de Leads_de_Triagem criados e a quantidade de Empresas ignoradas, cuja soma é igual ao número de Empresas selecionadas.
6. IF a Empresa tem Responsavel, THEN THE Minerador SHALL copiar o Responsavel para `assignedTo` do Lead_de_Triagem criado; IF a Empresa não tem Responsavel, THEN THE Minerador SHALL deixar `assignedTo` vazio.
7. IF nenhuma Empresa está selecionada ou mais de 200 Empresas estão selecionadas, THEN THE Tela_Ranking SHALL desabilitar a ação "Enviar para triagem" e exibir o limite de 1 a 200 Empresas.
8. THE Minerador SHALL preservar o fluxo existente de triagem (RAW → PENDING → triagem) e de conversão em card no funil de vendas para Leads_de_Triagem com ou sem `companyId`, sem alterar o comportamento para Leads_de_Triagem sem `companyId`.
9. IF o usuário da sessão não é Usuario_Negocios, THEN THE Minerador SHALL rejeitar o envio para triagem com indicação de acesso negado e SHALL não criar nenhum Lead_de_Triagem.
10. IF ocorre erro durante a gravação de um envio para triagem, THEN THE Minerador SHALL desfazer todos os Leads_de_Triagem criados nesse envio e THE Tela_Ranking SHALL exibir um toast de erro indicando que nenhum lead foi enviado, mantendo a seleção de Empresas.
11. WHEN um envio para triagem cria ao menos um Lead_de_Triagem, THE Minerador SHALL registrar no AuditLog o autor da sessão e os identificadores dos Leads_de_Triagem criados, conforme o Requisito 18, critério 8.
12. IF uma requisição de envio para triagem chega ao servidor com 0 ou mais de 200 Empresas, THEN THE Minerador SHALL rejeitá-la com status 400 e mensagem indicando o limite de 1 a 200 Empresas, sem criar nenhum Lead_de_Triagem.

### Requirement 16: Atribuição de responsável

**User Story:** Como Gerente de Negócios, quero atribuir empresas a membros da equipe, para que cada lead tenha um dono.

#### Acceptance Criteria

1. WHEN um Atribuidor aciona "Atribuir" na Tela_Ranking com um usuário de destino e de 1 a 200 Empresas selecionadas, THE Minerador SHALL definir o usuário de destino como Responsavel de todas as Empresas selecionadas e como `assignedTo` de todos os Leads_de_Triagem vinculados a essas Empresas, substituindo qualquer Responsavel anterior.
2. IF o usuário de destino não existe ou não satisfaz `canBeLeadAssignee`, THEN THE Minerador SHALL rejeitar a atribuição com status 400 e mensagem indicando que o usuário não pode ser Responsavel, sem alterar nenhuma Empresa nem Lead_de_Triagem.
3. WHEN um Usuario_Negocios aciona "Assumir lead" na Ficha_Empresa de uma Empresa sem Responsavel, THE Minerador SHALL definir o usuário da sessão como Responsavel da Empresa e como `assignedTo` do Lead_de_Triagem vinculado, se existir, e THE Ficha_Empresa SHALL exibir o usuário da sessão como Responsavel e ocultar a ação "Assumir lead".
4. IF a Empresa já possui Responsavel no momento de assumir, incluindo o caso de duas solicitações simultâneas de "Assumir lead" para a mesma Empresa, THEN THE Minerador SHALL aceitar apenas a primeira solicitação, SHALL rejeitar as demais com status 409 sem alterar o Responsavel, e THE Ficha_Empresa SHALL exibir o Responsavel atual.
5. IF `canChangeLeadAssignee` de `lib/permissions.ts` retorna falso para o usuário da sessão, a Empresa e o usuário de destino, THEN THE Minerador SHALL rejeitar a mudança de Responsavel com status 403 e mensagem indicando falta de permissão, sem alterar nenhuma Empresa nem Lead_de_Triagem, inclusive quando a requisição é feita diretamente à API sem passar pela interface.
6. WHILE o usuário da sessão não é Atribuidor, THE Tela_Ranking SHALL ocultar a ação em lote "Atribuir".
7. IF a seleção de "Atribuir" contém 0 Empresas, mais de 200 Empresas ou alguma Empresa inexistente, THEN THE Minerador SHALL rejeitar a atribuição com status 400 e mensagem indicando o problema da seleção, sem alterar nenhuma Empresa nem Lead_de_Triagem.
8. IF a atualização de qualquer Empresa ou Lead_de_Triagem da seleção falha durante "Atribuir", THEN THE Minerador SHALL desfazer as alterações de todas as Empresas e Leads_de_Triagem da seleção e THE Tela_Ranking SHALL exibir mensagem de erro indicando que nenhuma atribuição foi aplicada.
9. WHEN a atribuição em lote é concluída com sucesso, THE Tela_Ranking SHALL exibir um toast com a quantidade de Empresas atribuídas e o nome do Responsavel, e SHALL exibir o novo Responsavel nas linhas das Empresas afetadas sem exigir recarregamento manual da página.

### Requirement 17: Exportação CSV

**User Story:** Como membro de Negócios, quero exportar leads em CSV, para que eu os use em planilhas.

#### Acceptance Criteria

1. WHEN um Usuario_Negocios aciona "Exportar CSV", THE Exportador_CSV SHALL gerar um arquivo com as Empresas selecionadas na Tela_Ranking ou, se nenhuma estiver selecionada, com todas as Empresas que atendem aos filtros e à busca ativos na Tela_Ranking. As linhas SHALL seguir a mesma ordenação da Tela_Ranking (Requisito 12, critério 1).
2. THE Exportador_CSV SHALL gerar o arquivo em UTF-8 com BOM, separador `;` e fim de linha CRLF. O arquivo SHALL ter uma linha de cabeçalho com os rótulos das colunas em português, seguida de exatamente uma linha por Empresa, com as colunas nesta ordem: nome, Nicho, endereço, bairro, cidade, UF, telefone, website, Categoria, Score_Final, Prioridade, Responsavel e data da última análise.
3. THE Exportador_CSV SHALL formatar os valores assim: Nicho pelo rótulo em português da Configuracao_Minerador; Score_Final como inteiro de 0 a 100; Responsavel pelo nome do usuário; data da última análise no formato DD/MM/AAAA. Todo campo sem valor (inclusive Responsavel ausente e Empresa nunca analisada) SHALL ficar como célula vazia.
4. THE Exportador_CSV SHALL colocar entre aspas duplas todo valor que contenha aspas duplas, `;`, CR ou LF, e SHALL duplicar cada aspas dupla interna, conforme RFC 4180.
5. THE Exportador_CSV SHALL prefixar com um apóstrofo (`'`) todo valor cujo primeiro caractere seja `=`, `+`, `-`, `@`, tabulação ou retorno de carro, para evitar injeção de fórmulas.
6. FOR ALL conjuntos de Empresas, ler o CSV gerado com um parser RFC 4180 de separador `;` SHALL reproduzir o mesmo número de linhas e o mesmo valor em cada célula, desconsiderado o prefixo do critério 5 (round-trip).
7. IF o conjunto a exportar tiver mais de 5.000 Empresas, THEN THE Exportador_CSV SHALL incluir somente as 5.000 primeiras na ordenação do critério 1, e THE Tela_Ranking SHALL exibir um aviso de que o limite de 5.000 linhas foi atingido, com o total de Empresas que atendiam aos critérios.
8. IF o conjunto a exportar não tiver nenhuma Empresa, THEN THE Exportador_CSV SHALL não gerar arquivo, e THE Tela_Ranking SHALL exibir um aviso de que não há Empresas para exportar.
9. IF o usuário que solicita a exportação não é Usuario_Negocios, THEN THE Exportador_CSV SHALL rejeitar a solicitação sem gerar arquivo e SHALL retornar um erro indicando falta de permissão.

### Requirement 18: Permissões e segurança das APIs

**User Story:** Como Presidente, quero que o minerador respeite a matriz de permissões no servidor, para que apenas quem deve acesse os leads.

#### Acceptance Criteria

1. THE Minerador SHALL proteger toda rota `/api/tools/lead-miner/**` com `withAuth` e SHALL avaliar `canUseNegociosTools` de `lib/permissions.ts` no servidor antes de qualquer leitura ou escrita, inclusive as de Lote, exportação CSV, envio para triagem e atribuição.
2. IF a requisição a uma rota `/api/tools/lead-miner/**` não possui sessão válida, THEN THE Minerador SHALL responder com status 401, sem retornar dados e sem alterar nenhum registro.
3. IF o usuário da sessão não satisfaz `canUseNegociosTools`, THEN THE Minerador SHALL responder com status 403 e uma mensagem indicando falta de permissão, sem retornar dados de Empresas, Mineracoes ou Leads_de_Triagem e sem alterar nenhum registro.
4. THE Minerador SHALL obter o autor de Mineracoes, envios para triagem, atribuições e registros de AuditLog exclusivamente da sessão, ignorando qualquer campo de autor ou identificador de usuário de origem enviado no corpo ou na query da requisição.
5. WHEN uma rota `/api/tools/lead-miner/**` recebe parâmetros, THE Minerador SHALL validá-los no servidor com as regras: UF entre as 27 UFs válidas; lista de Nichos com 1 a 22 itens, todos existentes na Configuracao_Minerador e sem repetição; Preset entre `icp`, `produto`, `servico` e `todos`; bairro e cidade com 1 a 100 caracteres após remoção de espaços nas extremidades; faixa de Score_Final com mínimo e máximo inteiros entre 0 e 100 e mínimo ≤ máximo; datas de intervalo válidas com data inicial ≤ data final; página inteira ≥ 1; seleção de Empresas em lote com 1 a 200 identificadores (a exportação CSV sem seleção usa os filtros e respeita o limite de 5.000 linhas do Requisito 17).
6. IF qualquer parâmetro viola as regras do critério 5, THEN THE Minerador SHALL responder com status 400 e mensagem indicando o parâmetro inválido, sem criar Mineracao, Lead_de_Triagem, Analise ou AuditLog e sem alterar Empresas.
7. IF o usuário da sessão solicita nova Mineracao e já é autor de uma Mineracao com Status_Mineracao `PENDENTE` ou `EM_ANDAMENTO` com o mesmo bairro, cidade e UF (comparados como no Requisito 10, critério 4) e o mesmo conjunto de Nichos (independentemente da ordem), THEN THE Minerador SHALL responder com status 409 e mensagem indicando a Mineracao em andamento, sem criar nova Mineracao.
8. WHEN o Responsavel de uma Empresa é alterado com sucesso ou uma Empresa é enviada com sucesso para triagem, THE Minerador SHALL registrar um AuditLog por Empresa afetada contendo autor da sessão, ação, identificador da Empresa, valor anterior e valor posterior; IF a operação é rejeitada, THEN THE Minerador SHALL não registrar AuditLog de alteração.
9. THE Minerador SHALL usar `mode: 'insensitive'` em todas as buscas textuais do Prisma.
10. THE Minerador SHALL manter `GEMINI_API_KEY` e demais segredos apenas no servidor, sem incluí-los no código enviado ao navegador, em respostas das rotas `/api/tools/lead-miner/**` ou em mensagens de erro exibidas ao usuário.
11. IF o Minerador rejeita uma requisição por falta de permissão (incluindo Requisito 12, critério 8; Requisito 16, critério 5; e critério 3 deste requisito), THEN THE Minerador SHALL responder somente com o erro de permissão, sem registrar AuditLog e sem criar ou alterar nenhum registro.
12. WHEN o usuário da sessão solicita nova Mineracao com parâmetros que diferem, em bairro, cidade, UF ou conjunto de Nichos, de todas as suas Mineracoes `PENDENTE` ou `EM_ANDAMENTO`, THE Minerador SHALL criar a nova Mineracao conforme o Requisito 8, critério 1, permitindo sua execução simultânea com as demais.

### Requirement 19: Acesso pela área de Negócios e estilo visual

**User Story:** Como membro de Negócios, quero acessar o minerador pelas Ferramentas do departamento, para que ele se integre ao sistema.

#### Acceptance Criteria

1. THE Minerador SHALL remover o card placeholder "Enriquecedor B2B" de Negócios → Ferramentas e disponibilizar nessa área o card "Minerador de Leads".
2. WHEN um Usuario_Negocios aciona o card "Minerador de Leads" por clique ou pelas teclas Enter ou Espaço com o card em foco, THE Minerador SHALL navegar para a Tela_Minerar.
3. WHILE o usuário não satisfaz `canUseNegociosTools`, THE Minerador SHALL ocultar o card "Minerador de Leads" em Negócios → Ferramentas.
4. IF um usuário que não satisfaz `canUseNegociosTools` acessa diretamente pela URL qualquer página `/tools/lead-miner/**`, THEN THE Minerador SHALL exibir uma mensagem de acesso negado no lugar do conteúdo da página, sem exibir dados de Empresas, Mineracoes ou Analises e sem iniciar requisições às rotas `/api/tools/lead-miner/**`.
5. THE Tela_Minerar, a Tela_Mineracoes, a Tela_Ranking e a Ficha_Empresa SHALL usar fundo `bg-slate-950`, destaques (botões de ação principal e barra de progresso) em gradiente `from-purple-600 to-indigo-600`, cards `rounded-2xl` com `border-slate-800`, ícones exclusivamente de `lucide-react` e toasts exclusivamente de `sonner`.
6. THE Tela_Minerar, a Tela_Mineracoes, a Tela_Ranking, a Ficha_Empresa e o Mapa SHALL exibir em português todos os rótulos, botões, mensagens de erro, avisos e toasts, e SHALL exibir datas no formato DD/MM/AAAA, exceto onde outro formato for definido em outro requisito (ex.: DD/MM no aviso do Requisito 10, critério 4; DD/MM/AAAA HH:mm no Requisito 11, critério 1, e no Requisito 14, critério 5).
7. THE Tela_Minerar, a Tela_Mineracoes, a Tela_Ranking e a Ficha_Empresa SHALL permitir alcançar todos os elementos interativos com Tab e Shift+Tab e acioná-los com Enter ou Espaço, com indicador de foco visível; SHALL associar programaticamente um rótulo a cada campo de formulário; e SHALL exibir a Prioridade com o texto "Alta", "Média" ou "Baixa" junto de qualquer indicação por cor, incluindo a listagem da Tela_Ranking, a Ficha_Empresa, o popup e a legenda do Mapa.
8. WHILE o usuário satisfaz `canUseNegociosTools`, THE Minerador SHALL exibir o card "Minerador de Leads" em Negócios → Ferramentas.

### Requirement 20: Qualidade da entrega

**User Story:** Como desenvolvedor, quero testes das regras centrais, para que a lógica portada se comporte como o original.

#### Acceptance Criteria

1. THE Minerador SHALL incluir testes automatizados do Classificador que cubram, no mínimo: Empresa sem website ("Criar Site do Zero"); cada uma das cinco condições do Requisito 5, critério 2, isoladamente (site offline, status ≥ 400, sem HTTPS, SSL inválido, latência > 2,5 segundos), resultando em "Otimização / Segurança"; latência exatamente igual a 2,5 segundos e status 399 sem outra condição, resultando em "Análise de Dados / BI"; e a igualdade de Categoria e motivos em duas execuções com a mesma entrada.
2. THE Minerador SHALL incluir testes automatizados do Pontuador que cubram, no mínimo: Score_Final com IA (Score_Objetivo + Score_IA) e sem IA (round(Score_Objetivo × 100 / 65)); Score_Final inteiro entre 0 e 100 para as entradas de pontuação mínima e máxima; os limites de Prioridade com Score_Final 39, 40, 69 e 70; e a igualdade de Score_Final e Prioridade em duas execuções com a mesma entrada.
3. THE Minerador SHALL incluir testes automatizados do Deduplicador que cubram, no mínimo: coincidência por `googlePlaceId`, `osmId` e `cnpj` respeitando essa ordem de precedência; Nome_Normalizado com maiúsculas, acentos, pontuação, espaços repetidos e cada sufixo societário (ltda, me, eireli, s/a, sa, epp); distância de 100 metros tratada como mesma Empresa e distância acima de 100 metros tratada como Empresa distinta; e a idempotência descrita no Requisito 9, critério 10.
4. THE Minerador SHALL incluir testes automatizados da Guarda_SSRF que cubram, no mínimo, a rejeição de: esquema diferente de `http`/`https`; porta diferente de 80, 443 ou ausente; URL com credenciais; um endereço de cada intervalo listado em Endereco_Bloqueado (incluindo IPv4 mapeado em IPv6 e `169.254.169.254`); nome de host cuja resolução contenha ao menos um Endereco_Bloqueado entre endereços públicos; e redirecionamento para Endereco_Bloqueado; além da aceitação de uma URL `https` com endereço público.
5. THE Minerador SHALL incluir testes automatizados do Exportador_CSV que cubram, no mínimo: presença de BOM UTF-8 e separador `;`; escape de aspas, `;` e quebras de linha; prefixo com apóstrofo para valores iniciados por `=`, `+`, `-`, `@`, tabulação e retorno de carro; o round-trip do Requisito 17, critério 6; e o limite de 5.000 linhas com a indicação de limite atingido.
6. THE Minerador SHALL isolar as chamadas ao Nominatim, Overpass, Gemini, resolução DNS e sites externos por interfaces substituíveis, de modo que todos os testes automatizados executem sem acesso à rede e sem `GEMINI_API_KEY` configurada.
7. IF qualquer teste automatizado falha ou tenta acesso real à rede, THEN THE Minerador SHALL ser considerado não entregue.
8. WHEN a etapa é entregue, THE projeto SHALL concluir `npm run build` sem erros e SHALL executar todos os testes automatizados do Minerador com zero falhas.
9. WHEN a etapa é entregue, THE seção 8 do plano mestre (`docs/PLANO-INTEGRACAO.md`) SHALL registrar a Etapa 1 como concluída.
10. IF a seção 8 do plano mestre (`docs/PLANO-INTEGRACAO.md`) não registra a Etapa 1 como concluída, THEN THE Minerador SHALL ser considerado não entregue, mesmo com `npm run build` e todos os testes automatizados concluídos sem falhas.
