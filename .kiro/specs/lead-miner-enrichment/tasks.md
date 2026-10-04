# Implementation Plan: Melhorias do Minerador de Leads (Etapa 3)

## Overview

Implementação incremental em TypeScript (Next.js 14 App Router + Prisma/Postgres) seguindo o `design.md`. Ordem: branch e infraestrutura de testes sem rede → config, tipos e schema → módulos puros (CNPJ, sinais, exibição, score v2) → adaptadores injetáveis (HTML, Google Places, PageSpeed, BrasilAPI, Gemini, `deps.ts`) → deduplicação, cache e repositório → análise, pipeline e reanálise → rotas → telas → registro no plano mestre e push. Cada passo termina integrado ao anterior; nada fica órfão.

Convenções:
- Testes em `tests/lead-miner-enrichment/`; suporte em `tests/lead-miner-enrichment/support/` (um arquivo por área), reutilizando `tests/lead-miner/support/*`.
- Cada propriedade do design em arquivo próprio `{modulo}.p{N}.property.test.ts`, com `fc.assert(..., { numRuns: 100 })` (no mínimo) e o comentário `// Feature: lead-miner-enrichment, Property {N}: {título}`.
- Testes de componentes com `// @vitest-environment jsdom`; integração com Postgres em `tests/lead-miner-enrichment/integration/`, pulada sem `RUN_DB_TESTS=1`.
- Toda rota nova: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `withAuth` + `requireNegocios(actor)` como primeira instrução; autor sempre `actor.id`; buscas textuais com `mode: 'insensitive'`.
- Textos de interface em português, ícones `lucide-react`, toasts `sonner`, estilo `bg-slate-950` / `rounded-2xl border-slate-800` / `from-purple-600 to-indigo-600`.

## Tasks

- [x] 1. Branch e infraestrutura de testes sem rede
  - [x] 1.1 Criar a branch `etapa-3-melhorias` a partir de `etapa-2-paineis`
    - `git switch etapa-2-paineis && git switch -c etapa-3-melhorias`; as alterações não commitadas em `.kiro/specs/**` acompanham a troca de branch (não usar `stash`/`reset`)
    - Conferir com `git status` que nada além de `.kiro/specs/**` está pendente
    - _Requirements: 21.12_
  - [x] 1.2 Estender o bloqueio de rede e criar os fakes dos serviços externos
    - `tests/setup/no-network.ts`: remover também `GOOGLE_PLACES_API_KEY`, `PAGESPEED_API_KEY`, `PLACES_MONTHLY_LIMIT` e `PAGESPEED_MONTHLY_LIMIT` de `process.env`
    - Criar em `tests/lead-miner-enrichment/support/`: `fake-usage.ts` (`memoryUsageGate` com `reserve`/`count` por provedor e mês), `fake-fetch.ts` (fetch programável por roteiro que registra URL, cabeçalhos e corpo), `fake-places.ts`, `fake-pagespeed.ts`, `fake-brasilapi.ts`, `fake-gemini.ts` (clientes falsos por roteiro: status, JSON, atraso, erro), `fake-transport-body.ts` (transporte falso com `contentType`/`body`)
    - _Requirements: 21.1, 21.10_
  - [x] 1.3 Atualizar o teste de sanidade do bloqueio de rede
    - `tests/setup/no-network.test.ts`: as quatro variáveis novas ausentes; `fetch`, `dns.promises.lookup` e `net.connect` continuam lançando
    - _Requirements: 21.1, 21.10_

- [x] 2. Configuração, tipos e variáveis de ambiente
  - [x] 2.1 Estender `lib/leads/config.ts` e `lib/leads/types.ts`
    - `config.ts`: `GOOGLE_QUERIES` (22 Nichos, texto em português e `includedType` opcional), `monthlyLimit`/`placesMonthlyLimit`/`pagespeedMonthlyLimit` (e `geminiMonthlyLimit` delegando), timeouts, `GOOGLE_MAX_PAGES`, `GOOGLE_PAGE_SIZE`, `GOOGLE_CACHE_DAYS`, `CNPJ_DATA_DAYS`, `PAGESPEED_POOR_THRESHOLD`, `DIGITAL_POINTS_V2.desempenhoRuim = 7`, `REANALYSIS_*`, `APPROACH_LIMITS`, `GOOGLE_ATTRIBUTION_TEXT`, `GOOGLE_EXPIRED_NAME`, `TECH_GROUP_*`, `TECH_CATALOG` (as 15 tecnologias do Req. 1.7 com padrões do design)
    - `types.ts`: `ExternalProvider`, `UnavailableReason`, `SourceMode`, `GooglePlace`, `instagramOsm`/`whatsappOsm` em `FoundCompany`, `SinaisDigitais`, `TechHit`, `PageSpeedResult`/`PageSpeedOutcome`, `CnpjOrigin`, `CnpjData`, `CnpjCandidate`, `ScoreBreakdown.versao?`; comentário de `ClassificationResult` para 1–6 motivos
    - Manter os dois arquivos isomórficos (sem imports de Node/Prisma/`server-only`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
  - [x]* 2.2 Escrever teste de propriedade dos limites mensais
    - **Property 1: Limites mensais lidos do ambiente**
    - **Validates: Requirements 1.2**
  - [x]* 2.3 Escrever testes de exemplo do config
    - `config-enrichment.test.ts`: 22 textos de busca não vazios para exatamente os ids de `NICHES`; catálogo com as 15 tecnologias, ids únicos, rótulos não vazios, grupos válidos, regex compilando; limites/timeouts; isomorfia (leitura do arquivo sem imports proibidos)
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
  - [x] 2.4 Documentar as variáveis novas em `.env.example`
    - `GOOGLE_PLACES_API_KEY` (vazia = mineração só com OpenStreetMap), `PLACES_MONTHLY_LIMIT` (padrão 1000), `PAGESPEED_API_KEY` (vazia = cota reduzida do Google), `PAGESPEED_MONTHLY_LIMIT` (padrão 5000), indicando que são lidas só no servidor e enviadas no cabeçalho `X-Goog-Api-Key`
    - _Requirements: 2.9, 2.8_

- [x] 3. Modelo de dados e migração
  - [x] 3.1 Atualizar `prisma/schema.prisma`
    - Enums `CnpjOrigin`, `ApproachChannel`, `ApproachOrigin`; colunas novas de `Company` (incluindo `nomeExibicao`, Dados_CNPJ, `cnpjCandidatos`, snapshots `temInstagram`/`temWhatsapp`/`desempenhoRuim`/`situacaoCadastral`, `reanaliseAte`, `instagramOsm`/`whatsappOsm`) e índices; modelo `GooglePlaceCache`; `CompanyAnalysis.versaoScore @default(2)`, `sinais`, `pagespeedMotivo`, `cnpjEncontrados`; colunas novas de `MiningRun`; `MiningRunCompany.origem`; modelo `ApproachMessage` e relação em `User`; comentário de `ApiUsage.provider`
    - _Requirements: 19.1, 19.3, 13.1_
  - [x] 3.2 Gerar e revisar `prisma/migrations/20261015000000_lead_miner_enrichment/migration.sql`
    - `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`; remover qualquer `DROP INDEX` dos índices parciais das etapas anteriores
    - Acrescentar `UPDATE "CompanyAnalysis" SET "versaoScore" = 1;` logo após o `ADD COLUMN` e `UPDATE "Company" SET "nomeExibicao" = nome;`
    - `npx prisma generate` e `npx tsc --noEmit` sem erros
    - _Requirements: 19.1, 19.2, 13.1_
  - [x] 3.3 Escrever teste de integração da migração
    - `integration/migration.int.test.ts` (`RUN_DB_TESTS=1`): banco com dados no formato da Etapa 2 → `prisma migrate deploy` → contagens preservadas, `versaoScore = 1` em todas as Analises antigas, demais campos inalterados, índices parciais presentes em `pg_indexes`, colunas novas vazias
    - _Requirements: 19.2, 13.1, 21.9_

- [x] 4. Validador_CNPJ e Detector_Sinais (módulos puros)
  - [x] 4.1 Implementar `lib/leads/cnpj.ts`
    - `normalizeCnpj`, `cnpjCheckDigits` (valor = ASCII − 48, pesos 2–9, resto < 2 → 0), `isValidCnpj`, `formatCnpj`, `extractCnpjs` (texto visível + atributos via `htmlSearchText` de `html.ts`, tarefa 4.7), `planCnpj`, `resolveSiteCnpj`, `mergeCandidates`, `serializeCandidates`/`parseCandidates`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.9, 12.3, 12.4, 12.7_
  - [x] 4.2 Escrever testes de exemplo do Validador_CNPJ
    - `cnpj.test.ts`: CNPJs numéricos e alfanuméricos válidos conhecidos (incluindo o exemplo oficial da Receita), DV errado, caracteres inválidos, tamanho errado, todos iguais, formatação; HTML com zero, um e vários CNPJs
    - _Requirements: 11.1, 11.2, 11.3, 21.4_
  - [x]* 4.3 Escrever teste de propriedade do validador
    - **Property 28: Validador_CNPJ segue o modelo de referência**
    - **Validates: Requirements 11.1**
  - [x] 4.4 Escrever teste de propriedade do round-trip de formatação
    - **Property 29: Round-trip de formatação do CNPJ**
    - **Validates: Requirements 11.2**
  - [x]* 4.5 Escrever teste de propriedade da extração de CNPJs
    - **Property 30: Extração de CNPJs do HTML**
    - **Validates: Requirements 11.3**
  - [x]* 4.6 Escrever teste de propriedade do plano e resolução do CNPJ
    - **Property 31: Plano e resolução do CNPJ**
    - **Validates: Requirements 11.4, 11.5, 11.9, 12.3, 12.4, 12.7**
  - [x] 4.7 Implementar `lib/leads/html.ts`
    - `isHtmlContentType`, `decodeHtml` (charset do cabeçalho → `<meta charset>`/`http-equiv` nos primeiros 2 KiB → UTF-8; `TextDecoder` com `fatal: false`; charset desconhecido cai para UTF-8), `htmlSearchText`, `extractLinks`, `extractAssets`
    - _Requirements: 7.3, 7.4, 11.3_
  - [x]* 4.8 Escrever teste de propriedade da decodificação
    - **Property 19: Decodificação por charset**
    - **Validates: Requirements 7.4**
  - [x] 4.9 Implementar `lib/leads/signals.ts`
    - `normalizeInstagram`, `normalizeWhatsapp`, `findInstagramHandles`, `findWhatsappNumbers`, `pickMostFrequent`, `detectTechnologies`, `detectSignals`, `instagramLink`/`whatsappLink`, `serializeSinais`/`parseSinais`; sem estado global, relógio ou aleatoriedade
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3_
  - [x] 4.10 Escrever testes de exemplo do Detector_Sinais
    - `signals.test.ts`: cada formato de link do Instagram e do WhatsApp, cada caminho reservado, query/fragmento, números com 9–14 dígitos, desempate, fallback para tags OSM e um exemplo positivo por tecnologia do `TECH_CATALOG`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 21.5_
  - [x] 4.11 Escrever teste de propriedade do round-trip de Instagram e WhatsApp
    - **Property 20: Round-trip de Instagram e WhatsApp**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.7**
  - [x]* 4.12 Escrever teste de propriedade da escolha do sinal
    - **Property 21: Escolha do sinal, fallback OSM e determinismo**
    - **Validates: Requirements 8.4, 8.5, 8.6**
  - [x]* 4.13 Escrever teste de propriedade da serialização de sinais e candidatos
    - **Property 22: Round-trip da gravação de sinais, tecnologias e candidatos**
    - **Validates: Requirements 8.8, 9.5, 11.5**
  - [x]* 4.14 Escrever teste de propriedade da lista de tecnologias
    - **Property 23: Lista de tecnologias normalizada**
    - **Validates: Requirements 9.2, 9.3**
  - [x] 4.15 Escrever teste de propriedade da monotonicidade das tecnologias
    - **Property 24: Monotonicidade das tecnologias**
    - **Validates: Requirements 9.1, 9.4**

- [x] 5. Exibição e score com Versao_Score 2 (módulos puros)
  - [x] 5.1 Implementar `lib/leads/display.ts`
    - `isCacheValid` (reexportado para `google-cache.ts`), `displayName`, `sortName`, `displayCompany` (com `googleFields`, `coordsFromGoogle`), `ownFields`, `googleMapsLink`, `googleOnlyCoords` (conta Empresas sem coordenadas próprias com coordenadas no cache válido), `parsePageSpeedJson`
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.11_
  - [x] 5.2 Escrever teste de propriedade da exibição sem conteúdo expirado
    - **Property 16: Conteúdo do Google expirado nunca é exibido**
    - **Validates: Requirements 6.3, 6.4, 6.11**
  - [x] 5.3 Estender `classifier.ts` e `scorer.ts` para a Versao_Score 2
    - `classify(a, { pagespeed })` com a condição (f); `ScoreInput.pagespeed`, critério `desempenhoRuim` após `lento` com limite 40; `SCORE_VERSION`, `isPoorPerformance`, `versao: 2` no detalhamento
    - Criar `tests/lead-miner-enrichment/support/scorer-v1-model.ts` com cópia literal de `classify`/`score` da Etapa 1 (antes da alteração)
    - _Requirements: 13.2, 13.3, 13.6, 13.8_
  - [x] 5.4 Escrever testes de exemplo do score v2
    - `scorer-v2.test.ts`: nota 49 vs 50; BI que vira "Otimização / Segurança" só por desempenho; 6 motivos; componente digital saturado em 40; `versao: 2`
    - _Requirements: 13.2, 13.3, 13.6, 21.6_
  - [x]* 5.5 Escrever teste de propriedade do Desempenho_Ruim
    - **Property 35: Desempenho_Ruim na classificação e no componente digital**
    - **Validates: Requirements 13.2, 13.3**
  - [x] 5.6 Escrever teste de propriedade da compatibilidade v2 ≡ v1
    - **Property 36: Versao_Score 2 sem PageSpeed equivale à Versao_Score 1**
    - **Validates: Requirements 13.4, 13.6**
  - [x] 5.7 Escrever teste de propriedade da monotonicidade do score
    - **Property 37: Monotonicidade do Desempenho_Ruim**
    - **Validates: Requirements 13.5**

- [x] 6. Checkpoint — módulos puros
  - Rodar `npm test` (zero falhas, sem rede) e `npm run build`; ensure all tests pass, ask the user if questions arise.

- [x] 7. Captura do HTML, Fonte_OSM e Fonte_Google
  - [x] 7.1 Capturar o corpo no transporte e criar `analyzeSiteWithBody`
    - `net/http-transport.ts`: `collectBody(maxBytes)` puro e exportado; `TransportRequest.captureBody`; `TransportResponse.contentType` e `body` (só sem redirect e com `captureBody`); limite, conexão no IP validado, cabeçalhos e método inalterados
    - `site-analyzer.ts`: `analyzeSiteWithBody` (pede `captureBody`, devolve `html` via `decodeHtml` só se online e `isHtmlContentType`); `analyzeSite` passa a ser `(await analyzeSiteWithBody(…)).analysis`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_
  - [x] 7.2 Escrever testes da captura do corpo
    - `http-transport-body.test.ts`: `collectBody` com fluxos falsos (corte em 1.048.576 bytes, chunks parciais); `analyzeSiteWithBody` com transporte falso: toda requisição passa pelo resolver e pela Guarda_SSRF, destino bloqueado sem HTML, não HTML sem HTML, redirect sem corpo
    - _Requirements: 7.2, 7.3, 21.8_
  - [x] 7.3 Escrever teste de propriedade da preservação da análise da Etapa 1
    - **Property 18: Captura do Corpo_HTML preserva a análise da Etapa 1**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.6**
  - [x] 7.4 Estender `sources/osm.ts`
    - `areaFromNominatim` sempre anexa `bbox` ao `SearchArea` `area`; `mapElement` lê `contact:instagram`/`instagram` e `contact:whatsapp`/`whatsapp` para `instagramOsm`/`whatsappOsm` (normalizados por `signals.ts`)
    - _Requirements: 3.1, 8.5_
  - [x]* 7.5 Escrever testes de exemplo das mudanças no OSM
    - `osm-enrichment.test.ts`: `bbox` presente para relation/way/node; tags de contato mapeadas e normalizadas; testes da Etapa 1 de `osm.ts` continuam passando
    - _Requirements: 3.1, 8.5_
  - [x] 7.6 Estender `lib/leads/usage.ts`
    - `UsageProvider = 'gemini' | 'places' | 'pagespeed'`; `count(provider, month)` em `UsageGate` e `prismaUsageGate`; `memoryUsageGate` do suporte implementa o mesmo contrato
    - _Requirements: 2.4, 2.5, 19.3_
  - [x] 7.7 Implementar `lib/leads/sources/google-places.ts`
    - `PlacesHttp`, `GooglePlacesDeps`, `SEARCH_FIELD_MASK`, `DETAILS_FIELD_MASK`, `buildTextSearchBody`, `rectFromArea`, `mapPlace`, `searchGooglePage` (reserva por tentativa; 2 retentativas 2 s/4 s em 429/5xx/timeout/JSON inválido; `FATAL` em 400/401/403; `QUOTA`; `UNAVAILABLE`), `fetchPlaceDetails` (404 → `NOT_FOUND`), `mergeByPlaceId`, `detectGoogleChains`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 2.4, 2.5, 6.8, 6.10, 20.4_
  - [x] 7.8 Escrever testes de exemplo da Fonte_Google
    - `google-places.test.ts`: máscara de campos em toda requisição; paginação limitada a 3 páginas; `CLOSED_PERMANENTLY` e nome vazio descartados; 429/5xx com esperas 2 s e 4 s e 1 reserva por tentativa; 400/401/403 sem retentativa; cota recusada sem requisição; Place Details ok/404/erro
    - _Requirements: 3.2, 3.3, 3.5, 3.7, 3.8, 2.4, 2.5, 21.2_
  - [x]* 7.9 Escrever teste de propriedade das requisições externas
    - **Property 6: Requisições externas bem formadas e com host fixo**
    - **Validates: Requirements 3.1, 3.2, 10.2, 20.4**
  - [x]* 7.10 Escrever teste de propriedade da paginação e retentativas
    - **Property 7: Paginação e retentativas da Fonte_Google**
    - **Validates: Requirements 1.4, 3.3, 3.7, 3.8**
  - [x]* 7.11 Escrever teste de propriedade do mapeamento de lugares
    - **Property 8: Mapeamento e descarte de lugares**
    - **Validates: Requirements 3.4, 3.5**
  - [x]* 7.12 Escrever teste de propriedade do pré-processamento do Google
    - **Property 9: Pré-processamento dos lugares do Google**
    - **Validates: Requirements 3.6, 3.9**

- [x] 8. PageSpeed, BrasilAPI, IA, mensagem de abordagem e dependências reais
  - [x] 8.1 Implementar `lib/leads/pagespeed.ts`
    - `PageSpeedHttp`, `PageSpeedDeps`, `buildPageSpeedQuery`, `parsePageSpeed`, `runPageSpeed` (reserva antes; 429 → `COTA_ESGOTADA` sem retentativa; timeout 30 s; nunca lança)
    - _Requirements: 10.2, 10.4, 10.5, 10.6, 2.2, 2.4, 2.5_
  - [x] 8.2 Escrever testes de exemplo do Analisador_PageSpeed
    - `pagespeed.test.ts`: sucesso com notas e métricas convertidas, erro HTTP, timeout, 429, resposta sem nota de desempenho, chave ausente (sem cabeçalho) e presente (cabeçalho `X-Goog-Api-Key`)
    - _Requirements: 10.4, 10.5, 10.6, 2.2, 21.6_
  - [x]* 8.3 Escrever teste de propriedade do resultado do PageSpeed
    - **Property 25: Resultado do PageSpeed**
    - **Validates: Requirements 10.4, 10.5, 10.6, 10.7**
  - [x] 8.4 Implementar `lib/leads/brasilapi.ts` e o limitador global
    - `sources/rate-limit.ts`: `brasilApiLimiter` (1.000 ms, em `globalThis`)
    - `brasilapi.ts`: `BrasilApiHttp`, `BrasilApiDeps`, `parseBrasilApi` (só campos de `CnpjData`), `needsLookup` (90 dias), `lookupCnpj` (404 → `NAO_ENCONTRADO`; 429/5xx/timeout → 1 retentativa após 2 s → `INDISPONIVEL`; respeita `deadline`)
    - _Requirements: 2.3, 12.1, 12.2, 12.3, 12.5, 20.4_
  - [x] 8.5 Escrever testes de exemplo do Enriquecedor_CNPJ
    - `brasilapi.test.ts`: resposta completa com QSA/e-mail/telefone descartados; 404; 429 e 5xx com retentativa; timeout duplo; consulta não enviada quando o limitador ultrapassa o deadline
    - _Requirements: 12.2, 12.3, 12.5, 21.4_
  - [x]* 8.6 Escrever teste de propriedade do espaçamento da BrasilAPI
    - **Property 5: Espaçamento da BrasilAPI**
    - **Validates: Requirements 2.3**
  - [x]* 8.7 Escrever teste de propriedade da consulta e minimização dos Dados_CNPJ
    - **Property 32: Consulta e minimização dos Dados_CNPJ**
    - **Validates: Requirements 12.1, 12.2**
  - [x]* 8.8 Escrever teste de propriedade da retentativa da BrasilAPI
    - **Property 33: Retentativa da BrasilAPI**
    - **Validates: Requirements 12.5**
  - [x] 8.9 Estender `lib/leads/ai.ts` com os novos dados
    - `AiInput.sinais`/`AiInput.cnpj`, `CnpjAiFields`, `cnpjAiFields` (sem razão social), `promptData` com presença digital e campos de CNPJ; validação, timeout, cota e fallback inalterados (testes da Etapa 1 continuam verdes)
    - _Requirements: 14.1, 14.2, 12.8_
  - [x] 8.10 Implementar `lib/leads/approach.ts`
    - `buildApproachPrompt`, `parseApproachResponse` (limites por canal e marcadores), `templateMessage` (modelo fixo por Categoria × canal, truncado nos limites), `generateApproach` (reserva `gemini`, timeout 20 s, uma requisição, fallback com motivo, nunca lança)
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.10, 1.8_
  - [x] 8.11 Escrever testes de exemplo do Gerador_Abordagem
    - `approach.test.ts`: resposta válida da IA (WhatsApp e e-mail com assunto); cada motivo de fallback (sem chave, cota, erro, timeout, inválida); limites 700/120/2.000; marcadores `{{`, `}}`, `[NOME]`; uma única reserva e uma única requisição
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 21.7_
  - [x] 8.12 Escrever teste de propriedade da minimização dos dados enviados ao Gemini
    - **Property 34: Minimização dos dados enviados ao Gemini**
    - **Validates: Requirements 12.8, 14.1, 15.2, 15.10**
  - [x]* 8.13 Escrever teste de propriedade da validação da mensagem
    - **Property 39: Validação da Mensagem_Abordagem**
    - **Validates: Requirements 15.3**
  - [x]* 8.14 Escrever teste de propriedade do fallback para o modelo fixo
    - **Property 40: Fallback para o modelo fixo**
    - **Validates: Requirements 15.4, 15.5**
  - [x]* 8.15 Escrever teste de propriedade do link do WhatsApp
    - **Property 41: Link "Abrir no WhatsApp"**
    - **Validates: Requirements 15.7**
  - [x] 8.16 Implementar `lib/leads/services.ts` e estender `lib/leads/deps.ts`
    - `services.ts`: `serviceState`, `serviceStatus` (uso via `UsageGate.count`)
    - `deps.ts`: leitura de `GOOGLE_PLACES_API_KEY`, `PLACES_MONTHLY_LIMIT`, `PAGESPEED_API_KEY`, `PAGESPEED_MONTHLY_LIMIT`; `createPlacesHttp`, `createPageSpeedHttp`, `createBrasilApiHttp` com `fetchFn` injetável, host fixo, chave só no cabeçalho, erros genéricos; `redactSecrets`; `getServicesStatus()`, `getApproachDeps()`; `getPipelineDeps()` montando `google`, `pagespeed`, `cnpj`
    - Acrescentar os campos `google`, `pagespeed` e `cnpj` à interface `PipelineDeps` em `pipeline.ts` (ainda sem uso) e atualizar os fakes de `PipelineDeps` dos testes da Etapa 1
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.8, 20.4_
  - [x]* 8.17 Escrever teste de propriedade das chaves de API
    - **Property 4: Chaves de API nunca vazam**
    - **Validates: Requirements 2.8**
  - [x]* 8.18 Escrever teste de propriedade da disponibilidade dos serviços
    - **Property 2: Disponibilidade dos serviços**
    - **Validates: Requirements 2.1, 2.2, 2.6**
  - [x] 8.19 Escrever teste de propriedade do Portão_Uso
    - **Property 3: O Portão_Uso nunca excede o limite**
    - **Validates: Requirements 2.4, 2.5, 3.3, 3.7, 15.2, 19.3**

- [x] 9. Checkpoint — adaptadores externos
  - Rodar `npm test` (zero falhas, sem rede) e `npm run build`; ensure all tests pass, ask the user if questions arise.

- [x] 10. Deduplicação entre fontes, Cache_Google e repositório
  - [x] 10.1 Estender `lib/leads/dedup.ts`
    - `CompanyKey.googleAliases`, `hasIdentifier` para Place_ID em aliases, `toGoogleKey`, `effectiveKey`, `companySource`, `effectiveSource`, `ingestSourcesInMemory` (Google e OSM, Cache_Google, `origem` dos vínculos); `ingestInMemory` continua disponível com o mesmo comportamento
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 4.7_
  - [x]* 10.2 Escrever teste de propriedade da fonte derivada
    - **Property 12: Fonte derivada das origens e identificadores**
    - **Validates: Requirements 4.7, 5.4**
  - [x]* 10.3 Escrever teste de propriedade da deduplicação entre fontes
    - **Property 13: Deduplicação entre fontes segue o modelo de referência**
    - **Validates: Requirements 5.1, 5.3**
  - [x]* 10.4 Escrever teste de propriedade da ingestão do Google
    - **Property 14: Ingestão do Google só toca Place_ID e cache**
    - **Validates: Requirements 5.2, 5.3, 5.5, 6.1**
  - [x]* 10.5 Escrever teste de propriedade da idempotência da ingestão combinada
    - **Property 15: Idempotência da ingestão combinada**
    - **Validates: Requirements 5.6**
  - [x] 10.6 Implementar `lib/leads/google-cache.ts`
    - `googleCacheExpiry`, `writeGoogleCache` (upsert + `nomeExibicao` na mesma transação), `purgeExpiredGoogleCache` (DELETE … RETURNING + recálculo de `nomeExibicao`), `refreshGoogleCache` (`FRESH`/`UPDATED`/`UNAVAILABLE`/`FAILED`/`NOT_FOUND`; 404 apaga o cache e mantém o Place_ID)
    - _Requirements: 6.1, 6.2, 6.8, 6.9, 6.10_
  - [x] 10.7 Estender `lib/leads/repository.ts`
    - `upsertGooglePlace` (candidatas por Place_ID, alias `GOOGLE` e nome/caixa com chave efetiva; criação de Empresa só do Google com `nome = ''`; Place_ID ou alias; cache; `fonte`; vínculo com `origem` acumulada); `upsertFoundCompany` com chave efetiva, `origem` e `fonte`; `claimBatch` com os campos novos e `cacheWebsite` válido; `applyCnpjInTx` (SAVEPOINT, `CONFLITO`); `persistAnalysis` v2 (sinais, tecnologias, PageSpeed/motivo, `versaoScore = 2`, snapshots, CNPJ/Dados_CNPJ/candidatos, `nomeExibicao`); `persistReanalysis`; `pruneGoogleChains`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 3.9, 8.8, 9.5, 10.7, 11.4, 11.5, 11.8, 12.1, 13.1, 16.6_
  - [x] 10.8 Escrever testes de exemplo do Cache_Google
    - `google-cache.test.ts` (Prisma falso): 29 dias válido e 30 dias completos expirado; purga apaga só expirados e recalcula `nomeExibicao`; `refreshGoogleCache` com Place Details ok, falha, indisponível e 404
    - _Requirements: 6.1, 6.2, 6.8, 6.9, 6.10, 21.3_
  - [x] 10.9 Escrever testes de integração do repositório
    - `integration/repository-enrichment.int.test.ts` (`RUN_DB_TESTS=1`): `prismaUsageGate` com `places` e `pagespeed` sob 50 reservas concorrentes e limite 10 (exatamente 10 por provedor, independentes); aplicações concorrentes do mesmo CNPJ em Empresas diferentes (uma aplica, a outra vira `CONFLITO`); Google + OSM no mesmo Nicho `MISTA` resultando numa Empresa `MISTA`; reingestão idempotente
    - _Requirements: 19.3, 11.8, 5.4, 5.6, 21.9_

- [x] 11. Análise da empresa, pipeline e reanálise
  - [x] 11.1 Implementar `lib/leads/analysis.ts`
    - `analyzeCompany` (site + corpo → sinais e CNPJs → `planCnpj` → PageSpeed, BrasilAPI e IA em paralelo com timeouts limitados pelo deadline → `resolveSiteCnpj` → `classify`/`score` v2; descarta o HTML) e `approachInputFrom`
    - _Requirements: 7.1, 7.5, 8.8, 9.5, 10.2, 10.3, 10.7, 10.8, 11.3, 11.4, 11.5, 11.9, 12.1, 12.3, 12.4, 12.5, 12.7, 12.8, 13.1, 13.8, 14.1, 16.2_
  - [x] 11.2 Escrever testes de exemplo da descoberta e do enriquecimento de CNPJ
    - `analysis.test.ts` (fakes): HTML com zero, um e vários CNPJs; CNPJ de outra UF; 404; BrasilAPI indisponível (CNPJ mantido sem dados); opção de consulta desmarcada (sem chamada à BrasilAPI); CNPJ `MANUAL` preservado; PageSpeed só com site online e `DESABILITADO_NA_MINERACAO`; HTML ausente do resultado
    - _Requirements: 11.4, 11.5, 11.9, 12.3, 12.4, 12.5, 12.7, 10.7, 7.5, 21.4_
  - [x]* 11.3 Escrever teste de propriedade das URLs enviadas ao PageSpeed
    - **Property 26: PageSpeed só recebe URLs finais validadas**
    - **Validates: Requirements 10.2, 10.3, 10.7**
  - [x]* 11.4 Escrever teste de propriedade da margem do Lote
    - **Property 27: Cada Empresa cabe no Lote**
    - **Validates: Requirements 10.8**
  - [x]* 11.5 Escrever teste de propriedade da independência do score
    - **Property 38: Sinais e CNPJ não alteram Categoria nem score**
    - **Validates: Requirements 13.8**
  - [x] 11.6 Estender a validação de entrada em `lib/leads/filters.ts`
    - `RunInput`/`runInputSchema` com `fonte` (padrão `MISTA`), `pagespeedEnabled` e `cnpjEnabled` (padrão `true`); `buildRunParamsKey` inalterado; schemas `approachBodySchema` (`canal`) e `cnpjBodySchema` (Validador_CNPJ, mensagem "CNPJ inválido"), ambos `.strict()`
    - _Requirements: 4.3, 10.1, 12.7, 11.7, 20.3, 20.5_
  - [x] 11.7 Estender `lib/leads/pipeline.ts`
    - `resolveRunSources` e `createRun` (fonte solicitada/efetiva, `googleMotivo`, PageSpeed/CNPJ); `RunProgress` com os campos novos; `nichePlan`; `discoverStep` com purga, cursor do Google, fallback por Nicho, `googleNichosAfetados`, `pruneGoogleChains` e Fonte_Efetiva; `perCompanyMarginMs`; `runBatch` usando `analyzeCompany` e `persistAnalysis` v2
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10, 3.3, 3.6, 3.8, 3.9, 6.2, 10.8_
  - [x] 11.8 Escrever testes de exemplo do pipeline com as duas fontes
    - `pipeline-sources.test.ts` (fakes + Prisma falso): fallback por Nicho sem chave, com cota esgotada, com 429/5xx esgotados e com 401/403; Fonte_Efetiva `GOOGLE`, `OSM` e `MISTA`; paginação parada e retomada entre passos; descarte de `CLOSED_PERMANENTLY`; Rede por 3 nomes iguais; reserva de cota por requisição inclusive nas retentativas; Nicho falho nas duas fontes
    - _Requirements: 4.3, 4.5, 4.6, 4.7, 4.8, 4.10, 3.5, 3.9, 2.4, 21.2_
  - [x]* 11.9 Escrever teste de propriedade da decisão de fontes
    - **Property 10: Decisão de fontes por Mineracao e por Nicho**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.8**
  - [x]* 11.10 Escrever teste de propriedade da descoberta retomável
    - **Property 11: Descoberta retomável com fallback**
    - **Validates: Requirements 4.6, 4.10**
  - [x]* 11.11 Escrever teste de propriedade da validação dos parâmetros novos
    - **Property 46: Validação dos parâmetros novos**
    - **Validates: Requirements 11.7, 20.5**
  - [x]* 11.12 Implementar `lib/leads/reanalysis.ts`
    - Lease atômico com `NOT EXISTS` de Analise < 10 min (`RECENTE`/`EM_CURSO`), `refreshGoogleCache` quando necessário (sem website → `semWebsite`), `analyzeCompany` com o deadline da rota, `persistReanalysis`, liberação do lease em `finally`
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6_
  - [x]* 11.13 Escrever testes de integração da reanálise
    - `integration/reanalysis.int.test.ts` (`RUN_DB_TESTS=1`, fakes externos): duas Reanalises simultâneas (uma conclui, a outra 409 `EM_CURSO`); Analise com menos de 10 minutos (409 `RECENTE`); falha na gravação mantém Analise e snapshot anteriores
    - _Requirements: 16.4, 16.5, 16.6, 21.9_

- [x]* 12. Checkpoint — pipeline
  - Rodar `npm test` (zero falhas, sem rede) e `npm run build`; ensure all tests pass, ask the user if questions arise.

- [ ] 13. Rotas, filtros, CSV e triagem
  - [x] 13.1 Estender `filters.ts` (listagem), `csv.ts` e `triage.ts`
    - `CompanyFilters`/`buildCompanyWhere(f, now)` com `temInstagram`, `temWhatsapp`, `temCnpj`, `situacao`, `desempenhoRuim`; `q` em `nome`, `cnpjNomeFantasia` e `googleCache.nome` válido, sempre `mode: 'insensitive'`; `RANKING_ORDER`/`RankKey`/`compareRanking` com `nomeExibicao`
    - `csv.ts`: 7 colunas novas na ordem do Req. 18.4, `ExportRow` estendido, valores de `ownFields`
    - `triage.ts`: `companyName = nomeExibicao`, `contactInfo` só com valores próprios + link do Google Maps
    - _Requirements: 18.1, 18.2, 18.4, 18.5, 6.6, 6.7_
  - [ ] 13.2 Escrever teste de propriedade do Mapa, CSV e triagem sem Conteudo_Google
    - **Property 17: Mapa, CSV e triagem sem Conteudo_Google**
    - **Validates: Requirements 6.5, 6.6, 6.7**
  - [ ]* 13.3 Escrever teste de propriedade dos filtros e da ordenação
    - **Property 43: Filtros novos e ordenação pelo Nome_Exibicao**
    - **Validates: Requirements 18.1, 18.2**
  - [ ]* 13.4 Escrever teste de propriedade do CSV com as colunas novas
    - **Property 44: CSV com as colunas novas**
    - **Validates: Requirements 18.4, 18.5**
  - [x] 13.5 Estender as rotas `config` e `runs`
    - `GET /config` → `{ iaAvailable, services }` via `getServicesStatus()`; `POST /runs` com os campos novos; `GET /runs`, `/runs/[id]`, `/runs/active` com `fonteSolicitada`, `fonte`, `googleMotivo`, `googleNichosAfetados`, `pagespeedEnabled`, `cnpjEnabled`; filtro `fonte` sobre a Fonte_Efetiva
    - _Requirements: 2.6, 2.7, 4.1, 4.2, 4.3, 4.9, 18.3, 20.1_
  - [ ] 13.6 Estender as rotas de empresas existentes
    - `GET /companies`, `/companies/map`, `POST /export`, `POST /triage` e `GET /companies/[id]`: purga oportunista; respostas via `displayCompany` (Nome_Exibicao, `nomeOrigem`, `googleFields`, `google`), sem objeto de cache cru; mapa só com coordenadas próprias e `semCoordsProprias`; ficha com CNPJ, candidatos (com conflito), sinais, PageSpeed, Versao_Score, mensagens e `refreshGoogleCache` quando aplicável
    - _Requirements: 6.2, 6.3, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 15.8, 17.1, 17.2, 17.3, 17.4, 17.5, 18.1, 18.2, 18.4_
  - [ ] 13.7 Criar as rotas novas de reanálise, CNPJ e mensagem
    - `companies/[id]/reanalyze/route.ts` (`POST`, `maxDuration = 60`, deadline 55 s, 409 com `reason`, 500 genérico)
    - `companies/[id]/cnpj/route.ts` (`PUT` com validação, `MANUAL`, auditoria `LEAD_COMPANY_CNPJ_SET`, 409 de conflito com `{ id, nome }`, consulta à BrasilAPI; `DELETE` com auditoria `LEAD_COMPANY_CNPJ_REMOVED`)
    - `companies/[id]/approach/route.ts` (`POST`, `canal`, primeiro nome da sessão, 409 sem Analise, grava `ApproachMessage`, devolve `ApproachMessageDto` com `whatsappLink`)
    - _Requirements: 11.6, 11.7, 11.8, 11.10, 12.1, 15.2, 15.6, 15.7, 16.2, 16.4, 16.5, 16.6, 20.1, 20.2, 20.3, 20.5_
  - [x] 13.8 Estender `lib/leads/client-api.ts`
    - Tipos `ServicesStatus`, `RunProgress`/`RunListItem` estendidos, `CompanyRow`/`CompanyDetail` v2, `ApproachMessageDto`, `MapResponse.semCoordsProprias`; chamadas `reanalyze`, `setCnpj`, `removeCnpj`, `generateApproach`; `CreateRunInput` com `fonte`, `pagespeedEnabled`, `cnpjEnabled`
    - _Requirements: 2.6, 4.1, 11.6, 15.2, 16.2_
  - [ ] 13.9 Escrever testes das rotas
    - `routes-enrichment.test.ts` (padrão de `tests/lead-miner/route-helpers.test.ts`, Prisma e serviços falsos): 401/403 sem efeitos; 400 por parâmetro; autor da sessão ignorando ids do corpo; contratos JSON de `/config`, `/reanalyze`, `/cnpj`, `/approach`; omissão do Conteudo_Google expirado em `/companies`, `/companies/[id]` e `/map`; CSV sem Conteudo_Google com "Link Google Maps"
    - _Requirements: 20.1, 20.2, 20.3, 20.5, 6.3, 6.5, 6.6, 2.8, 21.3_
  - [ ]* 13.10 Escrever teste de propriedade das rotas negando sem efeitos
    - **Property 45: Rotas novas negam sem efeitos colaterais**
    - **Validates: Requirements 20.1, 20.2**

- [ ] 14. Telas e componentes
  - [ ] 14.1 Criar `components/lead-miner/enrichment-helpers.ts` e componentes compartilhados
    - `enrichment-helpers.ts`: `pageSpeedBand`, `formatWhatsapp`, `situacaoAlert`, `fallbackLabel`, `unavailableLabel`, `sourceSummary`, `cnpjOriginLabel`
    - `GoogleAttribution.tsx` ("Google Maps" com `translate="no"`), `GoogleContent.tsx` (contêiner com borda/fundo próprios e atribuição) e `GoogleUnusedNote.tsx` (três textos do Req. 4.9)
    - _Requirements: 4.9, 6.4, 12.6, 15.4, 17.2, 17.6, 20.6_
  - [ ]* 14.2 Escrever teste de propriedade das faixas do PageSpeed
    - **Property 42: Faixas das notas do PageSpeed**
    - **Validates: Requirements 17.2**
  - [ ] 14.3 Atualizar a Tela_Minerar
    - `ServiceStatusPanel.tsx` (estado e "N de M chamadas" de Google Places, PageSpeed e IA), `SourcePicker.tsx` (pré-seleção e desabilitação com motivo), checkboxes de PageSpeed (aviso sem chave; desabilitada com cota esgotada) e CNPJ; `mining-form-helpers.buildCreateRunInput` com os campos novos; `GoogleUnusedNote` nos cards de progresso
    - _Requirements: 2.6, 2.7, 4.1, 4.2, 4.9, 10.1, 12.7_
  - [ ] 14.4 Atualizar a Tela_Mineracoes
    - `RunsTable` com "Fonte: solicitada → efetiva" e `GoogleUnusedNote`; `runs-helpers` com os rótulos novos; filtro de fonte sobre a Fonte_Efetiva
    - _Requirements: 4.9, 18.3_
  - [ ] 14.5 Atualizar a Tela_Ranking e o Mapa
    - `RankingFilters` com os 5 filtros novos (sincronizados na URL por `ranking-helpers`); `RankingTable` com Nome_Exibicao, alerta de situação e `GoogleAttribution` nas células com Conteudo_Google; `CompanyMap` com o aviso "N empresas do Google Places não aparecem no mapa (termos do Google)" e popup sem Conteudo_Google
    - _Requirements: 18.1, 18.2, 12.6, 6.4, 6.5_
  - [ ] 14.6 Atualizar a Ficha_Empresa
    - `CompanyHeader` (Nome_Exibicao, alerta de situação, "Ver no Google Maps", `GoogleContent`, `OdblAttribution` com `osmId`, avisos do Google); novas seções `ficha/DigitalPresence.tsx`, `ficha/PageSpeedCard.tsx`, `ficha/CnpjSection.tsx`, `ficha/ApproachMessages.tsx`, `ficha/ReanalyzeButton.tsx`; `AnalysisHistory` com Versao_Score e "regras da Etapa 1"; `ficha-helpers` sem recalcular Analises antigas
    - _Requirements: 6.4, 6.9, 6.10, 11.5, 11.6, 11.7, 11.8, 12.4, 12.6, 13.7, 15.1, 15.4, 15.6, 15.7, 15.8, 15.9, 16.1, 16.3, 16.6, 16.7, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 20.6_
  - [ ]* 14.7 Escrever testes de componentes
    - `service-status-panel.test.tsx`, `source-picker.test.tsx`, `cnpj-section.test.tsx`, `approach-messages.test.tsx` (cliques repetidos → uma requisição; "Copiar"; "Abrir no WhatsApp"; "Mensagem gerada pelo modelo padrão"), `reanalyze-button.test.tsx`, `google-attribution.test.tsx`, `pagespeed-card.test.tsx`
    - _Requirements: 2.6, 2.7, 4.1, 4.2, 6.4, 11.7, 11.8, 15.4, 15.7, 15.9, 16.7, 17.2_

- [ ] 15. Checkpoint final
  - Rodar `npm test` (zero falhas, sem rede), `npm run build` (sem erros) e, num banco descartável, `RUN_DB_TESTS=1 npm test`; ensure all tests pass, ask the user if questions arise.
  - _Requirements: 21.9, 21.10_

- [ ] 16. Registro da entrega e push
  - [ ] 16.1 Atualizar `docs/PLANO-INTEGRACAO.md`
    - Seção 8: linha "3 — Melhorias" com Status "concluída em {data} na branch `etapa-3-melhorias` (PR pendente; ver 8.4)"
    - Nova subseção 8.4 "Registro da Etapa 3": decisões confirmadas (resumo da seção "Decisões (confirmadas)" do `requirements.md`), variáveis de ambiente e padrões, cotas (`places`, `pagespeed`, `gemini`), termos do Google (cache de 30 dias, purga oportunista, sem dados do Google no Leaflet/CSV), limitações conhecidas (limitador da BrasilAPI por processo, purga agendada só na Etapa 4, BrasilAPI e CNPJ alfanumérico, ~3 Empresas por Lote com PageSpeed)
    - _Requirements: 21.11_
  - [ ] 16.2 Commitar e enviar a branch
    - Stage de arquivos específicos (sem `.env`), incluindo `.kiro/specs/**`; commit; `git push -u origin etapa-3-melhorias`
    - O `gh` não está instalado: informar ao usuário a URL de criação de PR impressa pelo `git push`, com base `etapa-2-paineis`, e o texto sugerido da PR (resumo, resultado de `npm test`/`npm run build`/`RUN_DB_TESTS=1`, checklist do Req. 21 e roteiro de verificação manual das telas e de acessibilidade)
    - _Requirements: 21.12_

## Notes

- Tarefas com `*` são opcionais. Os testes exigidos pelo Requisito 21 não são opcionais: 1.3, 3.3, 4.2, 4.4, 4.10, 4.11, 4.15, 5.2, 5.4, 5.6, 5.7, 7.2, 7.3, 7.8, 8.2, 8.5, 8.11, 8.12, 8.19, 10.8, 10.9, 11.2, 11.8, 11.13, 13.2 e 13.9.
- Cada propriedade das Correctness Properties tem sub-tarefa e arquivo próprios (`{modulo}.p{N}.property.test.ts`), com ao menos 100 execuções.
- Testes de integração com Postgres (3.3, 10.9, 11.13) ficam pulados sem `RUN_DB_TESTS=1` e exigem um banco descartável (branch Neon ou Postgres local).
- A PR fica empilhada sobre `etapa-2-paineis` (ainda não mesclada em `main`); quando a Etapa 2 for mesclada, a base da PR deve ser trocada para `main`.
- Validação completa de WCAG exige teste manual com tecnologias assistivas e revisão especializada; o roteiro fica na PR.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.4", "3.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.3", "3.2", "4.7", "5.1", "5.3", "7.6"] },
    { "id": 3, "tasks": ["3.3", "4.1", "4.8", "4.9", "5.2", "5.4", "5.5", "5.6", "5.7", "7.1", "8.1", "8.9"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15", "7.2", "7.3", "7.4", "8.2", "8.3", "8.4", "8.10"] },
    { "id": 5, "tasks": ["7.5", "7.7", "8.5", "8.6", "8.7", "8.8", "8.11", "8.12", "8.13", "8.14", "8.15", "10.1"] },
    { "id": 6, "tasks": ["7.8", "7.10", "7.11", "7.12", "8.16", "10.2", "10.3", "10.4", "10.5", "10.6"] },
    { "id": 7, "tasks": ["7.9", "8.17", "8.18", "8.19", "10.7", "10.8"] },
    { "id": 8, "tasks": ["10.9", "11.1", "11.6"] },
    { "id": 9, "tasks": ["11.2", "11.3", "11.4", "11.5", "11.7", "11.11"] },
    { "id": 10, "tasks": ["11.8", "11.9", "11.10", "11.12"] },
    { "id": 11, "tasks": ["11.13", "13.1"] },
    { "id": 12, "tasks": ["13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8"] },
    { "id": 13, "tasks": ["13.9", "13.10", "14.1"] },
    { "id": 14, "tasks": ["14.2", "14.3", "14.4", "14.5", "14.6"] },
    { "id": 15, "tasks": ["14.7"] },
    { "id": 16, "tasks": ["16.1"] },
    { "id": 17, "tasks": ["16.2"] }
  ]
}
```
