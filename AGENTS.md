# Diretrizes da SciTec jr.

## Trigger de Execução Rápida ("rodar")
Sempre que o usuário digitar "rodar", "iniciar" ou pedir para ligar a aplicação:
1. Execute o comando `export PATH=$HOME/.local/bin:$PATH && npm run dev` em segundo plano (`IsDaemon: true`).
2. Confirme que o servidor da SciTec jr. está ativo e forneça o link direto: [http://localhost:3000](http://localhost:3000).


## Convenção de agentes de IA

Este projeto foi iniciado com o Kiro e continuado com outros agentes. Para saber quem fez o quê:

- Branches do Kiro: `etapa-N-nome` (`etapa-0-fundacao`, `etapa-1-minerador`, `etapa-2-paineis`, `etapa-3-melhorias`).
- Branches do Antigravity: `antigravity/<descrição>`, criadas a partir da etapa em andamento.
- Commits do Antigravity começam com `[antigravity]`; PRs também.
- Nenhum agente commita direto em `main` ou nas branches `etapa-*`. Todo trabalho vai por branch própria e PR.
- Agentes que não são o Kiro não editam `.kiro/**/.config.kiro` nem `tasks.meta.json`. Podem marcar as caixas de `tasks.md` ao concluir tarefas.
- Contexto de produto e stack: `.kiro/steering/scitec-sistema.md`. Planos por etapa: `.kiro/specs/*`.

### Regras que valem para todos os agentes

- `lib/permissions.ts` é a fonte única das permissões; toda API verifica no servidor.
- Preserve os índices parciais do `prisma/schema.prisma`.
- Nunca commite `.env`, chaves ou segredos; chaves de API só no servidor.
- Migrações do Prisma usam a data real do dia no nome.
- Antes de abrir PR: `npm run build` e `npm test`.

### Banco de dados e testes de integração (regra inviolável)

- **Testes de integração só contra o banco `scitec_test`** (nome do banco SEMPRE terminando em `_test`). Eles apagam dados. Nunca aponte para `scitec_dev` nem para produção.
- Eles usam APENAS `TEST_DATABASE_URL` (ambiente ou `.env.test`, que é ignorado pelo git; modelo em `.env.test.example`). Nunca usam `DATABASE_URL`. Sem `TEST_DATABASE_URL` são pulados, com aviso.
- Comando exato: `npm run test:int` (equivale a `RUN_DB_TESTS=1 vitest run integration/`). **Não** rode `RUN_DB_TESTS=1 npm test` nem defina `RUN_DB_TESTS` apontando para outro banco.
- `tests/support/assert-test-db.ts` (`assertTestDatabase`) é chamado no `beforeAll` de todo teste de integração e no início de scripts que apagam dados. Novo teste de integração ou script destrutivo DEVE chamá-lo.
- `npm run db:seed` / `db:setup` apagam usuários, funis, tarefas e leads: o seed recusa qualquer banco que não termine em `_test` a menos que `SEED_CONFIRM_DB=<nome do banco>` seja informado (`prisma/seed-guard.ts`). Agentes de IA não rodam seed nem `prisma migrate reset`.
- Para retomar o trabalho sem histórico de chat, leia `docs/HANDOFF.md` (se existir) e os `tasks.md` das specs.