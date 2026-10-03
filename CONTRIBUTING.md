# Como contribuir

Este é o sistema interno da SciTec Jr. Este guia vale para pessoas e para agentes de IA (Kiro, Antigravity etc.).

## Fluxo em 5 passos

1. **Pessoas de fora do repositório:** faça um *Fork*. **Colaboradores:** trabalhe direto no repositório.
2. Atualize e crie sua branch a partir da base certa (veja "Branches").
3. Faça commits pequenos, com mensagem clara (veja "Commits").
4. Rode o build e os testes antes de abrir o PR.
5. Abra um Pull Request preenchendo o template. Ninguém faz push direto na `main`.

## Branches

| Quem | Padrão | Exemplo |
|---|---|---|
| Etapas do projeto (Kiro, histórico) | `etapa-N-nome` | `etapa-3-melhorias` |
| Agente Antigravity | `antigravity/<descrição>` | `antigravity/etapa-3-cache-places` |
| Pessoas: funcionalidade | `feat/<descrição>` | `feat/exportar-leads` |
| Pessoas: correção | `fix/<descrição>` | `fix/filtro-leads-duplicados` |
| Pessoas: documentação | `docs/<descrição>` | `docs/guia-instalacao` |

Regras:
- Nunca faça push direto em `main` nem nas branches `etapa-*`.
- Crie a sua branch a partir da etapa em andamento (hoje, `etapa-3-melhorias`), a menos que o PR seja só de documentação.
- Para identificar o que cada agente fez: `git branch -a | grep antigravity` e `git log --grep='\[antigravity\]'`.

## Commits

Formato: `tipo(escopo): descrição curta`

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

- Commits de agentes de IA começam com o nome do agente: `[antigravity] feat(leads): ...`.
- Commits de trabalho parcial usam o prefixo `wip:`.

## Rodando o projeto

```bash
npm install
cp .env.example .env     # preencha DATABASE_URL e AUTH_SECRET
npm run db:setup         # migrações + dados de exemplo
npm run dev              # http://localhost:3000
```

Antes de abrir o PR:

```bash
npm run build
npm test
```

## Banco de dados e migrações

- Alterou o `prisma/schema.prisma`? Gere a migração: `npm run db:migrate:dev -- --name descricao`.
- Confira se o SQL **não remove** os índices parciais `User_one_manager_per_department` e `SectorMember_one_manager_per_sector`.
- Use sempre a data real do dia no nome da migração. Não crie migrações com data futura.
- Nunca edite uma migração já mergeada. Crie uma nova.

## Segurança (leia com atenção: o repositório é público)

- **Nunca** commite `.env`, chaves de API, senhas ou URLs de banco com senha.
- No `.env.example`, deixe os valores vazios (`CHAVE=""`).
- Chaves de API são lidas só no servidor. Nunca as envie ao navegador nem na URL.
- Se uma chave vazou em algum commit, revogue-a e gere outra. Apagar o commit não basta.
- Permissões: toda alteração passa por `lib/permissions.ts`. Toda rota de API verifica a permissão no servidor.

## Arquivos que exigem revisão do responsável

O arquivo `.github/CODEOWNERS` pede revisão automática em: `lib/permissions.ts`, `auth.ts`, `auth.config.ts`, `middleware.ts`, `prisma/` e `.github/`.

## Arquivos de agentes de IA

- `AGENTS.md` define as regras para qualquer agente.
- `.kiro/steering` e `.kiro/specs` são o contexto do Kiro e podem ser lidos por qualquer agente como markdown comum.
- Agentes que não são o Kiro **não editam** `.config.kiro` nem `tasks.meta.json`. Podem marcar as caixas de `tasks.md` ao concluir uma tarefa.

## Revisão

- Todo PR precisa de pelo menos 1 aprovação.
- O build precisa passar.
- PRs grandes devem ser abertos como **Draft** até estarem prontos.
