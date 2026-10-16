# armaZen — Manual do app

O **armaZen** é um protótipo de WMS para cadastro e endereçamento de armazéns, materiais, estoque, movimentações, tarefas operacionais e exportações para ERP. O app usa React, TypeScript, TanStack Start e Supabase/PostgreSQL. A especificação funcional do produto está neste README; este guia complementar cobre a execução local e a conexão com o Supabase.

## Requisitos e execução local

Use Node.js compatível com Vite 8 e Bun (o projeto inclui `bun.lock`). Na raiz do projeto:

```sh
bun install
cp .env.example .env
bun run dev
```

No PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`. Depois configure as variáveis abaixo antes de iniciar o app.

## Configuração do Supabase

A configuração local deste pacote aponta para o projeto Supabase próprio. Isso não altera um deployment publicado. O cliente usa a URL e a chave publicável do Supabase; o cliente administrativo só pode ser carregado no servidor.

| Variável | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL pública usada pelo navegador |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável usada pelo navegador; sujeita às políticas RLS |
| `SUPABASE_URL` | URL do Supabase usada no servidor |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável em chamadas de servidor autenticadas como usuário |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta `sb_secret_`, somente no servidor; ignora RLS e nunca deve ir ao navegador, Git ou a uma variável `VITE_*` |

O modelo está em [`.env.example`](.env.example). O `.env` local é ignorado pelo Git. Não copie segredos para o README, para o ZIP público ou para arquivos versionados.

## Banco de dados e acesso inicial

A migração inicial está em [`supabase/migrations/20261016000000_initial_schema.sql`](supabase/migrations/20261016000000_initial_schema.sql). Ela cria tabelas, funções, triggers, permissões e políticas RLS. O arquivo [`supabase/config.toml`](supabase/config.toml) aponta para o projeto configurado.

Antes de aplicar a migração, confira se o banco de destino já tem objetos ou dados. O SQL é uma migração inicial e não é idempotente. Faça backup e compare o esquema antes de executar:

```sh
supabase link --project-ref tqtwptmwkldamhesrorm
supabase db push
```

Não rode `db push` em produção sem revisar o plano e confirmar o estado do banco. A migração do esquema não copia usuários do Supabase Auth, arquivos do Storage nem dados do backend antigo.

O dashboard pode abrir sem sessão, mas consultas por organização e gravações exigem uma sessão Supabase autenticada e vínculo com uma organização. **Este pacote não inclui uma tela de login**; configure autenticação e URLs de redirecionamento no Supabase e conecte o fluxo de login que sua implantação utilizará. RLS continua sendo a proteção do banco; não a desative para preencher telas.

## Módulos

- **Dashboard:** indicadores derivados dos dados acessíveis; sem valores demonstrativos fixos.
- **Armazém e endereçamento:** armazéns, níveis configuráveis e endereços; o mapa é esquemático.
- **Materiais e estoque:** cadastro, saldo por endereço e alertas de estoque mínimo.
- **Movimentações:** entradas, saídas, transferências, ajustes e estornos via funções transacionais do banco.
- **Tarefas:** Kanban integrado ao armazém; mudar uma tarefa não altera o estoque.
- **Exportação para ERP:** arquivos CSV, XLSX e JSON; exportar não sincroniza com o ERP.
- **Usuários e configurações:** perfis e vínculo a organizações, conforme permissões no banco.

Sem sessão ou sem associação a organização, o app mostra estados vazios e bloqueia gravações. Os dados demonstrativos só devem ser criados por ação explícita, conforme a configuração do backend.

## Comandos úteis

```sh
bun run dev
bun run build
bun run lint
bun run test
```

A configuração Drizzle usa `SUPABASE_DB_URL` para operações de migração pelo Drizzle. Prefira a pasta `supabase/migrations` e o Supabase CLI para aplicar as migrações SQL versionadas.

## Estrutura de referência

- `src/`: aplicação React/TanStack.
- `src/integrations/supabase/`: cliente, autenticação e tipos do banco.
- `supabase/migrations/`: SQL versionado para o banco.
- `drizzle/`: schema e migração de origem.
- `docs/ESPECIFICACAO-WMS.md`: especificação funcional original.


