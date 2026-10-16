# Migração do armaZen para o projeto Supabase externo

O app usa as variáveis Supabase descritas no [README](../README.md) e o projeto-alvo `tqtwptmwkldamhesrorm`. O `.env` local contém credenciais, fica fora do Git e não deve ser publicado.

## O que está versionado

- `supabase/migrations/20261016000000_initial_schema.sql`: migração inicial do esquema SQL, funções de movimentação, triggers, grants e políticas RLS. Ela foi derivada do SQL do pacote Drizzle.
- `supabase/config.toml`: ref do projeto de destino.
- `.env.example`: nomes das variáveis, sem segredos.

## Antes de aplicar no Supabase

1. Confirme no painel que o projeto e a região são os esperados.
2. Faça backup e inventário do esquema atual, dados, Auth, Storage e funções.
3. Compare o banco existente com a migração inicial. Ela cria objetos e não é idempotente; não aplique cegamente sobre tabelas existentes.
4. Aplique a migração apenas após revisar o plano. A migração SQL não move dados nem contas de Auth do backend Lovable antigo.
5. Configure Auth e URLs de redirecionamento no Supabase. O frontend não inclui tela de login e requer uma sessão já autenticada e vínculo a uma organização.
6. Teste as políticas RLS e as funções com usuários dos papéis `consulta`, `operacao` e `gestao` antes de usar dados reais.

A chave publicável é usada no navegador sob RLS. `sb_secret` é somente para servidor e ignora RLS; mantenha-a em `SUPABASE_SERVICE_ROLE_KEY`, fora do código, do Git e de qualquer variável `VITE_*`. O cliente administrativo existe, mas o app não deve usá-lo para contornar autorização de usuário.

## Comandos Supabase CLI

```sh
supabase link --project-ref tqtwptmwkldamhesrorm
supabase db push
```

Execute `db push` somente depois do backup e da comparação do esquema. Não há cópia automática do backend de origem nesta etapa.
