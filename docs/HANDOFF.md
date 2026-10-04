# Handoff — SciTec jr. (Minerador de Leads, pós-Etapa 3)

Atualizado ao fim dos ajustes pós-etapa 3 (T1–T6). Leia junto com `docs/PLANO-INTEGRACAO.md` (seção 8.4 e 8.4.1) e `AGENTS.md`.

## Onde estamos

- Branch de trabalho: `etapa-3-melhorias` (a partir de `etapa-2-paineis`). **Nada foi enviado ao remoto** (sem `git push`) e **o PR ainda não foi aberto**. As PRs das Etapas 0–2 também estão pendentes; o PR desta branch deve ter base `etapa-2-paineis` (retargetar para `main` depois).
- Etapa 3 (spec `.kiro/specs/lead-miner-enrichment/`) concluída. Depois dela, cinco ajustes sem spec, um commit `[kiro] T<n>: ...` cada:

| Tarefa | Resultado | Migração |
|---|---|---|
| T1 Parar mineração | status `CANCELADA`, `POST /runs/[id]/cancel`, botão "Parar" (Minerar e Minerações), aborta a análise em curso | `20261016000000_mining_run_cancelada` |
| T2 Localização em cascata | UF → Cidade (IBGE) → Bairro (OSM), comboboxes, caches em memória, digitação livre como fallback | nenhuma |
| T4 Abas com/sem contato | `Company.temContato` (trigger), `emailOsm`, filtro `contato`, contadores por filtro | `20261017000000_company_tem_contato` |
| T3 Resultados progressivos | polling de 3 s, selo "analisando…", ordem `recentes`, contadores ao vivo, coluna "Contato" | nenhuma |
| T5 Avaliação dos sem contato | Gemini em lote (10), teto 30 por mineração, fallback por regras "sem IA", botão "Avaliar", seção na Ficha | `20261018000000_company_avaliacao` |
| T6 Documentação | `PLANO-INTEGRACAO.md` 8.4.1 e este arquivo | — |

Detalhes, decisões e limitações de cada uma: `docs/PLANO-INTEGRACAO.md`, seção 8.4.1.

## Como validar

```bash
export PATH=$HOME/.local/bin:$PATH
npx prisma migrate deploy      # aplica as 3 migrações novas (aditivas, não destrutivo)
npx prisma generate
npx tsc --noEmit
npm test                       # offline; não usa RUN_DB_TESTS
npm run build
npm run dev                    # http://localhost:3000 (login de testes: joao.vaz@scitecjr.com)
```

Testes novos em `tests/lead-miner-ajustes/` (cancelamento, localidades, cascata do formulário, contato, resultados ao vivo, avaliação). As rotas novas também estão no teste de propriedade `routes-enrichment.p45` (401/403 sem efeitos).

Roteiro manual (Negócios, com `npm run dev`):

1. `/tools/lead-miner`: escolher UF, depois cidade (autocomplete), depois bairro; iniciar uma mineração e clicar em **Parar**.
2. `/tools/lead-miner/leads?runId=<id>` com a mineração rodando: lista atualizando a cada ~3 s, selo "analisando…", contadores ao vivo.
3. Abas **Com contato (N)** / **Sem contato (M)** e exportação CSV / mapa seguindo a aba.
4. Aba Sem contato: botão **Avaliar**; abrir a Ficha de um lead avaliado.

## Variáveis de ambiente

As mesmas do `.env.example`; nenhuma nova. Sem `GEMINI_API_KEY` a avaliação dos sem contato usa regras (rótulo "sem IA"). IBGE e Overpass não exigem chave. Nunca commitar `.env`.

## Pendente / próximos passos

- Abrir o PR de `etapa-3-melhorias` (base `etapa-2-paineis`) e fazer o `git push` quando o usuário autorizar.
- Decisões em aberto com o usuário:
  - e-mail de contato hoje vem só da tag OSM; extrair e-mail do site exige decidir sobre guardar dado pessoal (LGPD);
  - avaliação automática depende do navegador aberto ao concluir a mineração; se precisar rodar sem ninguém na tela, mover para um job/cron na Etapa 4.
- Etapa 4 (deploy) continua a fazer. Lembretes: limitadores em memória (Nominatim, BrasilAPI) e os caches de cidades/bairros são por instância (Cloud Run com `max-instances=1` ou mover para o banco); a purga do Cache_Google continua oportunista.
- Nomes das migrações: as três novas usam datas a partir de `20261016` para ficar depois de `20261015000000_lead_miner_enrichment`, não a data real do dia (regra de `AGENTS.md`). Se o time preferir a data real, é preciso renomear antes de qualquer deploy em banco que ainda não as aplicou.

## Bloqueios

_Nenhum._

## Atenção com testes de integração

Os testes com `RUN_DB_TESTS=1` (`tests/**/integration/`) apagam linhas (`deleteMany` em `Company`, `CompanyAnalysis` etc.) no banco apontado por `DATABASE_URL_TEST` ou, na falta dele, por `DATABASE_URL`. Durante os ajustes pós-etapa 3 (na T1), execuções com `RUN_DB_TESTS=1` e um script de verificação rodaram `deleteMany` no banco de desenvolvimento local (`scitec_dev`), apagando linhas de `Company`, `CompanyAnalysis` e tabelas relacionadas. O que havia nelas não foi conferido antes nem recuperado depois; se aquele banco tinha dados que importavam, restaure a partir de backup ou refaça as minerações. **Use sempre um banco descartável em `DATABASE_URL_TEST`.** Nenhum teste desta entrega usa `RUN_DB_TESTS`.
