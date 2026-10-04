# Texto do PR — Etapa 3 (Minerador de Leads: enriquecimento + ajustes de UX)

> Rascunho pronto para colar. O PR **não foi aberto** e nada foi enviado ao remoto.
> Base sugerida: `etapa-2-paineis` (as PRs das Etapas 0–2 ainda não foram mergeadas; retargetar para `main` depois). Branch: `etapa-3-melhorias`.

## Título

```
Etapa 3: enriquecimento do Minerador de Leads + ajustes T1-T5
```

## Resumo

### Etapa 3 - enriquecimento

Spec em `.kiro/specs/lead-miner-enrichment/`; registro em `docs/PLANO-INTEGRACAO.md` seção 8.4.

- **Google Places** com cache de 30 dias (só o Place_ID fica guardado em definitivo) e fallback para OpenStreetMap; fonte `MISTA` por padrão. Conteúdo do Google nunca vai para o mapa, o CSV nem a triagem.
- **PageSpeed Insights**: nota de desempenho abaixo de 50 soma +7 pontos na presença digital (`Versao_Score` 2).
- **CNPJ** via BrasilAPI (inclui CNPJ alfanumérico; razão social nunca vai para a IA; CNPJ de outra UF vira candidato, não é aplicado).
- **Sinais digitais**: Instagram, WhatsApp e tecnologias detectadas no site e nas tags do OSM.
- **Mensagem de abordagem** por IA (Gemini) com modelo fixo como reserva; **reanálise** por empresa com lease atômico.
- Cotas mensais por provedor em `ApiUsage` (`places`, `pagespeed`, `gemini`); chaves só no servidor.
- Migração `20261015000000_lead_miner_enrichment`.

### Ajustes de UX T1-T5

Sem spec própria (`docs/PLANO-INTEGRACAO.md` seção 8.4.1). Um commit `[kiro] T<n>` por ajuste, seguidos de correções da revisão (`[kiro] P<n>`).

- **T1 Parar mineração**: status `CANCELADA`, `POST /runs/[id]/cancel` (quem iniciou, gerência de Negócios e Presidência/Vice; idempotente; 409 se já terminou), botão "Parar" com confirmação, "Cancelada (N de M processados)". Leads já salvos permanecem. *(P2)* O cancelamento também interrompe a **descoberta em voo**: o `AbortSignal` chega às requisições de Nominatim, Overpass e Google Places e à espera entre retentativas.
- **T2 Localização em cascata**: UF → Cidade (IBGE) → Bairro (OpenStreetMap), cada campo só habilita após o anterior, comboboxes acessíveis com busca sem acento; se as listas falharem vira digitação livre e a mineração nunca é bloqueada.
- **T4 Abas Com contato / Sem contato**: `Company.temContato` mantido por trigger do Postgres, `emailOsm`, filtro `contato`, contadores respeitando os filtros, CSV e mapa seguem a aba. *(P4)* A regra mora na função SQL `company_set_tem_contato()` e em `temContato()` (`lib/leads/contact.ts`); as duas foram alinhadas (antes divergiam em tab/quebra de linha) e devem mudar juntas.
- **T3 Resultados progressivos**: a lista atualiza a cada ~3 s durante a mineração, selo "analisando…", ordem por mais recentes enquanto roda, contadores ao vivo (encontradas, com contato, analisadas) e coluna "Contato".
- **T5 Avaliação básica dos Sem contato**: Gemini em lote (até 10 por chamada), teto de 30 por mineração, respeita `GEMINI_MONTHLY_LIMIT`, regras determinísticas rotuladas "sem IA" como reserva, botão "Avaliar" e seção na Ficha. *(P3)* O disparo automático agora é do **servidor**, uma única vez, na requisição de lote que conclui a mineração (marca atômica `MiningRun.avaliacaoIniciadaEm`).
- **P1 Proteção do banco de desenvolvimento**: testes de integração só contra `scitec_test` (`TEST_DATABASE_URL`, nome terminando em `_test`), `npm run test:int`, `assertTestDatabase` em todos os testes de integração e scripts destrutivos; o seed recusa bancos que não sejam `*_test` sem `SEED_CONFIRM_DB=<nome>`. Mudança de comportamento: `npm run db:seed` agora exige essa confirmação em `scitec_dev`.

**Migrações novas (todas aditivas):** `20261015000000_lead_miner_enrichment`, `20261016000000_mining_run_cancelada`, `20261017000000_company_tem_contato`, `20261018000000_company_avaliacao`, `20261019000000_mining_run_avaliacao_iniciada`, `20261020000000_tem_contato_whitespace`.

## Como testar

```bash
export PATH=$HOME/.local/bin:$PATH
npx prisma migrate deploy        # aplica as migrações novas
npx prisma generate
npx tsc --noEmit
npm test                         # offline, sem rede e sem chaves
npm run build
```

Integração (opcional, **somente** num banco descartável cujo nome termina em `_test`):

```bash
createdb scitec_test
cp .env.test.example .env.test   # ajuste TEST_DATABASE_URL (arquivo ignorado pelo git)
npm run test:int                 # = RUN_DB_TESTS=1 vitest run integration/
```

Roteiro manual (perfil de Negócios, `npm run dev`):

1. `/tools/lead-miner`: escolha UF, cidade (digite "sao jo" para ver a busca sem acento) e bairro; inicie uma mineração.
2. Clique em **Parar** durante a descoberta e durante a análise; a mineração fica "Cancelada (N de M processados)" e as empresas já salvas continuam no ranking.
3. `/tools/lead-miner/leads?runId=<id>` com a mineração rodando: lista atualizando, selo "analisando…", contadores ao vivo.
4. Alterne **Com contato (N)** e **Sem contato (M)**; exporte o CSV e abra o mapa em cada aba.
5. Ao concluir uma mineração, aba Sem contato: avaliações automáticas (até 30); botão **Avaliar** para o restante; Ficha de um lead avaliado.
6. Sem `GEMINI_API_KEY`: as avaliações saem como "Avaliação por regras (sem IA)".

## Limitações conhecidas

- **Descoberta só aborta com sinal**: o aborto imediato vale na instância que recebeu o "Parar"; em multi-instância depende do fallback no banco (vigia de 1,5 s e checagem do status entre nichos/páginas).
- **Cache e limitadores em memória por processo** (cidades, bairros, Nominatim, BrasilAPI): com várias instâncias o limite de 1 req/s pode ser excedido no agregado (decisão da Etapa 4).
- **A mineração depende do navegador do autor** (descoberta e análise avançam por chamadas da tela aberta). A avaliação automática é do servidor, mas só dispara quando o lote final chega; se ele consumir quase todo o orçamento de 60 s, os leads ficam sem avaliação (não são gravados por regras) e o botão "Avaliar" cobre.
- E-mail de contato vem só da tag OSM; a cobertura de bairros no OpenStreetMap varia (cidades pequenas costumam voltar vazias).
- Os testes de integração (incluindo o do trigger) não foram executados na revisão; estão validados por `tsc`, e o SQL do trigger por teste unitário.

## Pendências

- **Migrações com data futura** (`20261015` a `20261020`, contra a regra de data real do `AGENTS.md`). **Não renomear** antes de o dono confirmar que nenhum banco compartilhado as aplicou: renomear uma migração já aplicada quebra o histórico do Prisma desse banco.
- **E-mail do site (LGPD)**: extrair e guardar e-mail do HTML do site depende de decisão do dono (base legal, retenção, exposição na UI/CSV). Nada implementado.
- Rodar `npm run test:int` num `scitec_test` e aplicar as migrações `20261019` e `20261020` nos bancos usados pelo time.
- Etapa 4 (deploy): worker/cron se a mineração precisar rodar sem navegador aberto; limitadores e caches fora da memória; agendador da purga do Cache_Google.

## Pedido de revisão ao dono

Peço a revisão do dono do repositório (ver `.github/CODEOWNERS`) com atenção a:

1. Decisão sobre **renomear ou manter** as migrações com data futura (e confirmar se algum banco compartilhado já as aplicou).
2. Decisão sobre o **e-mail extraído do site** (LGPD).
3. A nova trava do **seed** (`SEED_CONFIRM_DB`) e a regra "integração só em `scitec_test`".
4. O disparo da avaliação automática dentro da rota de lote (`app/api/tools/lead-miner/runs/[id]/batch/route.ts`) e o consumo de cota do Gemini.

Detalhes e decisões: `docs/PLANO-INTEGRACAO.md` (8.4 e 8.4.1) e `docs/HANDOFF.md`.
