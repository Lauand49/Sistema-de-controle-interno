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
- Para retomar o trabalho sem histórico de chat, leia `docs/HANDOFF.md` (se existir) e os `tasks.md` das specs.