# Implementation Plan: Minerador de Leads (Etapa 1)

## Overview

Implementação incremental em TypeScript (Next.js 14 App Router + Prisma/Postgres), seguindo o `design.md`. A ordem é: branch, dependências e infraestrutura de testes sem rede → schema e migração → módulos puros de `lib/leads/` com testes → adaptadores de I/O injetáveis → repositório e pipeline → rotas `/api/tools/lead-miner/**` → telas e card em Ferramentas → registro da Etapa 1 no plano mestre e PR. Cada etapa termina integrada à anterior; nada fica órfão.

Convenções:
- Testes em `tests/lead-miner/`. Unitários em `{modulo}.test.ts`; cada propriedade do design em arquivo próprio `{modulo}.p{N}.property.test.ts`, com `fc.assert(..., { numRuns: 100 })` e o comentário `// Feature: lead-miner, Property {N}: {texto}`.
- Dependências falsas e geradores em `tests/lead-miner/support/` (um arquivo por área, para evitar conflitos entre tarefas paralelas).
- Toda rota: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `withAuth` + `assert(canUseNegociosTools(actor), NO_ACCESS)` antes de qualquer leitura/escrita; autor sempre de `actor.id`.

## Tasks

- [x] 1. Branch, dependências e infraestrutura de testes
  - [x] 1.1 Criar a branch da Etapa 1 e instalar dependências pinadas
    - `git switch etapa-0-fundacao && git switch -c etapa-1-minerador` (a partir de `etapa-0-fundacao`, que contém a Etapa 0; se ela já estiver mesclada em `main`, partir de `main`)
    - Instalar com versão exata: produção `ipaddr.js@2.2.0`, `leaflet@1.9.4`; dev `vitest@2.1.8`, `fast-check@3.23.2`, `@types/leaflet@1.9.14`
    - Adicionar scripts `"test": "vitest run"` e `"test:watch": "vitest"` em `package.json`
    - _Requirements: 20.6, 20.8_
  - [x] 1.2 Configurar Vitest com bloqueio de rede
    - Criar `vitest.config.ts` (ambiente `node`, alias `@/`, `include: ['tests/**/*.test.ts']`, `setupFiles: ['tests/setup/no-network.ts']`)
    - Criar `tests/setup/no-network.ts`: substituir `net.Socket.prototype.connect`, `dns.lookup`, `dns.promises.lookup` e `globalThis.fetch` por funções que lançam `Error('Acesso à rede proibido em testes')`; remover `GEMINI_API_KEY` de `process.env`
    - Criar `tests/lead-miner/support/fake-clock.ts` (`fakeClock()` com `now` e `sleep` que avança o tempo)
    - Garantir que `tsconfig.json` continua excluindo `tests/` do type-check do build
    - _Requirements: 20.6, 20.7_
  - [x] 1.3 Escrever teste de sanidade do bloqueio de rede
    - `tests/setup/no-network.test.ts`: `fetch`, `dns.promises.lookup` e `net.connect` lançam o erro esperado; `GEMINI_API_KEY` ausente
    - _Requirements: 20.6, 20.7_

- [x] 2. Modelo de dados e migração
  - [x] 2.1 Atualizar `prisma/schema.prisma`
    - Enums `MiningSource`, `MiningStatus`, `CompanyCategory`, `LeadPriority`
    - Modelos `Company`, `CompanyAnalysis`, `MiningRun` (com `bairroNorm`, `cidadeNorm`, `paramsKey`, `iaDisabledReason`, `nichosProcessados`, `nichosFalhos`, `area`, `lockedUntil`), `MiningRunCompany` (claim, `processedAt`, `failed`, `analysisId @unique`, `@@unique([runId, companyId])`), `ApiUsage` (`@@unique([provider, month])`)
    - Relações em `User` (`miningRuns`, `assignedCompanies`) e `ProspectLead.companyId String? @unique`
    - Índices do design; atualizar o comentário do topo listando `MiningRun_one_active_per_author_params` entre os índices parciais a preservar
    - _Requirements: 9.11, 9.13, 8.1, 7.9, 2.13_
  - [x] 2.2 Gerar e revisar a migração `prisma/migrations/20261001000000_lead_miner/migration.sql`
    - `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`
    - Remover qualquer `DROP INDEX "User_one_manager_per_department"` / `"SectorMember_one_manager_per_sector"`
    - Acrescentar `CREATE UNIQUE INDEX "MiningRun_one_active_per_author_params" ON "MiningRun" ("createdById", "paramsKey") WHERE status IN ('PENDENTE','EM_ANDAMENTO');`
    - Rodar `npx prisma generate` e confirmar que o client compila
    - _Requirements: 9.11, 9.13, 18.7, 18.12_

- [x] 3. Configuração, tipos e utilitários isomórficos
  - [x] 3.1 Criar `lib/leads/types.ts`
    - `FoundCompany`, `FailureReason`, `SslProblem`, `SiteAnalysis`, `ClassificationResult`, `AiResult`, `AiOutcome`, `ScoreCriterion`, `ScoreComponent`, `ScoreBreakdown`, `LatLng`
    - _Requirements: 3.1, 5.6, 6.9_
  - [x] 3.2 Criar `lib/leads/config.ts`
    - 22 nichos (rótulos/tags portados de `config/settings.py` do Lead-Manager, conforme a tabela do design), `PRESETS`, `UFS`, timeouts e limites, `geminiMonthlyLimit(env)`, `CATEGORY_LABEL`, `ACTION_PLAN_BY_CATEGORY`, `ACTION_PLAN_DEFAULT`, `DIGITAL_POINTS`, `ICP_POINTS`, máximos, `PRIORITY_LABEL`, tamanhos de lote/página, `OSM_USER_AGENT`, `ODBL_TEXT`, `ODBL_URL`
    - Sem imports de Node, Prisma ou `server-only`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_
  - [x]* 3.3 Escrever testes unitários de `config.ts`
    - 22 ids únicos, rótulos não vazios, ≥ 1 tag, cada tier presente; presets válidos e `todos` = 22; rótulos exatos das categorias; constantes (10 s, 2.500 ms, 400, `ICP_POINTS[1] = 25`, tiers não crescentes)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  - [x]* 3.4 Escrever property test de `geminiMonthlyLimit`
    - **Property 1: Limite mensal do Gemini**
    - **Validates: Requirements 1.9**
  - [x] 3.5 Criar `lib/leads/text.ts` e `lib/leads/geo.ts`
    - `normalizeText`, `normalizeCompanyName` (remove "s/a" antes da pontuação, depois sufixos ltda/me/eireli/sa/epp ao final)
    - `haversineMeters`, `isValidCoord`
    - _Requirements: 9.2, 10.4, 13.1_
  - [x]* 3.6 Escrever property test de normalização
    - **Property 25: Normalização de nomes e textos**
    - **Validates: Requirements 9.2, 10.4, 20.3**

- [x] 4. Classificador e Pontuador
  - [x] 4.1 Implementar `lib/leads/classifier.ts`
    - `classify(a)` com as regras 1–4 do design, lendo limites de `config.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  - [x] 4.2 Escrever testes unitários do Classificador
    - Sem site; cada condição (a)–(e) isolada; latência exatamente 2.500 ms e status 399 → "Análise de Dados / BI"; análise incompleta; duas execuções com a mesma entrada produzem categoria e motivos iguais
    - Criar `tests/lead-miner/support/arb-site.ts` com `arbSiteAnalysis` (fronteiras 399/400, 2500/2501, nulos)
    - _Requirements: 20.1, 5.1, 5.2, 5.3, 5.8_
  - [x]* 4.3 Escrever property test do Classificador
    - **Property 12: Classificação segue o modelo de referência**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6, 5.8**
  - [x] 4.4 Implementar `lib/leads/scorer.ts`
    - `score(input)`, `priorityOf`, `roundHalfUp`; detalhamento com critérios, `raw`, `value`, `formula`, `iaNaoUsadaMotivo` ("cota esgotada" → "sem resposta")
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_
  - [x] 4.5 Escrever testes unitários do Pontuador
    - Com IA (objetivo + IA) e sem IA (`round(objetivo × 100 / 65)`); entradas de pontuação mínima e máxima; Prioridade em 39, 40, 69, 70; duas execuções iguais
    - Criar `tests/lead-miner/support/arb-score.ts` com `arbScoreInput`
    - _Requirements: 20.2, 6.4, 6.5, 6.7, 6.8_
  - [x]* 4.6 Escrever property test de determinismo
    - **Property 13: Determinismo do Classificador e do Pontuador**
    - **Validates: Requirements 5.7, 6.10**
  - [x]* 4.7 Escrever property test dos componentes do score
    - **Property 14: Invariantes dos componentes do score**
    - **Validates: Requirements 6.1, 6.3, 6.7, 6.9**
  - [x]* 4.8 Escrever property test da fórmula do Score_Final
    - **Property 15: Fórmula do Score_Final**
    - **Validates: Requirements 6.4, 6.5, 6.6**
  - [x]* 4.9 Escrever property test das faixas de Prioridade
    - **Property 16: Faixas de Prioridade**
    - **Validates: Requirements 6.8**

- [x] 5. Deduplicador
  - [x] 5.1 Implementar `lib/leads/dedup.ts`
    - `matchCompany` (precedência `googlePlaceId` > `osmId` > `cnpj`, depois nome normalizado + ≤ 100 m, menor distância), `CADASTRAL_FIELDS`, `mergeCompanyFields` (patch; vazio nunca apaga)
    - Função pura auxiliar `ingestInMemory(base, found[], runId)` usada pelos testes de idempotência e espelhando a lógica do repositório
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_
  - [x] 5.2 Escrever testes unitários do Deduplicador
    - Precedência dos identificadores; Nome_Normalizado com maiúsculas, acentos, pontuação, espaços repetidos e cada sufixo (ltda, me, eireli, s/a, sa, epp); 100 m = mesma empresa, 100,5 m = distinta; sem coordenadas → inexistente
    - Criar `tests/lead-miner/support/arb-company.ts` com `arbCompanyKey`
    - _Requirements: 20.3, 9.1, 9.2, 9.3_
  - [x]* 5.3 Escrever property test do Deduplicador
    - **Property 22: Deduplicação segue o modelo de referência**
    - **Validates: Requirements 9.1, 9.2, 9.3**
  - [x]* 5.4 Escrever property test da mescla de campos
    - **Property 23: Mescla de campos cadastrais**
    - **Validates: Requirements 9.4**
  - [x] 5.5 Escrever property test de idempotência da ingestão
    - **Property 24: Idempotência da ingestão**
    - **Validates: Requirements 9.6, 9.10, 20.3**

- [x] 6. CSV, lead de triagem e filtros
  - [x] 6.1 Implementar `lib/leads/csv.ts`
    - `CSV_HEADER` (13 colunas), `toCsvRow`, `sanitizeCell`, `buildCsv` (BOM, `;`, CRLF, RFC 4180), `parseCsv`, `limitExport`
    - _Requirements: 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_
  - [x] 6.2 Escrever testes unitários do CSV
    - BOM e `;`; escape de aspas, `;` e quebras; prefixo `'` para `=`, `+`, `-`, `@`, TAB, CR; 5.001 linhas → 5.000 e `truncated = true`
    - Criar `tests/lead-miner/support/arb-csv.ts` com `arbCsvCell`
    - _Requirements: 20.5, 17.2, 17.4, 17.5, 17.7_
  - [x] 6.3 Escrever property test de round-trip do CSV
    - **Property 30: Round-trip e formato do CSV**
    - **Validates: Requirements 17.2, 17.3, 17.4, 17.6, 20.5**
  - [x]* 6.4 Escrever property test de neutralização de fórmulas
    - **Property 31: Neutralização de fórmulas no CSV**
    - **Validates: Requirements 17.5**
  - [x]* 6.5 Escrever property test do limite de exportação
    - **Property 32: Limite de exportação**
    - **Validates: Requirements 17.7**
  - [x] 6.6 Implementar `lib/leads/triage.ts`
    - `buildTriageLead(company)`: `RAW`, `companyId`, `companyName`, `contactInfo` (telefone | website não vazios), `segment` = rótulo do nicho, `actionPlan` pela categoria ou padrão, `assignedTo`
    - _Requirements: 15.1, 15.2, 15.6_
  - [x]* 6.7 Escrever property test do lead de triagem
    - **Property 29: Lead de triagem derivado da empresa**
    - **Validates: Requirements 15.1, 15.2, 15.6**
  - [x] 6.8 Implementar `lib/leads/filters.ts`
    - `runInputSchema`/`validateRunInput` (expansão de preset, strip de campos desconhecidos), `buildRunParamsKey`, `finalizeDiscovery`, `canOpenRanking`, `buildRankingQuery`, `companyFiltersSchema`, `bulkIdsSchema`, `runsListSchema`, `buildCompanyWhere` (texto sempre `mode: 'insensitive'`), `RANKING_ORDER`, `compareRanking`, `matchesRunSearch`, `selectMapPoints`
    - _Requirements: 8.10, 10.3, 10.4, 11.2, 11.3, 11.7, 12.1, 12.2, 12.3, 12.9, 12.10, 12.11, 13.1, 13.2, 18.5, 18.6, 18.7, 18.9, 2.11, 2.13, 8.13, 10.11, 10.12, 11.5, 11.9_
  - [x]* 6.9 Escrever property test da validação da mineração
    - **Property 19: Validação dos parâmetros de mineração**
    - **Validates: Requirements 8.10, 10.3, 18.4, 18.5**
  - [x]* 6.10 Escrever property test de filtros e seleção em lote
    - **Property 20: Validação de filtros e seleção em lote**
    - **Validates: Requirements 11.7, 15.12, 16.7, 18.5, 18.6**
  - [x]* 6.11 Escrever property test de busca case-insensitive
    - **Property 21: Busca textual sempre case-insensitive**
    - **Validates: Requirements 18.9, 12.3**
  - [x]* 6.12 Escrever property test da busca do histórico
    - **Property 26: Busca do histórico de minerações**
    - **Validates: Requirements 11.2**
  - [x]* 6.13 Escrever property test da ordenação do ranking
    - **Property 27: Ordenação do ranking**
    - **Validates: Requirements 12.1, 17.1**
  - [x]* 6.14 Escrever property test dos pontos do mapa
    - **Property 28: Seleção de pontos do mapa**
    - **Validates: Requirements 13.1, 13.2**
  - [x]* 6.15 Escrever property test da chave de parâmetros
    - **Property 33: Chave de parâmetros da mineração**
    - **Validates: Requirements 18.7, 18.12, 10.4**
  - [x]* 6.16 Escrever property test do desfecho da descoberta
    - **Property 34: Desfecho da descoberta**
    - **Validates: Requirements 2.11, 2.13, 8.13**
  - [x]* 6.17 Escrever property test do link para o ranking
    - **Property 35: Link para o ranking a partir de uma mineração**
    - **Validates: Requirements 10.11, 10.12, 11.5, 11.9**
  - [x]* 6.18 Escrever property test da faixa de score inválida
    - **Property 36: Faixa de score inválida ignora só esse filtro**
    - **Validates: Requirements 12.9, 12.10, 12.11**

- [x] 7. Guarda_SSRF
  - [x] 7.1 Implementar `lib/leads/net/ssrf.ts`
    - `validateUrlShape` (esquema, porta, credenciais inclusive `@` vazio na authority original), `isBlockedAddress` com `ipaddr.js` (bloqueia tudo que não for `unicast`, IPv4 mapeado/NAT64 reavaliado, 6to4/teredo bloqueados), `BLOCKED_HOSTNAMES`, `Resolver`, `resolveAndValidate`
    - _Requirements: 4.1, 4.2, 4.3, 4.11_
  - [x] 7.2 Escrever testes unitários da Guarda_SSRF
    - Rejeição: esquema `ftp:`/`file:`; porta 8080; `user@`, `user:pass@`, `:@`; um endereço de cada faixa de Endereco_Bloqueado (incl. `::ffff:127.0.0.1`, `169.254.169.254`, `metadata.google.internal`); notações `2130706433`, `0x7f.1`, `0177.0.0.1`; host com um IP privado entre públicos; DNS vazio → `DNS`
    - Aceitação de `https://exemplo.com.br` resolvendo para IP público
    - Criar `tests/lead-miner/support/fake-net.ts` (`fakeResolver`, `fakeTransport` que grava requisições) e `arb-ip.ts` (`arbIpv4Blocked`, `arbIpv4Public`, `arbIpv6Blocked`)
    - _Requirements: 20.4, 4.1, 4.2, 4.3, 4.11_
  - [x]* 7.3 Escrever property test da forma da URL
    - **Property 9: Forma da URL na Guarda_SSRF**
    - **Validates: Requirements 4.1, 4.2**
  - [x]* 7.4 Escrever property test do bloqueio por endereço
    - **Property 10: Bloqueio por endereço resolvido**
    - **Validates: Requirements 4.3, 4.8**

- [x] 8. Checkpoint — módulos puros
  - Rodar `npm test` e `npm run build`; ensure all tests pass, ask the user if questions arise.

- [x] 9. Adaptadores de I/O
  - [x] 9.1 Implementar `lib/leads/net/http-transport.ts`
    - `Transport`, `TransportError`, `nodeTransport` com `lookup` fixado no IP validado (`opts.all` → array), `servername` = hostname, `Host`/`User-Agent`/`Accept` apenas, `rejectUnauthorized: true`, `agent: false`, corte do corpo em `MAX_BODY_BYTES` via `req.destroy()`
    - Extrair `mapNodeError(err)` puro (códigos de certificado, `ECONNREFUSED`, `ECONNRESET`, abort)
    - _Requirements: 4.4, 4.6, 4.9, 3.3, 3.4_
  - [x]* 9.2 Escrever testes unitários de `mapNodeError`
    - `CERT_HAS_EXPIRED` → EXPIRADO; `ERR_TLS_CERT_ALTNAME_INVALID` → DOMINIO_DIVERGENTE; autoassinado → NAO_CONFIAVEL; recusa, reset e abort
    - _Requirements: 3.3, 3.4_
  - [x] 9.3 Implementar `lib/leads/site-analyzer.ts`
    - `analyzeSite(website, deps)`: sem site sem rede; URL inválida sem rede; candidatos `https://`→`http://`; orçamento total de 10 s e sub-limite de 6 s (`AbortSignal.any`); regra de fallback; redirecionamentos manuais (≤ 3, cada salto com `validateUrlShape` + `resolveAndValidate`); `online` 100–399; `HTTP_ERRO` "HTTP {s}"; latência até cabeçalhos finais; `slow`; `sslProblem` preservado
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.4, 4.5, 4.7, 4.8, 4.10, 4.11_
  - [x] 9.4 Escrever testes unitários do Analisador_de_Site
    - Redirecionamento para `http://10.0.0.1/` → offline "destino bloqueado" sem requisição ao destino; 4º redirecionamento → excesso; orçamento esgotado durante `https://` → nenhum `http://`, motivo TIMEOUT; status 99 e 400 → offline "HTTP …"; sem site e URL inválida sem chamadas ao resolver/transporte
    - _Requirements: 20.4, 4.5, 4.8, 4.10, 3.5, 3.8, 3.9, 3.10_
  - [x]* 9.5 Escrever property test da resposta final
    - **Property 6: Resultado da análise para uma resposta final**
    - **Validates: Requirements 3.1, 3.6, 3.7, 3.10, 1.5, 1.6**
  - [x]* 9.6 Escrever property test do fallback de esquema
    - **Property 7: Fallback de esquema e falhas de conexão**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.9**
  - [x]* 9.7 Escrever property test de entradas sem tráfego
    - **Property 8: Entradas que não geram tráfego**
    - **Validates: Requirements 3.5, 3.8**
  - [x]* 9.8 Escrever property test da cadeia de redirecionamentos
    - **Property 11: Cadeia de redirecionamentos segura**
    - **Validates: Requirements 4.4, 4.5, 4.8, 4.9, 4.10**
  - [x] 9.9 Implementar `lib/leads/sources/rate-limit.ts`
    - `RateLimiter`, `intervalLimiter(minIntervalMs, clock?)`, singleton `nominatimLimiter` em `globalThis.__nominatimLimiter`
    - _Requirements: 2.2_
  - [x]* 9.10 Escrever property test do espaçamento do Nominatim
    - **Property 2: Espaçamento do Nominatim**
    - **Validates: Requirements 2.2**
  - [x] 9.11 Implementar `lib/leads/sources/osm.ts`
    - `geocode` (relation → area `3600000000+id`, way → `2400000000+id`, node → bbox; limitador em todas as tentativas; 15 s; retentativas 2 s/4 s), `buildOverpassQuery`, `mapElement`, `searchNiche` (60 s, retentativas), `mergeByOsmId`, `excludeChains`; User-Agent em todas as requisições
    - Criar `tests/lead-miner/support/fake-osm.ts` (`fakeHttpJson(script)`, `arbOverpassElement`)
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 2.10, 2.12_
  - [x]* 9.12 Escrever testes unitários da Fonte_OSM
    - Nominatim sem resultado → `NAO_ENCONTRADO` sem chamada ao Overpass; indisponível após 3 tentativas → `INDISPONIVEL`; relation → `area`; node → `bbox`
    - _Requirements: 2.1, 2.7, 2.10_
  - [x]* 9.13 Escrever property test de consultas e retentativas
    - **Property 3: Consultas Overpass, retentativas e User-Agent**
    - **Validates: Requirements 2.3, 2.4, 2.8**
  - [x]* 9.14 Escrever property test do mapeamento OSM
    - **Property 4: Mapeamento de elementos OSM**
    - **Validates: Requirements 2.5, 2.6**
  - [x]* 9.15 Escrever property test do pré-processamento da descoberta
    - **Property 5: Pré-processamento dos resultados da descoberta**
    - **Validates: Requirements 2.9, 2.12**
  - [x] 9.16 Implementar `lib/leads/usage.ts`
    - `monthKey(d)`; `prismaUsageGate(db)` com o `INSERT … ON CONFLICT … WHERE count < $3 RETURNING count` via `$queryRaw` parametrizado
    - _Requirements: 7.4, 7.6_
  - [x] 9.17 Implementar `lib/leads/ai.ts`
    - `GeminiClient`, `UsageGate`, `AiDeps`, `buildPrompt`, `parseAiResponse` (validação e clamp half-up 0–35), `analyzeWithAi` (sem cliente → "IA desabilitada"; reserva antes do envio; cota → "cota esgotada"; timeout 20 s; nunca lança)
    - Criar `tests/lead-miner/support/fake-ai.ts` (`memoryUsageGate`, `fakeGemini`)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_
  - [x]* 9.18 Escrever testes unitários do Analisador_IA
    - Timeout de 20 s com relógio falso; sem chave → "IA desabilitada"; cota esgotada não chama o cliente
    - _Requirements: 7.3, 7.6_
  - [x]* 9.19 Escrever property test da resposta da IA
    - **Property 17: Validação da resposta da IA**
    - **Validates: Requirements 7.2, 7.3**
  - [x]* 9.20 Escrever property test da cota do Gemini
    - **Property 18: Uso de cota do Gemini**
    - **Validates: Requirements 7.1, 7.4, 7.6**
  - [x] 9.21 Implementar `lib/leads/deps.ts` e variáveis de ambiente
    - `import 'server-only'`; resolver real (`dns.promises.lookup` com `all`/`verbatim`), `nodeTransport`, cliente HTTP JSON com `fetch` + timeout, `nominatimLimiter`, cliente Gemini (`x-goog-api-key` no cabeçalho, `responseMimeType: 'application/json'`, `GEMINI_MODEL` padrão `gemini-2.0-flash`), `prismaUsageGate`, `geminiMonthlyLimit(process.env.GEMINI_MONTHLY_LIMIT)`
    - Documentar `GEMINI_API_KEY`, `GEMINI_MONTHLY_LIMIT`, `GEMINI_MODEL` em `.env.example` (sem valores reais)
    - _Requirements: 1.9, 7.1, 18.10, 20.6_

- [x] 10. Checkpoint — adaptadores
  - Rodar `npm test` e `npm run build`; ensure all tests pass, ask the user if questions arise.

- [x] 11. Repositório e pipeline
  - [x] 11.1 Implementar `lib/leads/repository.ts`
    - `upsertFoundCompany` (candidatos por identificador ou `nomeNormalizado` + caixa ±0,0015°, `matchCompany`, `mergeCompanyFields`, strings vazias → `null`, create em SAVEPOINT com tratamento de P2002 reconsultando a vencedora; vínculo `ON CONFLICT (runId, companyId) DO NOTHING`)
    - `claimBatch` (SQL `FOR UPDATE SKIP LOCKED`, claim expirado > 90 s), `releaseClaims`, `persistAnalysis` (transação: MRC por token → análise → snapshot → `processados`/CONCLUIDA), `persistFailure`
    - _Requirements: 8.3, 8.5, 8.7, 8.9, 8.14, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.12, 9.14, 9.15_
  - [x] 11.2 Implementar `lib/leads/pipeline.ts`
    - `createRun` (validação, `paramsKey`, `bairroNorm`/`cidadeNorm`, IA sem chave → `iaEnabled=false` + `SEM_CHAVE`, 409 com `runId` inclusive em P2002 do índice parcial)
    - `discoverStep` (lease `lockedUntil`, geocode e mensagens de ERRO, nichos até o deadline, `excludeChains`, `nichosProcessados`/`nichosFalhos`, `finalizeDiscovery`, `total = count(MRC)`)
    - `runBatch` (no-op fora de EM_ANDAMENTO, claim de 10, concorrência 3, margem de 32 s antes de iniciar cada empresa, `analyzeSite` → `classify` → `analyzeWithAi` → `score` → `persistAnalysis`/`persistFailure`, liberação de claims, ERRO em falha de banco)
    - `toRunProgress` com `novos`/`existentes`
    - _Requirements: 2.1, 2.7, 2.10, 2.11, 2.13, 7.7, 7.8, 7.9, 8.1, 8.2, 8.3, 8.4, 8.5, 8.8, 8.9, 8.11, 8.13, 18.4, 18.7, 18.12_
  - [x]* 11.3 Escrever testes unitários do pipeline com dependências falsas
    - Lote não inicia empresa com orçamento restante < 32 s e libera os claims; `createRun` com IA pedida e cliente nulo grava `iaEnabled=false` e `SEM_CHAVE` (repositório substituído por fake)
    - _Requirements: 8.4, 7.7, 7.9_
  - [x]* 11.4 Escrever testes de integração do repositório/pipeline (Postgres)
    - `tests/lead-miner/integration/pipeline.int.test.ts`, habilitado com `RUN_DB_TESTS=1` e `DATABASE_URL_TEST`, aplicando `prisma migrate deploy`
    - 5 lotes simultâneos com 37 empresas → 37 análises e CONCLUIDA; lote com claims reservados é pulado; claim expirado → `LOST_CLAIM`; corrida de `osmId` → 1 Company e vínculo `isNew=false`; nicho parcial falho → CONCLUIDA com `nichosFalhos`; `total = 0` → CONCLUIDA; rollback de análise+snapshot; migração preserva índices parciais e `ProspectLead.companyId` nulo
    - _Requirements: 8.3, 8.5, 8.7, 8.13, 8.14, 9.5, 9.6, 9.8, 9.9, 9.11, 9.12, 9.13, 9.14, 9.15, 2.13_

- [x] 12. Rotas de API `/api/tools/lead-miner/**`
  - [x] 12.1 Criar helper `lib/leads/route-helpers.ts`
    - `requireNegocios(actor)` (assert com a mensagem 403 do design), `parseQuery(schema, url)` e `parseBody(schema, req)` que lançam `badRequest` com `fields`
    - _Requirements: 18.1, 18.3, 18.5, 18.6, 18.11_
  - [x] 12.2 Implementar rotas de mineração
    - `GET config/route.ts` (`{ iaAvailable }`), `runs/route.ts` (POST 201/400/409; GET lista com busca normalizada via `matchesRunSearch` sobre autores, filtros, paginação de 20, `novos`), `runs/active/route.ts`, `runs/lookup/route.ts`, `runs/[id]/route.ts`
    - _Requirements: 7.5, 8.1, 8.6, 8.10, 10.4, 11.1, 11.2, 11.3, 11.4, 11.8, 18.1, 18.4, 18.5, 18.7, 18.12_
  - [x] 12.3 Implementar rotas de execução
    - `runs/[id]/discover/route.ts` e `runs/[id]/batch/route.ts`: 404 inexistente, 403 se não autor (antes de qualquer efeito), deadline `t0 + DISCOVERY_BUDGET_MS`/`BATCH_BUDGET_MS`, `deps.ts`
    - _Requirements: 8.3, 8.4, 8.11, 8.12, 18.1_
  - [x] 12.4 Implementar rotas de consulta de empresas
    - `companies/route.ts` (página de 50, `RANKING_ORDER`, total), `companies/map/route.ts` (até 2.000 pontos válidos, `shown`/`total`), `companies/[id]/route.ts` (`CompanyDetail` com análises desc., minerações desc. com `nichosFalhos`, lead vinculado; 404)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 14.1, 14.2, 14.3, 14.5, 14.6, 14.11, 18.9_
  - [x] 12.5 Implementar `companies/export/route.ts`
    - Por `ids` (1–200) ou por `filters`; ordenação do ranking; `limitExport(5000)`; `text/csv; charset=utf-8`, `Content-Disposition`, `X-Export-Total`, `X-Export-Truncated`; 404 "Não há empresas para exportar."
    - _Requirements: 17.1, 17.2, 17.3, 17.7, 17.8, 17.9_
  - [x] 12.6 Implementar `companies/triage/route.ts`
    - `bulkIdsSchema` (400 "Selecione de 1 a 200 empresas."), `$transaction` com `buildTriageLead` + `createManyAndReturn({ skipDuplicates: true })`, `audit('LEAD_MINER_SENT_TO_TRIAGE')` por lead criado, `{ created, ignored }`
    - _Requirements: 15.1, 15.3, 15.4, 15.5, 15.6, 15.9, 15.10, 15.11, 15.12, 18.8_
  - [x] 12.7 Implementar rotas de responsável
    - `assignees/route.ts` (403 se não Atribuidor), `companies/assign/route.ts` (`canAssignLeads`, destino `canBeLeadAssignee`, ids existentes, `canChangeLeadAssignee` por empresa antes da transação, atualiza Company e ProspectLead, audit `LEAD_MINER_ASSIGNED` só quando muda), `companies/[id]/claim/route.ts` (`updateMany where assignedTo: null`, 409 com responsável atual, audit `LEAD_MINER_CLAIMED`)
    - _Requirements: 12.8, 14.9, 14.10, 16.1, 16.2, 16.3, 16.4, 16.5, 16.7, 16.8, 18.4, 18.8, 18.11_
  - [x]* 12.8 Escrever testes de integração das rotas (Postgres)
    - `tests/lead-miner/integration/routes.int.test.ts` com `RUN_DB_TESTS=1`: 401 sem sessão e 403 sem permissão em todas as rotas, sem escrita e sem `AuditLog`; triagem com 0 e 201 ids → 400; POSTs idênticos concorrentes → 201 + 409; parâmetros diferentes → 201; triagem concorrente cria 1 lead e rollback em erro; dois "Assumir" simultâneos → 200 + 409; atribuição com falha → rollback; regressão RAW → PENDING → card para leads com e sem `companyId`
    - _Requirements: 15.4, 15.8, 15.10, 15.12, 16.4, 16.8, 18.1, 18.2, 18.3, 18.7, 18.11, 18.12_

- [x] 13. Checkpoint — backend completo
  - Rodar `npm test` e `npm run build`; ensure all tests pass, ask the user if questions arise.

- [x] 14. Interface
  - [x] 14.1 Criar componentes compartilhados em `components/lead-miner/`
    - `LeadMinerGate` (skeleton; sem `canUseNegociosTools` exibe "Acesso negado — o Minerador de Leads é exclusivo de Negócios e da Presidência." e não monta os filhos), `PriorityBadge` (texto + cor), `FailedNichesNote`, `NoAiNote`, `OdblAttribution`, `Pagination`; cliente `lib/leads/client-api.ts` com `fetch` tipado e mensagens em português
    - Estilo: `bg-slate-950`, gradiente `from-purple-600 to-indigo-600`, cards `rounded-2xl border-slate-800`, `lucide-react`, `sonner`, `focus-visible:ring-2 ring-purple-500`
    - _Requirements: 19.4, 19.5, 19.6, 19.7, 2.14, 2.15, 2.16, 2.17, 7.10, 7.11, 12.6, 14.8_
  - [x] 14.2 Implementar hooks e `RunProgressCard`
    - `hooks/lead-miner/useRunDriver.ts`, `useRunDrivers.ts`, `useActiveRuns.ts` (uma requisição por vez por mineração, `AbortController` no unmount, retentativa em 5 s com "Reconectando…", toast de conclusão com link, erro)
    - `RunProgressCard` com barra gradiente, `processados/total`, etapa, novos/existentes, `FailedNichesNote`, `NoAiNote`, erro e link via `canOpenRanking`; `aria-live="polite"`
    - _Requirements: 8.6, 8.15, 10.7, 10.8, 10.9, 10.11, 10.12_
  - [x] 14.3 Implementar a Tela_Minerar `app/tools/lead-miner/page.tsx`
    - `MiningForm` (campos rotulados, `<select>` com 27 UFs, `PresetPicker`, `NicheChecklist` por tier, "excluir redes", "usar IA" desabilitada com "IA indisponível: chave não configurada"), botão desabilitado com indicação de campo pendente e durante o envio, erros 400 por campo mantendo valores, 409 passa a acompanhar o `runId`
    - `PreviousRunNotice` (debounce 400 ms em `/runs/lookup`, "Bairro já minerado em DD/MM por Fulano (N leads)", ações "Ver" e "Remineirar"); lista de `RunProgressCard` via `useActiveRuns`/`useRunDrivers`
    - _Requirements: 7.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.10, 8.15_
  - [x] 14.4 Implementar a Tela_Mineracoes `app/tools/lead-miner/runs/page.tsx`
    - `RunsFilters` (busca debounce 300 ms, UF, status, fonte, datas com validação local), `RunsTable` (data DD/MM/AAAA HH:mm, autor, fonte, status, total, novos, `FailedNichesNote`, `NoAiNote`, link só quando `canOpenRanking`), `Pagination`, estado vazio, cards de progresso das minerações ativas do autor
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.9, 2.15, 7.11, 8.6, 8.15_
  - [x] 14.5 Implementar `components/lead-miner/CompanyMap.tsx`
    - Leaflet puro, `leaflet/dist/leaflet.css`, `tileLayer` com Atribuicao_ODbL, `tileerror` → "Não foi possível carregar o mapa", `circleMarker` nas 4 cores, legenda textual, `fitBounds`, popup com nome, categoria, score, prioridade (ou "—") e link para a Ficha, aviso de exibidos/total, estado sem localização
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 19.7_
  - [x] 14.6 Implementar a Tela_Ranking `app/tools/lead-miner/leads/page.tsx`
    - Filtros sincronizados com a query string (volta à página 1), `buildRankingQuery` marcando a faixa inválida, alternância Lista/Mapa com `dynamic(() => import('CompanyMap'), { ssr: false })`, `RunFilterBanner` com `FailedNichesNote`, `RankingTable` (checkbox com `aria-label="Selecionar {nome}"`, `PriorityBadge`), `BulkActionsBar` (limite 1–200, "Atribuir" só para Atribuidor, exportação por seleção ou filtros com download e avisos de truncado/vazio), `AssignDialog` (`/assignees`), toasts de triagem e atribuição atualizando as linhas, `OdblAttribution`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 13.9, 15.5, 15.7, 15.10, 16.6, 16.8, 16.9, 17.1, 17.7, 17.8, 2.16_
  - [x] 14.7 Implementar a Ficha_Empresa `app/tools/lead-miner/leads/[id]/page.tsx`
    - `CompanyHeader` ("não informado", "não enviada para triagem"), `SiteDiagnosis` ("sem site"), `ScoreBreakdownCard` (IA "não aplicado" e fórmula reescalada), `AiInsight`, `AnalysisHistory` (DD/MM/AAAA HH:mm; "empresa ainda não analisada"), `CompanyRuns` com `FailedNichesNote`, `ClaimLeadButton` (aviso após 2 s, 409 com responsável atual, erro reabilita), `OdblAttribution` quando `fonte = OSM`, estado "Empresa não encontrada"
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 14.12, 14.13, 16.3, 16.4, 2.17_
  - [x] 14.8 Integrar o card "Minerador de Leads" em Negócios → Ferramentas
    - `app/tools/page.tsx`: trocar "Minerador de Leads B2B (em breve)" por card ativo com link para `/tools/lead-miner`
    - `app/setores/[dept]/page.tsx` (aba TOOLS): remover o placeholder "Enriquecedor de Dados B2B SciTec" e adicionar o card como `<Link>` (Enter nativo, Espaço via `onKeyDown`)
    - Nos dois lugares, renderizar somente se `canUseNegociosTools(currentProfile)`
    - _Requirements: 19.1, 19.2, 19.3, 19.8_
  - [x]* 14.9 Escrever testes de componentes
    - Adicionar `@testing-library/react` e `jsdom` pinados; `LeadMinerGate` não dispara fetch sem permissão; formulário desabilita "Iniciar" e mantém valores após erro; `BulkActionsBar` oculta "Atribuir"; `FailedNichesNote`/`NoAiNote`; `ClaimLeadButton` com timers falsos; `useRunDrivers` nunca tem duas requisições simultâneas para o mesmo `runId`
    - _Requirements: 19.4, 10.3, 10.10, 16.6, 2.14, 7.10, 14.12, 14.13, 8.15_

- [x] 15. Checkpoint final
  - Rodar `npm test` (zero falhas, sem rede) e `npm run build` (sem erros); ensure all tests pass, ask the user if questions arise.
  - _Requirements: 20.7, 20.8_

- [ ] 16. Registro da entrega e PR
  - [x] 16.1 Atualizar `docs/PLANO-INTEGRACAO.md`
    - Seção 8: marcar a Etapa 1 como concluída na coluna "Status", com a data e a branch
    - Registrar a limitação do limitador do Nominatim por processo (Cloud Run `max-instances=1` ou lease no banco na Etapa 4)
    - _Requirements: 20.9, 20.10_
  - [-] 16.2 Commitar e abrir o PR para `main`
    - Stage de arquivos específicos (sem `.env`); `git push -u origin etapa-1-minerador`; `gh pr create --base main` com resumo, resultado de `npm test`/`npm run build`, checklist do Req. 20 (incluindo a seção 8 atualizada) e roteiro de verificação manual das telas e de acessibilidade
    - _Requirements: 20.8, 20.9, 20.10_

## Notes

- Tarefas com `*` são opcionais. Os testes exigidos pelo Requisito 20 (1.3, 4.2, 4.5, 5.2, 5.5, 6.2, 6.3, 7.2, 9.4) não são opcionais.
- Cada propriedade das Correctness Properties tem sub-tarefa própria e arquivo próprio (`{modulo}.p{N}.property.test.ts`), uma pequena variação dos nomes de arquivo do design para permitir execução paralela sem conflito.
- Testes de integração com Postgres (11.4, 12.8) ficam pulados sem `RUN_DB_TESTS=1`; exigem um banco descartável (branch Neon ou Postgres local).
- Validação completa de WCAG exige teste manual com tecnologias assistivas; o roteiro fica no PR.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "3.2", "3.5"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.6", "4.1", "4.4", "5.1", "6.1", "6.6", "6.8", "7.1"] },
    { "id": 4, "tasks": ["4.2", "4.5", "5.2", "6.2", "6.7", "6.9", "6.10", "6.11", "6.12", "6.13", "6.14", "6.15", "6.16", "6.17", "6.18", "7.2", "9.1", "9.9", "9.16"] },
    { "id": 5, "tasks": ["4.3", "4.6", "4.7", "4.8", "4.9", "5.3", "5.4", "5.5", "6.3", "6.4", "6.5", "7.3", "7.4", "9.2", "9.3", "9.10", "9.11", "9.17"] },
    { "id": 6, "tasks": ["9.4", "9.12", "9.13", "9.14", "9.15", "9.18", "9.19", "9.20", "9.21"] },
    { "id": 7, "tasks": ["9.5", "9.6", "9.7", "9.8", "11.1"] },
    { "id": 8, "tasks": ["11.2"] },
    { "id": 9, "tasks": ["11.3", "12.1"] },
    { "id": 10, "tasks": ["11.4", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "14.1"] },
    { "id": 11, "tasks": ["12.8", "14.2", "14.5", "14.8"] },
    { "id": 12, "tasks": ["14.3", "14.4", "14.6", "14.7"] },
    { "id": 13, "tasks": ["14.9"] },
    { "id": 14, "tasks": ["16.1"] },
    { "id": 15, "tasks": ["16.2"] }
  ]
}
```
