# Requirements Document

Melhorias do Minerador de Leads (Etapa 3)

## Introduction

A Etapa 3 do plano mestre (`docs/PLANO-INTEGRACAO.md`, seções 3, 5, 6, 7 e 8) amplia o Minerador de Leads entregue na Etapa 1 (`.kiro/specs/lead-miner/`) com cinco recursos:

1. **Google Places API (New)** como fonte de empresas, com fallback automático para o OpenStreetMap quando a chave falta, a cota mensal se esgota ou o serviço falha.
2. **PageSpeed Insights** para medir o desempenho do site de cada empresa.
3. **Enriquecimento de CNPJ** pela BrasilAPI, com descoberta do CNPJ no HTML do site ou digitação manual na Ficha.
4. **Detecção de Instagram, WhatsApp e tecnologias** a partir do HTML do site (e das tags OSM equivalentes).
5. **Mensagem de abordagem** sugerida na Ficha, gerada pelo Gemini, com modelo padrão quando a IA não está disponível.

Todos os requisitos da Etapa 1 continuam válidos, exceto onde um requisito desta etapa diz explicitamente que os altera. Cada serviço externo fica atrás de uma interface injetável e, quando indisponível, o Minerador segue funcionando sem ele (como já acontece com a IA e o `iaDisabledReason = 'SEM_CHAVE'`).

### Fora de escopo

- Envio automático de mensagens (WhatsApp, e-mail). O sistema só gera e copia o texto; quem envia é o usuário.
- Mesclagem manual de Empresas duplicadas (ex.: duas Empresas que apontam para o mesmo CNPJ). O conflito é só sinalizado.
- Reanálise em lote a partir da Tela_Ranking e reprocessamento automático da base antiga.
- Avaliações, notas, fotos, horários e resumos de IA do Google Places; exibição de Google Map.
- Detecção de Facebook, LinkedIn, TikTok e e-mails.
- Dados de campo do CrUX (o PageSpeed só fornece dados de laboratório nesta etapa).
- Quadro de sócios (QSA), e-mail e telefone da Receita Federal.
- Agendamento externo da purga do Cache_Google (Cloud Scheduler fica para a Etapa 4; nesta etapa a purga roda de forma oportunista, Requisito 6).

## Glossary

Termos da Etapa 1 (Minerador, Configuracao_Minerador, Nicho, Tier, Rede, Fonte_OSM, Nominatim, Overpass, Analisador_de_Site, Guarda_SSRF, Endereco_Bloqueado, Classificador, Categoria, Pontuador, Score_Objetivo, Score_IA, Score_Final, Prioridade, Analisador_IA, Pipeline, Lote, Mineracao, Status_Mineracao, Empresa, Analise, Vinculo_Mineracao, Uso_API, Deduplicador, Nome_Normalizado, Base_de_Empresas, Lead_de_Triagem, Usuario_Negocios, Responsavel, Tela_Minerar, Tela_Mineracoes, Tela_Ranking, Mapa, Ficha_Empresa, Exportador_CSV, Atribuicao_ODbL) mantêm o significado de `.kiro/specs/lead-miner/requirements.md`. Termos novos:

- **Fonte_Google**: módulo `lib/leads/sources/google-places.ts` que consulta a Places API (New) (Text Search e Place Details).
- **Place_ID**: identificador de lugar do Google (`places.id`), gravado em `Company.googlePlaceId`.
- **Conteudo_Google**: qualquer dado devolvido pela Places API além do Place_ID (nome, endereço, telefone, website, coordenadas, link do Google Maps, status de funcionamento, tipos).
- **Cache_Google**: armazenamento temporário do Conteudo_Google de uma Empresa, com data de obtenção e data de expiração.
- **Validade_Cache_Google**: 30 dias corridos contados da obtenção do Conteudo_Google.
- **Atribuicao_Google**: texto "Google Maps" (sem tradução, com `translate="no"`) ou logotipo oficial do Google Maps, exibido junto do Conteudo_Google conforme a política da Places API.
- **Modo_Fonte**: escolha de fonte de uma Mineracao: `OSM` (só OpenStreetMap), `GOOGLE` (Google Places, com fallback por Nicho para o OSM) ou `MISTA` (Google Places e OpenStreetMap em todos os Nichos).
- **Fonte_Efetiva**: fontes realmente usadas por uma Mineracao (`OSM`, `GOOGLE` ou `MISTA`), gravada em `MiningRun.fonte`.
- **Portao_Uso**: contrato `UsageGate` de `lib/leads/usage.ts`, estendido aos provedores `gemini`, `places` e `pagespeed`, que reserva atomicamente 1 chamada no mês corrente se o contador estiver abaixo do limite.
- **Servico_Externo**: cada um destes: Google Places, PageSpeed Insights, BrasilAPI e Gemini.
- **Motivo_Indisponibilidade**: motivo de um Servico_Externo não ser usado: `SEM_CHAVE`, `COTA_ESGOTADA`, `ERRO` ou `DESABILITADO_NA_MINERACAO`.
- **Corpo_HTML**: até 1.048.576 bytes do corpo da resposta final de um site analisado com `Content-Type` `text/html` ou `application/xhtml+xml`, decodificado como texto.
- **Detector_Sinais**: módulo puro `lib/leads/signals.ts` que extrai do Corpo_HTML e das tags OSM o perfil do Instagram, o número de WhatsApp e as Tecnologias.
- **Sinais_Digitais**: resultado do Detector_Sinais: `instagram` (handle ou nulo), `whatsapp` (número em dígitos E.164 sem `+` ou nulo), `tecnologias` (lista) e a origem de cada item (`SITE` ou `OSM`).
- **Catalogo_Tecnologias**: lista, na Configuracao_Minerador, de tecnologias detectáveis, cada uma com identificador, rótulo, grupo (`CMS`, `LOJA_VIRTUAL`, `ANALYTICS`, `MARKETING`, `FRAMEWORK`) e padrões de detecção.
- **Analisador_PageSpeed**: módulo `lib/leads/pagespeed.ts` que consulta a PageSpeed Insights API v5.
- **Resultado_PageSpeed**: notas 0–100 de desempenho, acessibilidade, boas práticas e SEO, e as métricas LCP, CLS, TBT e FCP de laboratório, na estratégia `mobile`.
- **Desempenho_Ruim**: nota de desempenho do Resultado_PageSpeed estritamente menor que 50.
- **CNPJ**: identificador de 14 caracteres da Receita Federal: 12 caracteres alfanuméricos (`0`–`9`, `A`–`Z`) seguidos de 2 dígitos verificadores numéricos (formato alfanumérico vigente a partir de julho de 2026; o CNPJ só numérico é um caso particular).
- **Validador_CNPJ**: módulo puro `lib/leads/cnpj.ts` que normaliza, valida os dígitos verificadores e formata CNPJs (`AA.AAA.AAA/AAAA-DD`).
- **Origem_CNPJ**: `SITE` (encontrado no Corpo_HTML) ou `MANUAL` (digitado por um Usuario_Negocios).
- **Enriquecedor_CNPJ**: componente que consulta `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` e grava os Dados_CNPJ.
- **Dados_CNPJ**: razão social, nome fantasia, situação cadastral e data, CNAE principal (código e descrição), porte, natureza jurídica, opção pelo MEI, data de início de atividade, município e UF, com a data da consulta.
- **CNPJ_Candidato**: CNPJ válido encontrado no Corpo_HTML que ainda não foi aplicado à Empresa.
- **Gerador_Abordagem**: módulo `lib/leads/approach.ts` que produz a Mensagem_Abordagem.
- **Mensagem_Abordagem**: texto sugerido para o primeiro contato com a Empresa, com canal (`WHATSAPP` ou `EMAIL`), origem (`IA` ou `MODELO`), autor, data e a Analise usada como base.
- **Versao_Score**: versão das regras de classificação e pontuação gravada em cada Analise: `1` para as Analises da Etapa 1 e `2` para as criadas a partir desta etapa.
- **Reanalise**: nova Analise de uma Empresa solicitada na Ficha_Empresa, fora de uma Mineracao.
- **Nome_Exibicao**: nome mostrado e usado na ordenação: nome do Cache_Google válido, senão nome fantasia dos Dados_CNPJ, senão `Company.nome`.

## Requirements

### Requirement 1: Configuração das melhorias

**User Story:** Como desenvolvedor, quero limites, timeouts e catálogos centralizados, para que eu ajuste custos e regras sem caçar valores no código.

#### Acceptance Criteria

1. THE Configuracao_Minerador SHALL definir, para cada um dos 22 Nichos, um texto de busca em português não vazio para a Fonte_Google e, opcionalmente, um tipo de lugar da Places API (`includedType`).
2. THE Configuracao_Minerador SHALL definir o limite mensal de chamadas à Places API lido de `PLACES_MONTHLY_LIMIT` e o limite mensal de chamadas à PageSpeed Insights API lido de `PAGESPEED_MONTHLY_LIMIT`, aplicando a mesma regra de `GEMINI_MONTHLY_LIMIT` (inteiro positivo; caso contrário, o padrão da Configuracao_Minerador: 1.000 para Places e 5.000 para PageSpeed).
3. THE Configuracao_Minerador SHALL definir os timeouts por requisição: 15 segundos para a Places API, 30 segundos para a PageSpeed Insights API, 8 segundos para a BrasilAPI e 20 segundos para o Gemini na geração da Mensagem_Abordagem.
4. THE Configuracao_Minerador SHALL definir o máximo de 3 páginas de resultados (até 60 lugares) por Nicho na Fonte_Google.
5. THE Configuracao_Minerador SHALL definir a Validade_Cache_Google em 30 dias e a validade dos Dados_CNPJ em 90 dias.
6. THE Configuracao_Minerador SHALL definir o limite de Desempenho_Ruim (nota < 50) e os pontos do critério de Desempenho_Ruim no componente de presença digital (Requisito 13).
7. THE Configuracao_Minerador SHALL definir o Catalogo_Tecnologias com no mínimo WordPress, Wix, Shopify, Nuvemshop, Loja Integrada, Tray, Squarespace, Webflow, Google Analytics, Google Tag Manager, Meta Pixel, jQuery, React, Next.js e Bootstrap, cada uma com identificador único, rótulo em português não vazio, grupo e no mínimo 1 padrão de detecção.
8. THE Configuracao_Minerador SHALL definir os limites da Mensagem_Abordagem: até 700 caracteres para `WHATSAPP`; assunto de até 120 caracteres e corpo de até 2.000 caracteres para `EMAIL`.
9. THE Configuracao_Minerador SHALL continuar isomórfica (Etapa 1, Requisito 1, critério 10) após as inclusões desta etapa.

### Requirement 2: Disponibilidade, cotas e chaves dos serviços externos

**User Story:** Como Presidente, quero controlar o custo e a disponibilidade de cada API externa, para que o minerador nunca gere cobrança inesperada nem pare por falta de uma chave.

#### Acceptance Criteria

1. THE Minerador SHALL considerar o Google Places disponível somente quando `GOOGLE_PLACES_API_KEY` está configurada e o Uso_API do provedor `places` no mês corrente é menor que o limite do Requisito 1, critério 2.
2. THE Minerador SHALL considerar a PageSpeed Insights disponível com ou sem `PAGESPEED_API_KEY`, enquanto o Uso_API do provedor `pagespeed` no mês corrente for menor que o limite do Requisito 1, critério 2, e SHALL enviar a chave na requisição somente quando ela estiver configurada.
3. THE Minerador SHALL considerar a BrasilAPI disponível sem chave e SHALL enviar no máximo 1 requisição por segundo à BrasilAPI, somando todas as Mineracoes e Reanalises em execução no mesmo processo do servidor.
4. WHEN o Minerador vai enviar uma requisição à Places API ou à PageSpeed Insights API, THE Minerador SHALL reservar 1 chamada no Portao_Uso do provedor correspondente antes de enviar, contando a chamada mesmo quando ela termina em erro ou timeout.
5. IF o Portao_Uso recusa a reserva de um provedor, THEN THE Minerador SHALL não enviar a requisição, SHALL tratar o Servico_Externo como indisponível com Motivo_Indisponibilidade `COTA_ESGOTADA` e SHALL continuar a Mineracao ou a Reanalise sem esse serviço.
6. WHEN um Usuario_Negocios abre a Tela_Minerar, THE Tela_Minerar SHALL exibir, para Google Places, PageSpeed Insights e IA (Gemini), o estado "disponível" ou o motivo da indisponibilidade ("chave não configurada" ou "cota mensal esgotada") e o uso do mês no formato "N de M chamadas".
7. WHILE `PAGESPEED_API_KEY` não está configurada, THE Tela_Minerar SHALL exibir junto da opção de PageSpeed o aviso "Sem chave: cota reduzida do Google".
8. THE Minerador SHALL manter `GOOGLE_PLACES_API_KEY`, `PAGESPEED_API_KEY` e `GEMINI_API_KEY` apenas no servidor, sem incluí-las no código enviado ao navegador, em respostas das rotas `/api/tools/lead-miner/**`, em mensagens de erro, em registros de log ou em campos gravados no banco (incluindo URLs de requisição gravadas).
9. THE `.env.example` SHALL documentar `GOOGLE_PLACES_API_KEY`, `PLACES_MONTHLY_LIMIT`, `PAGESPEED_API_KEY` e `PAGESPEED_MONTHLY_LIMIT`, com o valor padrão e o efeito de deixá-las vazias.

### Requirement 3: Busca de empresas no Google Places

**User Story:** Como membro de Negócios, quero buscar empresas também no Google, para que a mineração encontre negócios que não estão no OpenStreetMap.

#### Acceptance Criteria

1. WHEN a Fonte_Google consulta um Nicho, THE Fonte_Google SHALL enviar à Text Search (New) o texto de busca do Nicho combinado com bairro, cidade e UF da Mineracao, com `locationRestriction` igual ao retângulo da área de busca obtida no Nominatim (Etapa 1, Requisito 2, critério 1), `languageCode` `pt-BR`, `regionCode` `BR` e o tipo de lugar do Nicho quando definido.
2. THE Fonte_Google SHALL enviar em toda requisição uma máscara de campos (`X-Goog-FieldMask`) limitada a: id, nome de exibição, endereço formatado, componentes de endereço, localização, telefone nacional, website, link do Google Maps, status de funcionamento, tipos e token da próxima página.
3. WHEN a resposta da Text Search contém token de próxima página e o Nicho ainda não atingiu o máximo de páginas do Requisito 1, critério 4, THE Fonte_Google SHALL solicitar a página seguinte, reservando 1 chamada no Portao_Uso para cada página.
4. WHEN a Places API retorna lugares, THE Fonte_Google SHALL mapear cada lugar para Place_ID, nome, nicho, endereço, bairro, cidade, UF, telefone, website, latitude, longitude e link do Google Maps, deixando vazio qualquer campo ausente na resposta.
5. IF o lugar tem status de funcionamento `CLOSED_PERMANENTLY`, ou o nome fica vazio após remover espaços em branco, THEN THE Fonte_Google SHALL descartar o lugar sem incluí-lo na contagem total da Mineracao.
6. WHEN o mesmo Place_ID é retornado por mais de um Nicho na mesma Mineracao, THE Fonte_Google SHALL manter apenas o primeiro, associado ao primeiro Nicho que o retornou.
7. IF a Places API responde com status 429 ou 5xx, ou não responde em até 15 segundos, THEN THE Fonte_Google SHALL repetir a requisição até 2 vezes, aguardando 2 e 4 segundos, cada tentativa reservando 1 chamada no Portao_Uso, e, se as 3 tentativas falharem, SHALL registrar o Nicho como falho na Fonte_Google.
8. IF a Places API responde com status 400, 401 ou 403, THEN THE Fonte_Google SHALL não repetir a requisição, SHALL registrar o Nicho como falho na Fonte_Google e SHALL tratar o Google Places como indisponível com Motivo_Indisponibilidade `ERRO` no restante da Mineracao.
9. WHERE a opção "excluir redes" está marcada, WHEN o mesmo Nome_Normalizado aparece em 3 ou mais lugares distintos retornados pela Fonte_Google na mesma Mineracao, THE Minerador SHALL tratar esses lugares como Rede e descartá-los antes da análise.

### Requirement 4: Modo de fonte e fallback para o OpenStreetMap

**User Story:** Como membro de Negócios, quero escolher a fonte da mineração e ter o OpenStreetMap como reserva, para que a busca continue mesmo sem Google.

#### Acceptance Criteria

1. THE Tela_Minerar SHALL oferecer o campo "Fonte" com as opções "OpenStreetMap", "Google Places" e "Google + OpenStreetMap", pré-selecionando "Google + OpenStreetMap" quando o Google Places está disponível e "OpenStreetMap" quando não está.
2. WHILE o Google Places está indisponível, THE Tela_Minerar SHALL desabilitar as opções "Google Places" e "Google + OpenStreetMap" e exibir o motivo ("Google Places indisponível: chave não configurada" ou "Google Places indisponível: cota mensal esgotada").
3. WHEN uma Mineracao é criada, THE Minerador SHALL gravar o Modo_Fonte solicitado e, se o Modo_Fonte solicitado for `GOOGLE` ou `MISTA` e o Google Places estiver indisponível, SHALL gravar o Modo_Fonte `OSM` e o Motivo_Indisponibilidade do Google Places na Mineracao.
4. WHILE o Modo_Fonte da Mineracao é `MISTA`, THE Minerador SHALL consultar, para cada Nicho, a Fonte_Google e a Fonte_OSM e unir os resultados pelo Deduplicador (Requisito 5).
5. WHILE o Modo_Fonte da Mineracao é `GOOGLE`, THE Minerador SHALL consultar a Fonte_OSM somente para os Nichos registrados como falhos na Fonte_Google ou não consultados por indisponibilidade do Google Places.
6. WHEN o Google Places fica indisponível durante a descoberta de uma Mineracao (cota esgotada ou erro do critério 8 do Requisito 3), THE Minerador SHALL concluir os Nichos restantes pela Fonte_OSM e registrar na Mineracao o Motivo_Indisponibilidade e os Nichos afetados.
7. WHEN a descoberta termina, THE Minerador SHALL gravar a Fonte_Efetiva: `GOOGLE` se somente a Fonte_Google retornou resultados usados, `OSM` se somente a Fonte_OSM, e `MISTA` se ambas.
8. IF um Nicho fica falho tanto na Fonte_Google quanto na Fonte_OSM, THEN THE Minerador SHALL registrar o Nicho como falho na Mineracao, mantendo as regras da Etapa 1 (Requisito 2, critérios 11 e 13–17).
9. WHILE uma Mineracao tem Motivo_Indisponibilidade do Google Places registrado, THE Tela_Minerar e THE Tela_Mineracoes SHALL exibir junto dessa Mineracao o aviso "Google Places não usado: chave não configurada", "Google Places não usado: cota mensal esgotada" ou "Google Places falhou; Nichos concluídos pelo OpenStreetMap".
10. THE descoberta de uma Mineracao SHALL continuar retomável por Nicho dentro do limite de tempo por requisição da Etapa 1, incluindo as consultas à Fonte_Google.

### Requirement 5: Deduplicação entre fontes

**User Story:** Como membro de Negócios, quero que a mesma empresa vinda do Google e do OSM vire um único registro, para que eu não trabalhe duas vezes o mesmo lead.

#### Acceptance Criteria

1. WHEN um lugar é encontrado pela Fonte_Google, THE Deduplicador SHALL aplicar a mesma ordem da Etapa 1 (Requisito 9, critérios 1–3): Place_ID, `osmId`, CNPJ e, por fim, Nome_Normalizado com distância ≤ 100 metros, usando as coordenadas do lugar obtidas na própria Mineracao.
2. WHEN um lugar da Fonte_Google é considerado a mesma Empresa de um registro existente sem Place_ID, THE Minerador SHALL gravar o Place_ID na Empresa.
3. WHEN um lugar da Fonte_Google é considerado a mesma Empresa de um registro existente com Place_ID diferente, THE Minerador SHALL registrar o novo Place_ID como alias da Empresa com fonte `GOOGLE`, e THE Deduplicador SHALL considerar esses aliases como identificadores Place_ID.
4. WHEN uma Empresa passa a ter Place_ID e `osmId` (próprio ou alias), THE Minerador SHALL definir a fonte da Empresa como `MISTA`; uma Empresa só com Place_ID SHALL ter fonte `GOOGLE`.
5. WHEN um lugar da Fonte_Google corresponde a uma Empresa, THE Minerador SHALL gravar o Conteudo_Google somente no Cache_Google da Empresa (Requisito 6), sem sobrescrever os campos cadastrais da Empresa vindos do OSM, dos Dados_CNPJ ou de digitação manual.
6. FOR ALL resultados combinados das duas fontes, processar o mesmo resultado duas vezes SHALL produzir o mesmo conjunto de Empresas, aliases e Vinculos_Mineracao que processá-lo uma vez (idempotência).

### Requirement 6: Termos de uso do Google Places

**User Story:** Como Presidente, quero que o uso de dados do Google respeite os termos da Places API, para que a SciTec jr. não corra risco de suspensão da conta.

#### Acceptance Criteria

1. THE Minerador SHALL guardar indefinidamente, do Google, somente o Place_ID, e SHALL guardar o Conteudo_Google exclusivamente no Cache_Google, com data de obtenção e de expiração (obtenção + Validade_Cache_Google).
2. THE Minerador SHALL apagar o Conteudo_Google de todo Cache_Google expirado ao iniciar cada etapa de descoberta de Mineracao e ao abrir uma Ficha_Empresa ou a Tela_Ranking, e SHALL expor essa purga como função de servidor reutilizável para agendamento na Etapa 4.
3. THE Minerador SHALL omitir de toda resposta de API e de toda tela o Conteudo_Google de Cache_Google expirado, mesmo antes da purga.
4. WHILE a Ficha_Empresa, a Tela_Ranking ou o popup exibem Conteudo_Google, THE Minerador SHALL exibir a Atribuicao_Google no mesmo contêiner visual do conteúdo e SHALL distinguir visualmente o Conteudo_Google dos demais dados (borda, fundo ou espaçamento).
5. THE Mapa SHALL posicionar marcadores somente com coordenadas que não sejam Conteudo_Google; WHILE há Empresas filtradas sem coordenadas próprias que só têm coordenadas do Google, THE Mapa SHALL exibir o aviso "N empresas do Google Places não aparecem no mapa (termos do Google)".
6. THE Exportador_CSV SHALL não incluir Conteudo_Google; para Empresas com Place_ID, SHALL incluir a coluna "Link Google Maps" no formato `https://www.google.com/maps/place/?q=place_id:{Place_ID}`.
7. WHEN uma Empresa com Place_ID é enviada para triagem, THE Minerador SHALL preencher o contactInfo do Lead_de_Triagem somente com telefone e website que não sejam Conteudo_Google, acrescentando o "Link Google Maps" do critério 6, e SHALL preencher companyName com o Nome_Exibicao.
8. WHEN um Usuario_Negocios abre a Ficha_Empresa de uma Empresa com Place_ID cujo Cache_Google está ausente ou expirado e o Google Places está disponível, THE Minerador SHALL atualizar o Cache_Google por Place Details (New) com a mesma máscara de campos do Requisito 3, critério 2, reservando 1 chamada no Portao_Uso.
9. IF a atualização do critério 8 falha ou o Google Places está indisponível, THEN THE Ficha_Empresa SHALL exibir os demais dados da Empresa com o aviso "Dados do Google indisponíveis no momento".
10. IF a Place Details responde que o Place_ID não existe, THEN THE Minerador SHALL apagar o Cache_Google, manter o Place_ID e THE Ficha_Empresa SHALL exibir "Lugar não encontrado no Google".
11. THE Minerador SHALL usar como nome, endereço, coordenadas e demais campos cadastrais de exibição o valor do Cache_Google válido quando existir e, caso contrário, o valor próprio da Empresa; IF uma Empresa só do Google não tem Cache_Google válido nem Dados_CNPJ, THEN THE Minerador SHALL exibir como Nome_Exibicao o texto "Empresa do Google (dados expirados)".

### Requirement 7: Captura do HTML do site

**User Story:** Como responsável pela segurança, quero que a leitura do HTML dos sites use a mesma proteção da análise de site, para que a detecção de sinais não abra caminho para SSRF.

#### Acceptance Criteria

1. WHEN o Analisador_de_Site recebe a resposta final online de um site, THE Analisador_de_Site SHALL disponibilizar o Corpo_HTML para o Detector_Sinais e para a descoberta de CNPJ, sem nova requisição ao site.
2. THE captura do Corpo_HTML SHALL usar a mesma conexão validada pela Guarda_SSRF, o mesmo limite de 1.048.576 bytes, o mesmo timeout total de 10 segundos e as mesmas restrições de método e cabeçalhos da Etapa 1 (Requisito 4).
3. IF a resposta final não tem `Content-Type` HTML, está offline, ou foi bloqueada pela Guarda_SSRF, THEN THE Analisador_de_Site SHALL não disponibilizar Corpo_HTML, e o Detector_Sinais SHALL usar somente as tags OSM.
4. WHEN o Corpo_HTML é decodificado, THE Analisador_de_Site SHALL usar o charset do cabeçalho `Content-Type` ou da tag `<meta charset>` e, na falta ou em caso de charset desconhecido, UTF-8 com substituição de bytes inválidos.
5. THE Minerador SHALL descartar o Corpo_HTML ao fim da análise de cada Empresa, sem gravá-lo no banco de dados.
6. THE inclusão da captura do Corpo_HTML SHALL manter inalterados os resultados de status HTTP, HTTPS, SSL, latência e disponibilidade da Etapa 1 para a mesma resposta.

### Requirement 8: Detecção de Instagram e WhatsApp

**User Story:** Como membro de Negócios, quero saber se a empresa tem Instagram e WhatsApp, para que eu escolha o canal de abordagem.

#### Acceptance Criteria

1. WHEN o Corpo_HTML contém link para `instagram.com/{handle}` ou `www.instagram.com/{handle}`, THE Detector_Sinais SHALL registrar o handle em minúsculas, desconsiderando caminhos que não são perfis (`p`, `reel`, `reels`, `explore`, `accounts`, `stories`, `tv`, `share`) e parâmetros de query.
2. WHEN o Corpo_HTML contém link `wa.me/{número}`, `api.whatsapp.com/send?phone={número}`, `web.whatsapp.com/send?phone={número}` ou `whatsapp://send?phone={número}`, THE Detector_Sinais SHALL registrar o número somente com dígitos, acrescentando o código 55 quando o número tem 10 ou 11 dígitos.
3. IF o número de WhatsApp obtido tem menos de 12 ou mais de 13 dígitos após a normalização do critério 2, THEN THE Detector_Sinais SHALL descartá-lo.
4. WHEN o Corpo_HTML contém mais de um handle ou número válido, THE Detector_Sinais SHALL registrar o que aparece mais vezes e, em empate, o primeiro na ordem do documento.
5. WHEN a Empresa tem tag OSM `contact:instagram` ou `contact:whatsapp` e o Corpo_HTML não fornece o sinal correspondente, THE Detector_Sinais SHALL usar o valor da tag, normalizado pelas mesmas regras, com origem `OSM`.
6. THE Detector_Sinais SHALL ser uma função pura e SHALL produzir os mesmos Sinais_Digitais sempre que receber o mesmo Corpo_HTML e as mesmas tags.
7. FOR ALL handles e números válidos, inserir em um HTML um link gerado no formato do critério 1 ou 2 SHALL fazer o Detector_Sinais devolver o mesmo handle ou número normalizado (round-trip).
8. WHEN a análise de uma Empresa termina, THE Minerador SHALL gravar os Sinais_Digitais na Analise e SHALL atualizar no snapshot da Empresa os indicadores "tem Instagram" e "tem WhatsApp".

### Requirement 9: Detecção de tecnologias

**User Story:** Como membro de Negócios, quero saber com que tecnologia o site foi feito, para que eu argumente sobre migração, loja virtual ou analytics.

#### Acceptance Criteria

1. WHEN o Corpo_HTML contém ao menos um padrão de detecção de uma tecnologia do Catalogo_Tecnologias (em `<meta name="generator">`, URLs de `<script>`/`<link>`, identificadores de scripts inline ou atributos conhecidos), THE Detector_Sinais SHALL incluir essa tecnologia nos Sinais_Digitais.
2. THE Detector_Sinais SHALL listar cada tecnologia no máximo uma vez, ordenada por grupo e, dentro do grupo, pelo rótulo.
3. WHEN o Corpo_HTML não contém nenhum padrão do Catalogo_Tecnologias, THE Detector_Sinais SHALL devolver lista de tecnologias vazia.
4. FOR ALL Corpos_HTML, acrescentar ao documento um trecho que corresponda ao padrão de uma tecnologia SHALL fazer a lista resultante conter as tecnologias da lista original e mais essa tecnologia (monotonicidade).
5. WHEN a análise de uma Empresa termina, THE Minerador SHALL gravar a lista de tecnologias na Analise (`tecnologias`).

### Requirement 10: PageSpeed Insights

**User Story:** Como membro de Negócios, quero a nota de desempenho do site, para que eu mostre ao cliente um dado objetivo sobre a lentidão do site.

#### Acceptance Criteria

1. THE Tela_Minerar SHALL oferecer a opção "Analisar desempenho (PageSpeed)", marcada por padrão quando a PageSpeed Insights está disponível, e desmarcada e desabilitada com o aviso "PageSpeed indisponível: cota mensal esgotada" quando não está.
2. WHERE a Mineracao tem PageSpeed habilitado, WHEN o Analisador_de_Site registra o site de uma Empresa como online, THE Analisador_PageSpeed SHALL enviar uma requisição `runPagespeed` com a URL final da análise, estratégia `mobile` e as categorias desempenho, acessibilidade, boas práticas e SEO.
3. THE Analisador_PageSpeed SHALL enviar à PageSpeed Insights somente URLs finais aceitas pela Guarda_SSRF na análise do site.
4. WHEN a PageSpeed Insights responde com sucesso, THE Analisador_PageSpeed SHALL registrar o Resultado_PageSpeed com cada nota convertida para inteiro de 0 a 100 e cada métrica em milissegundos (CLS sem unidade, com 3 casas decimais).
5. IF a PageSpeed Insights responde com erro, não responde em até 30 segundos ou devolve resposta sem a nota de desempenho, THEN THE Analisador_PageSpeed SHALL retornar ausência de resultado com motivo (`ERRO`, `TIMEOUT` ou `RESPOSTA_INVALIDA`), e THE Pipeline SHALL continuar a análise da Empresa sem PageSpeed.
6. IF a PageSpeed Insights responde com status 429, THEN THE Analisador_PageSpeed SHALL retornar ausência de resultado com motivo `COTA_ESGOTADA`, sem repetir a requisição.
7. WHEN a análise de uma Empresa termina, THE Minerador SHALL gravar na Analise o Resultado_PageSpeed ou o motivo da ausência (incluindo `DESABILITADO_NA_MINERACAO` e "site offline").
8. THE Pipeline SHALL executar o PageSpeed de uma Empresa em paralelo com a descoberta de CNPJ e com a IA, de modo que cada Lote continue limitado a 60 segundos (Etapa 1, Requisito 8, critério 4).

### Requirement 11: Validação e descoberta de CNPJ

**User Story:** Como membro de Negócios, quero que o CNPJ da empresa seja encontrado no site ou digitado por mim, para que eu possa consultar os dados oficiais.

#### Acceptance Criteria

1. THE Validador_CNPJ SHALL aceitar um CNPJ somente se, após remover `.`, `/`, `-` e espaços e converter letras para maiúsculas, tiver 14 caracteres, os 12 primeiros em `0`–`9`/`A`–`Z`, os 2 últimos em `0`–`9`, não forem todos iguais e os dígitos verificadores calculados pelo módulo 11 (valor de cada caractere = código ASCII − 48) coincidirem com os 2 últimos.
2. FOR ALL CNPJs válidos, formatar e depois normalizar SHALL devolver o CNPJ original, e normalizar e depois formatar SHALL devolver a forma `AA.AAA.AAA/AAAA-DD` (round-trip).
3. WHEN o Corpo_HTML está disponível, THE Minerador SHALL procurar CNPJs no texto visível e nos atributos do Corpo_HTML, nas formas formatada e só com caracteres, aceitando somente os válidos pelo critério 1.
4. WHEN a busca do critério 3 encontra exatamente um CNPJ válido distinto e a Empresa não tem CNPJ, THE Minerador SHALL aplicá-lo à Empresa com Origem_CNPJ `SITE`, sujeito ao Requisito 12, critério 4.
5. WHEN a busca do critério 3 encontra dois ou mais CNPJs válidos distintos, THE Minerador SHALL registrá-los como CNPJ_Candidato, sem aplicar nenhum, e THE Ficha_Empresa SHALL permitir que um Usuario_Negocios escolha um deles.
6. WHEN um Usuario_Negocios digita ou escolhe um CNPJ na Ficha_Empresa, THE Minerador SHALL validá-lo pelo critério 1, aplicá-lo com Origem_CNPJ `MANUAL` e registrar no AuditLog o autor da sessão, a Empresa, o valor anterior e o novo.
7. IF o CNPJ digitado é inválido, THEN THE Minerador SHALL rejeitá-lo com status 400 e THE Ficha_Empresa SHALL exibir "CNPJ inválido", sem alterar a Empresa.
8. IF o CNPJ a aplicar já pertence a outra Empresa, THEN THE Minerador SHALL não aplicá-lo, SHALL registrá-lo como CNPJ_Candidato com a indicação de conflito, e THE Ficha_Empresa SHALL exibir "CNPJ já vinculado à empresa {Nome_Exibicao}" com link para a Ficha_Empresa da outra Empresa.
9. WHILE a Empresa já tem CNPJ com Origem_CNPJ `MANUAL`, THE Minerador SHALL manter esse CNPJ mesmo que a análise do site encontre outro, registrando o outro como CNPJ_Candidato.
10. WHEN um Usuario_Negocios remove o CNPJ de uma Empresa na Ficha_Empresa, THE Minerador SHALL apagar o CNPJ e os Dados_CNPJ da Empresa e registrar o AuditLog do critério 6.

### Requirement 12: Enriquecimento pela BrasilAPI

**User Story:** Como membro de Negócios, quero ver razão social, situação cadastral, CNAE e porte, para que eu qualifique o lead antes de ligar.

#### Acceptance Criteria

1. WHEN um CNPJ é aplicado a uma Empresa (Requisito 11, critérios 4 e 6) e os Dados_CNPJ estão ausentes, pertencem a outro CNPJ ou têm mais de 90 dias, THE Enriquecedor_CNPJ SHALL consultar a BrasilAPI e gravar os Dados_CNPJ na Empresa com a data da consulta.
2. THE Enriquecedor_CNPJ SHALL gravar somente os campos listados em Dados_CNPJ, descartando quadro de sócios, e-mail, telefone e demais campos da resposta.
3. IF a BrasilAPI responde 404, THEN THE Enriquecedor_CNPJ SHALL registrar "CNPJ não encontrado na Receita" e, quando a Origem_CNPJ é `SITE`, SHALL desfazer a aplicação do CNPJ e mantê-lo como CNPJ_Candidato.
4. WHEN o CNPJ tem Origem_CNPJ `SITE` e a UF dos Dados_CNPJ difere da UF da Empresa, THE Minerador SHALL desfazer a aplicação do CNPJ, mantê-lo como CNPJ_Candidato e THE Ficha_Empresa SHALL exibir "CNPJ do site é de outra UF (possível matriz ou franqueadora)".
5. IF a BrasilAPI responde 429 ou 5xx, ou não responde em até 8 segundos, THEN THE Enriquecedor_CNPJ SHALL repetir a consulta 1 vez após 2 segundos e, se falhar de novo, SHALL manter o CNPJ aplicado sem Dados_CNPJ e registrar "Consulta à Receita indisponível", sem interromper a Mineracao.
6. WHILE a situação cadastral dos Dados_CNPJ é diferente de "ATIVA", THE Ficha_Empresa e THE Tela_Ranking SHALL exibir junto da Empresa um alerta com a situação cadastral (ex.: "CNPJ BAIXADA").
7. THE Tela_Minerar SHALL oferecer a opção "Consultar CNPJ (BrasilAPI)", marcada por padrão; WHERE a opção está desmarcada, THE Pipeline SHALL ainda detectar CNPJs no Corpo_HTML, registrando-os como CNPJ_Candidato, sem consultar a BrasilAPI.
8. THE Analisador_IA e o Gerador_Abordagem SHALL receber dos Dados_CNPJ somente nome fantasia, CNAE principal, porte, situação cadastral e data de início de atividade, sem a razão social.

### Requirement 13: Classificação e pontuação com os novos dados

**User Story:** Como membro de Negócios, quero que o desempenho do site entre no score sem bagunçar o histórico, para que as análises antigas continuem comparáveis.

#### Acceptance Criteria

1. WHEN uma Analise é criada a partir desta etapa, THE Minerador SHALL gravar Versao_Score `2`; THE migração SHALL gravar Versao_Score `1` em todas as Analises existentes, sem alterar nenhum outro campo delas.
2. WHERE o Resultado_PageSpeed indica Desempenho_Ruim, THE Classificador SHALL tratar Desempenho_Ruim como condição (f) de "Otimização / Segurança", com um motivo que inclua a nota de desempenho, somando-se às condições (a) a (e) da Etapa 1 (Requisito 5, critério 2), com a lista de motivos passando a ter de 1 a 6 itens.
3. WHERE o Resultado_PageSpeed indica Desempenho_Ruim, THE Pontuador SHALL incluir o critério "Desempenho ruim no PageSpeed (nota N)" no componente de presença digital com os pontos da Configuracao_Minerador, mantendo o limite de 0 a 40 do componente.
4. FOR ALL entradas sem Resultado_PageSpeed, o Classificador e o Pontuador da Versao_Score `2` SHALL produzir a mesma Categoria, os mesmos motivos, o mesmo Score_Final, a mesma Prioridade e o mesmo detalhamento da Versao_Score `1` (compatibilidade).
5. FOR ALL entradas, acrescentar Desempenho_Ruim SHALL produzir Score_Final maior ou igual ao da mesma entrada sem Desempenho_Ruim (monotonicidade).
6. THE Pontuador SHALL manter as fórmulas de Score_Final, a reescala sem IA e os limites de Prioridade da Etapa 1 (Requisito 6, critérios 3–8).
7. THE Minerador SHALL exibir cada Analise com o detalhamento gravado nela, sem recalcular Analises de Versao_Score `1` com as regras da Versao_Score `2`.
8. THE Sinais_Digitais e os Dados_CNPJ SHALL não alterar a Categoria nem o Score_Final.

### Requirement 14: IA da análise com os novos dados

**User Story:** Como membro de Negócios, quero que a avaliação da IA considere redes sociais, tecnologias e CNPJ, para que a oportunidade descrita seja mais precisa.

#### Acceptance Criteria

1. WHERE a Mineracao tem IA habilitada, WHEN o Analisador_IA monta a requisição ao Gemini, THE Analisador_IA SHALL incluir, além dos dados da Etapa 1 (Requisito 7, critério 1), os Sinais_Digitais e os campos dos Dados_CNPJ do Requisito 12, critério 8, quando disponíveis.
2. THE Analisador_IA SHALL manter as regras de validação, timeout, cota e fallback da Etapa 1 (Requisito 7, critérios 2–4 e 6) após a inclusão dos novos dados.

### Requirement 15: Mensagem de abordagem

**User Story:** Como membro de Negócios, quero uma mensagem de primeiro contato pronta na ficha, para que eu aborde a empresa com argumentos do diagnóstico.

#### Acceptance Criteria

1. WHILE a Empresa tem ao menos uma Analise, THE Ficha_Empresa SHALL exibir a ação "Gerar mensagem de abordagem" com a escolha de canal "WhatsApp" ou "E-mail".
2. WHEN um Usuario_Negocios aciona "Gerar mensagem de abordagem" e a IA está disponível, THE Gerador_Abordagem SHALL reservar 1 chamada no Portao_Uso do provedor `gemini` e enviar ao Gemini uma única requisição com Nome_Exibicao, Nicho, bairro, cidade, Categoria e motivos da Analise mais recente, Resultado_PageSpeed, Sinais_Digitais, os campos de Dados_CNPJ do Requisito 12, critério 8, a oportunidade descrita pela IA quando existir, o canal e o primeiro nome do usuário da sessão.
3. WHEN o Gemini responde, THE Gerador_Abordagem SHALL aceitar a resposta somente se o texto (e, para `EMAIL`, o assunto) for não vazio, estiver dentro dos limites do Requisito 1, critério 8 e não contiver marcadores de modelo não substituídos (`{{`, `}}`, `[` seguido de texto em maiúsculas e `]`).
4. IF a IA está indisponível (sem chave ou cota esgotada), o Gemini retorna erro, não responde em até 20 segundos ou a resposta viola o critério 3, THEN THE Gerador_Abordagem SHALL gerar a Mensagem_Abordagem com o modelo fixo da Categoria da Analise mais recente, com origem `MODELO`, e THE Ficha_Empresa SHALL indicar "Mensagem gerada pelo modelo padrão" e o motivo.
5. THE modelo fixo da Mensagem_Abordagem SHALL existir para cada Categoria e canal, usar apenas dados da Empresa e da Analise, e respeitar os limites do Requisito 1, critério 8.
6. WHEN a Mensagem_Abordagem é gerada, THE Minerador SHALL gravá-la com Empresa, Analise base, canal, origem, texto, assunto (quando `EMAIL`), autor da sessão e data, e THE Ficha_Empresa SHALL exibi-la com a ação "Copiar".
7. WHILE a Empresa tem número de WhatsApp nos Sinais_Digitais e a Mensagem_Abordagem tem canal `WHATSAPP`, THE Ficha_Empresa SHALL exibir o link "Abrir no WhatsApp" para `https://wa.me/{número}?text={texto codificado}`, sem enviar a mensagem pelo sistema.
8. THE Ficha_Empresa SHALL listar as Mensagens_Abordagem da Empresa da mais recente para a mais antiga, cada uma com canal, origem, autor e data (DD/MM/AAAA HH:mm).
9. WHILE uma geração está em curso para a Ficha_Empresa aberta, THE Ficha_Empresa SHALL desabilitar a ação "Gerar mensagem de abordagem", de modo que cliques repetidos criem no máximo uma Mensagem_Abordagem.
10. THE Gerador_Abordagem SHALL enviar ao Gemini somente dados da Empresa, da Analise e o primeiro nome do usuário da sessão, sem e-mail de usuários, dados de outros usuários ou razão social.

### Requirement 16: Reanálise de empresa

**User Story:** Como membro de Negócios, quero reanalisar uma empresa já minerada, para que empresas da base antiga ganhem PageSpeed, sinais e CNPJ sem uma nova mineração.

#### Acceptance Criteria

1. THE Ficha_Empresa SHALL exibir a ação "Reanalisar" para Usuario_Negocios.
2. WHEN um Usuario_Negocios aciona "Reanalisar", THE Minerador SHALL criar uma nova Analise sem Mineracao, com análise de site, Sinais_Digitais, PageSpeed (se disponível), descoberta e enriquecimento de CNPJ e IA (se disponível), atualizar o snapshot da Empresa e responder em até 60 segundos.
3. IF a Empresa tem Place_ID e o Cache_Google está ausente ou expirado, THEN THE Minerador SHALL atualizar o Cache_Google (Requisito 6, critério 8) antes da Reanalise e, se não conseguir e a Empresa não tiver website próprio, SHALL fazer a Reanalise como Empresa sem website informado e indicar isso na Ficha_Empresa.
4. IF a Analise mais recente da Empresa foi criada há menos de 10 minutos, THEN THE Minerador SHALL recusar a Reanalise com status 409 e THE Ficha_Empresa SHALL exibir "Empresa analisada há menos de 10 minutos".
5. IF duas Reanalises da mesma Empresa são solicitadas ao mesmo tempo, THEN THE Minerador SHALL executar no máximo uma e recusar as demais com status 409.
6. IF a Reanalise falha, THEN THE Minerador SHALL manter a Analise e o snapshot anteriores (Etapa 1, Requisito 9, critério 8) e THE Ficha_Empresa SHALL exibir mensagem de erro indicando que a reanálise não foi concluída.
7. WHILE a Reanalise está em curso, THE Ficha_Empresa SHALL desabilitar "Reanalisar" e exibir um indicador de progresso.

### Requirement 17: Ficha da empresa

**User Story:** Como membro de Negócios, quero ver os novos dados organizados na ficha, para que eu prepare a abordagem em um só lugar.

#### Acceptance Criteria

1. WHEN a Ficha_Empresa é aberta, THE Ficha_Empresa SHALL exibir a seção "Presença digital" com Instagram (link para o perfil), WhatsApp (número formatado), tecnologias agrupadas por grupo e a origem de cada sinal, indicando "não encontrado" para sinais ausentes.
2. WHEN a Analise mais recente tem Resultado_PageSpeed, THE Ficha_Empresa SHALL exibir as quatro notas com rótulo em texto e faixa ("Bom" ≥ 90, "Precisa melhorar" 50–89, "Ruim" < 50) e as métricas LCP, CLS, TBT e FCP; caso contrário, SHALL exibir o motivo da ausência.
3. THE Ficha_Empresa SHALL exibir a seção "CNPJ" com o CNPJ formatado, a Origem_CNPJ, os Dados_CNPJ e a data da consulta, os CNPJ_Candidato com ação de escolha, e as ações "Informar CNPJ", "Alterar" e "Remover".
4. THE Ficha_Empresa SHALL exibir a Versao_Score de cada Analise no histórico e, para Versao_Score `1`, a indicação "regras da Etapa 1".
5. WHILE a Empresa tem Place_ID, THE Ficha_Empresa SHALL exibir o link "Ver no Google Maps" e a Atribuicao_Google junto do Conteudo_Google; WHILE a Empresa tem `osmId`, SHALL exibir a Atribuicao_ODbL.
6. THE seções novas da Ficha_Empresa SHALL seguir o estilo visual e as regras de acessibilidade da Etapa 1 (Requisito 19, critérios 5–7), com notas e faixas sempre acompanhadas de texto.

### Requirement 18: Ranking, histórico e exportação

**User Story:** Como membro de Negócios, quero filtrar e exportar pelos novos dados, para que eu monte listas por canal ou situação cadastral.

#### Acceptance Criteria

1. THE Tela_Ranking SHALL oferecer, além dos filtros da Etapa 1, os filtros "tem Instagram", "tem WhatsApp", "tem CNPJ", "situação cadastral" e "desempenho ruim no PageSpeed", combinados com E lógico.
2. THE Tela_Ranking SHALL ordenar e buscar pelo Nome_Exibicao, mantendo a ordenação por Score_Final decrescente e as demais regras da Etapa 1 (Requisito 12, critérios 1 e 3), com buscas textuais em `mode: 'insensitive'`.
3. THE Tela_Mineracoes SHALL exibir, por Mineracao, o Modo_Fonte solicitado e a Fonte_Efetiva, e o filtro de fonte SHALL usar a Fonte_Efetiva.
4. THE Exportador_CSV SHALL acrescentar, após as colunas da Etapa 1 (Requisito 17, critério 2) e nesta ordem, as colunas CNPJ (formatado), Situação cadastral, Instagram, WhatsApp, Desempenho PageSpeed, Fonte e Link Google Maps, com célula vazia quando não houver valor.
5. FOR ALL conjuntos de Empresas com as novas colunas, o round-trip da Etapa 1 (Requisito 17, critério 6) SHALL continuar valendo.

### Requirement 19: Modelo de dados

**User Story:** Como desenvolvedor, quero as novas informações em migração versionada, para que o banco evolua sem perder dados das etapas anteriores.

#### Acceptance Criteria

1. THE modelo de dados SHALL incluir, por migração versionada do Prisma: Cache_Google por Empresa; Dados_CNPJ, Origem_CNPJ e CNPJ_Candidato por Empresa; Sinais_Digitais, Resultado_PageSpeed (ou motivo) e Versao_Score por Analise; indicadores "tem Instagram", "tem WhatsApp" e situação cadastral no snapshot da Empresa; Modo_Fonte solicitado, opções de PageSpeed e CNPJ e Motivos_Indisponibilidade por Mineracao; e a tabela de Mensagens_Abordagem.
2. THE migração SHALL preservar todas as Empresas, Analises, Mineracoes, aliases, Leads_de_Triagem e índices existentes e SHALL deixar os novos campos vazios nos registros antigos, exceto Versao_Score `1` (Requisito 13, critério 1).
3. THE Uso_API SHALL aceitar os provedores `gemini`, `places` e `pagespeed` na mesma tabela, com contagem atômica por provedor e mês.

### Requirement 20: Permissões e segurança

**User Story:** Como Presidente, quero que os novos recursos sigam a matriz de permissões no servidor, para que só Negócios e a Presidência os usem.

#### Acceptance Criteria

1. THE Minerador SHALL proteger toda rota nova desta etapa (CNPJ, Reanalise, Mensagem_Abordagem, atualização do Cache_Google, estado dos serviços) com `withAuth` e `canUseNegociosTools` de `lib/permissions.ts`, avaliados no servidor antes de qualquer leitura, escrita ou chamada a Servico_Externo.
2. IF a requisição não tem sessão válida, THEN THE Minerador SHALL responder 401; IF o usuário não satisfaz `canUseNegociosTools`, THEN THE Minerador SHALL responder 403; nos dois casos sem retornar dados, sem chamar Servico_Externo, sem reservar cota e sem alterar registros.
3. THE Minerador SHALL obter o autor de Reanalises, Mensagens_Abordagem e alterações de CNPJ exclusivamente da sessão, ignorando identificadores de usuário enviados pelo cliente.
4. THE Fonte_Google, o Analisador_PageSpeed e o Enriquecedor_CNPJ SHALL acessar somente os hosts fixos `places.googleapis.com`, `www.googleapis.com` e `brasilapi.com.br` por HTTPS, sem montar o host a partir de dados externos, e SHALL codificar CNPJ, Place_ID e URLs como parâmetros.
5. WHEN uma rota desta etapa recebe parâmetros, THE Minerador SHALL validá-los no servidor (CNPJ pelo Validador_CNPJ, canal em `WHATSAPP`/`EMAIL`, Modo_Fonte em `OSM`/`GOOGLE`/`MISTA`, opções booleanas) e responder 400 com o parâmetro inválido, sem efeitos colaterais.
6. THE Minerador SHALL exibir em português todos os rótulos, avisos, erros e toasts novos, usar ícones `lucide-react` e toasts `sonner`.

### Requirement 21: Qualidade da entrega

**User Story:** Como desenvolvedor, quero testes offline de todas as integrações e regras novas, para que a etapa seja entregue sem regressões.

#### Acceptance Criteria

1. THE Minerador SHALL isolar Places API, PageSpeed Insights API, BrasilAPI, Gemini, resolução DNS e sites externos por interfaces substituíveis, de modo que todos os testes automatizados executem sem rede e sem nenhuma das chaves configuradas.
2. THE Minerador SHALL incluir testes automatizados, com implementações falsas dos Servicos_Externos, que cubram no mínimo: fallback por Nicho do Google para o OSM (sem chave, cota esgotada, 429/5xx, 401/403); Fonte_Efetiva `GOOGLE`, `OSM` e `MISTA`; paginação limitada a 3 páginas; descarte de `CLOSED_PERMANENTLY`; heurística de Rede do Requisito 3, critério 9; e reserva de cota por requisição, inclusive nas retentativas.
3. THE Minerador SHALL incluir testes automatizados do Cache_Google cobrindo expiração em 30 dias (29 dias válido, 30 dias completos expirado), omissão de conteúdo expirado nas respostas, purga, exclusão do Mapa e do CSV e atualização pela Place Details.
4. THE Minerador SHALL incluir testes automatizados do Validador_CNPJ cobrindo CNPJs numéricos e alfanuméricos válidos, dígito verificador errado, caracteres inválidos, todos iguais e o round-trip do Requisito 11, critério 2; e da descoberta de CNPJ com zero, um e vários CNPJs no HTML, conflito com outra Empresa, 404, UF divergente e falha da BrasilAPI.
5. THE Minerador SHALL incluir testes automatizados do Detector_Sinais cobrindo cada formato de link do Requisito 8, critérios 1 e 2, os caminhos excluídos do Instagram, números fora do tamanho, desempate, fallback para tags OSM, o round-trip do Requisito 8, critério 7, cada tecnologia do Catalogo_Tecnologias e a monotonicidade do Requisito 9, critério 4.
6. THE Minerador SHALL incluir testes automatizados do Analisador_PageSpeed (sucesso, erro, timeout, 429, resposta sem nota) e da classificação e pontuação da Versao_Score `2`, incluindo as propriedades de compatibilidade e monotonicidade do Requisito 13, critérios 4 e 5.
7. THE Minerador SHALL incluir testes automatizados do Gerador_Abordagem cobrindo resposta válida da IA, cada motivo de fallback para o modelo fixo, limites de tamanho por canal, marcadores não substituídos e ausência de razão social e e-mail nos dados enviados.
8. THE Minerador SHALL incluir testes automatizados que confirmem que a captura do Corpo_HTML passa pela Guarda_SSRF e não altera os resultados da Etapa 1 para a mesma resposta (Requisito 7, critérios 2 e 6).
9. WHEN a etapa é entregue, THE projeto SHALL concluir `npm run build` sem erros e `npm test` com zero falhas, e os testes de integração com Postgres (`RUN_DB_TESTS=1`) SHALL cobrir a migração, o Portao_Uso dos provedores `places` e `pagespeed`, a unicidade de CNPJ e a concorrência da Reanalise.
10. IF qualquer teste automatizado falha ou tenta acesso real à rede, THEN THE etapa SHALL ser considerada não entregue.
11. WHEN a etapa é entregue, THE seção 8 do plano mestre SHALL registrar a Etapa 3 como concluída e SHALL incluir a subseção 8.4 com as decisões confirmadas e os pontos operacionais (variáveis de ambiente, cotas, termos do Google, limitações conhecidas).
12. THE implementação SHALL ser feita na branch `etapa-3-melhorias`, criada a partir de `etapa-2-paineis`, com commits enviados ao remoto; a PR para `main` SHALL ser aberta manualmente pelo usuário, pois o `gh` não está instalado.

## Decisões (confirmadas)

Escolhas feitas onde o plano é ambíguo. Todas foram revisadas e confirmadas pelo Presidente como estão escritas abaixo (incluindo os itens antes marcados "a confirmar": cache de 30 dias com só o Place_ID permanente; Nome_Exibicao e link do Google Maps na triagem, sem telefone/website do Google; `PLACES_MONTHLY_LIMIT = 1000`; 7 pontos para Desempenho_Ruim, único sinal novo que afeta o score; CNPJ alfanumérico aplicado mesmo sem resposta da BrasilAPI; razão social guardada e nunca enviada ao Gemini).

1. **Google complementa o OSM, não substitui.** Três modos por mineração: `OSM`, `GOOGLE` (Google com fallback por Nicho para o OSM) e `MISTA` (as duas fontes em todos os Nichos). Padrão: `MISTA` quando o Google está disponível. A geocodificação da área continua no Nominatim.
2. **Termos do Google levados ao pé da letra.** A política da Places API só permite guardar o Place_ID indefinidamente e proíbe armazenar o restante do conteúdo fora das exceções ([Policies and attributions for Places API](https://developers.google.com/maps/documentation/places/web-service/policies)); os termos específicos permitem cache temporário de coordenadas por até 30 dias ([Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)). Decisão: todo Conteudo_Google fica num Cache_Google de 30 dias (mesmo prazo das coordenadas, como já previsto na seção 5 do plano), com purga e reatualização ao abrir a ficha. **A confirmar:** se o Presidente prefere um prazo menor para nome/telefone/endereço (a leitura mais restritiva não permite nem o cache de 30 dias para esses campos).
3. **Sem dados do Google no mapa Leaflet.** A política exige que resultados da Places API em mapa sejam exibidos num Google Map. Empresas só do Google ficam fora do Mapa, com aviso.
4. **CSV e triagem sem Conteudo_Google.** O CSV leva só o link do Google Maps (montado pelo Place_ID). O envio para triagem copia o Nome_Exibicao e o link do Google Maps, mas não telefone/website do Google. **A confirmar:** copiar o nome do Google para o `ProspectLead` ainda é armazenamento de conteúdo; alternativa é exigir CNPJ ou dado do OSM antes de enviar empresas só do Google.
5. **Redes no Google por heurística.** O Google não tem tag `brand`; com "excluir redes", o mesmo Nome_Normalizado em 3 ou mais lugares da mesma mineração vira Rede.
6. **Cota e custo do Places.** Cada página da Text Search e cada Place Details conta 1 no `ApiUsage` (`places`). Com website e telefone na máscara de campos, a requisição cai no SKU Enterprise ([Places API Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)). Padrão `PLACES_MONTHLY_LIMIT = 1000`, alinhado à franquia mensal gratuita do Enterprise. **A confirmar** o valor, que deve casar com o alerta de orçamento da Etapa 4.
7. **PageSpeed dentro da mineração**, opcional por mineração (marcado por padrão), só para sites online, estratégia `mobile`, timeout de 30 s, em paralelo com CNPJ e IA para caber no Lote de 60 s. Sem chave funciona com cota reduzida ([Get Started with the PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started)). Padrão `PAGESPEED_MONTHLY_LIMIT = 5000`. A IA da análise **não** recebe o PageSpeed, pois rodam em paralelo; a mensagem de abordagem recebe.
8. **Score com versão, sem recalcular o passado.** Só o PageSpeed afeta Categoria e score: Desempenho_Ruim (nota < 50) vira condição (f) de "Otimização / Segurança" e um critério do componente digital (ainda limitado a 40). Instagram, WhatsApp, tecnologias e CNPJ são informativos e entram só na IA e na mensagem. As Analises antigas ficam como `Versao_Score = 1`, exibidas como estão. **A confirmar** os pontos do critério (sugestão: 7, igual ao "lento").
9. **Descoberta de CNPJ:** HTML do site (um único CNPJ válido é aplicado automaticamente; vários viram candidatos) e digitação manual na Ficha. CNPJ do site com UF diferente da empresa não é aplicado (pode ser matriz ou franqueadora). CNPJ já usado por outra Empresa vira conflito sinalizado, sem mesclagem automática.
10. **CNPJ alfanumérico.** O validador já aceita o formato alfanumérico vigente desde julho de 2026. **A confirmar:** se a BrasilAPI já responde para CNPJs alfanuméricos; se não, eles ficam aplicados sem Dados_CNPJ.
11. **LGPD (minimização).** Dos dados da Receita não são guardados QSA, e-mail nem telefone. A razão social é guardada, mas não vai para o Gemini, porque no MEI ela costuma conter o nome da pessoa física. **A confirmar** se a razão social deve ser guardada.
12. **Mensagem de abordagem sob demanda na Ficha**, não durante a mineração, para economizar a cota do Gemini (mesmo `GEMINI_MONTHLY_LIMIT`). Canais WhatsApp e E-mail, com histórico gravado e modelo fixo por Categoria quando a IA não está disponível. Envio sempre manual, com link `wa.me` opcional.
13. **Reanálise só individual na Ficha**, com intervalo mínimo de 10 minutos por empresa. Sem backfill automático da base antiga e sem reanálise em lote nesta etapa.
14. **HTML lido na mesma requisição da análise de site.** O transporte atual (`lib/leads/net/http-transport.ts`) só conta os bytes do corpo; ele passa a devolver o Corpo_HTML (até 1 MB), sem nova requisição e sem gravar o HTML no banco.
15. **BrasilAPI sem cota mensal**, só com limite de 1 req/s por processo, 1 retentativa e cache de 90 dias. Com mais de uma instância vale a mesma limitação conhecida do Nominatim (seção 8.2 do plano).

*Fontes: documentação oficial do Google citada nos itens 2, 3, 6 e 7. O conteúdo foi parafraseado por conformidade com restrições de licenciamento.*
