# Migração do Lovable Cloud para Supabase próprio

Projeto de destino pretendido: `tqtwptmwkldamhesrorm`.

## Estado confirmado no repositório

- `src/integrations/supabase/client.ts` lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, mas usa `brokeredPreviewStorage()` para compartilhar a sessão com o preview do Lovable.
- `supabase/config.toml` ainda identifica o projeto antigo `ztqvwjdnpnyaktfxvfna`.
- `src/integrations/supabase/types.ts` descreve tabelas e RPCs, mas tipos TypeScript não criam o esquema no banco.
- A revisão técnica da branch de módulos registra que não há migrações SQL versionadas na pasta `supabase/` além de `config.toml`.
- Portanto, **não é seguro apontar o aplicativo para o projeto novo ainda**: faltam o esquema SQL real, as funções RPC, as políticas RLS e uma exportação dos dados de origem.

## O que não fazer

1. Não apagar/desativar o Lovable Cloud antes de obter uma cópia e validar a migração.
2. Não inferir o SQL do banco apenas dos tipos TypeScript.
3. Não copiar a chave `service_role` para variáveis `VITE_*`, frontend ou Git.
4. Não importar dados fictícios sobre os dados reais nem sobrescrever tabelas sem backup.
5. Não tratar exportações CSV de tabelas isoladas como backup completo: elas não preservam funções, triggers, constraints, RLS, Auth ou Storage.

## Etapa A — inventário no banco de origem

No SQL Editor do backend de origem, execute as consultas abaixo e guarde os resultados. Elas são somente leitura.

### Tabelas e views no schema public

```sql
select table_schema, table_name, table_type
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

### Colunas, tipos e valores padrão

```sql
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

### Restrições e chaves estrangeiras

```sql
select tc.table_name, tc.constraint_name, tc.constraint_type,
       kcu.column_name, ccu.table_name as foreign_table_name,
       ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_schema = kcu.constraint_schema
 and tc.constraint_name = kcu.constraint_name
left join information_schema.constraint_column_usage ccu
  on tc.constraint_schema = ccu.constraint_schema
 and tc.constraint_name = ccu.constraint_name
where tc.constraint_schema = 'public'
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;
```

### Estado de RLS e políticas

```sql
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

select schemaname, tablename, policyname, permissive,
       roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

### Funções públicas (incluindo RPCs)

```sql
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result_type,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, arguments;
```

### Triggers

```sql
select event_object_table as table_name, trigger_name,
       action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;
```

## Etapa B — exportação e migração

1. Faça um backup/exportação do banco de origem antes de qualquer alteração. Se a interface do Lovable Cloud não oferecer um dump completo, exporte o esquema, os dados de cada tabela e os objetos auxiliares separadamente; anote limitações.
2. Guarde separadamente a configuração de Auth (provedores, confirmação de e-mail, URLs de redirecionamento), Storage (buckets e arquivos), Edge Functions e secrets. Esses itens não são necessariamente incluídos num CSV ou num dump simples.
3. Compare o inventário de origem com `src/integrations/supabase/types.ts` e com todas as chamadas `supabase.rpc(...)` do aplicativo.
4. Construa migrações SQL versionadas em `supabase/migrations/` a partir do esquema verdadeiro, incluindo constraints, índices, funções, triggers e políticas RLS. Revise as permissões antes de executar.
5. Importe primeiro o esquema no projeto `tqtwptmwkldamhesrorm`, depois os dados compatíveis, verificando contagens e integridade referencial.
6. Configure e teste Auth, redirect URLs e Storage no projeto novo. Usuários do Auth não são recriados por copiar apenas tabelas do schema `public`.
7. Só depois de validar os fluxos principais altere a configuração do aplicativo para o projeto novo.

## Etapa C — troca do cliente

O cliente atual depende de variáveis de ambiente, portanto a URL e a chave pública do destino precisam ser configuradas no ambiente de build/preview:

- `VITE_SUPABASE_URL=https://tqtwptmwkldamhesrorm.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<chave pública do projeto de destino>`

Use a chave pública/publishable apropriada. Nunca comite chaves, senhas de banco ou a chave `service_role`.

Ao migrar, revise `brokeredPreviewStorage()`: a sessão compartilhada do preview do Lovable pode pertencer ao backend antigo. O comportamento correto precisa ser validado com Auth no Supabase de destino antes da troca final.

Atualize `supabase/config.toml` para o ref de destino apenas quando a migração estiver pronta para ser aplicada por ferramentas Supabase. Esse arquivo sozinho não muda o backend usado pela aplicação.

## Critérios para considerar a migração concluída

- [ ] Inventário de origem arquivado e backup conferido.
- [ ] Todas as tabelas, relações, índices, funções e triggers necessários foram recriados.
- [ ] RLS habilitado e políticas testadas com usuários de papéis diferentes.
- [ ] Dados migrados com contagens comparadas; sequências/identidades conferidas.
- [ ] Auth, redirecionamentos, Storage e funções externas reconfigurados.
- [ ] URL/chave do destino configuradas sem segredos no repositório.
- [ ] Build e lint executados; login, CRUD, movimentações, RPCs e exportações testados.
- [ ] O backend antigo permanece intacto até a aceitação final.

## Limite de acesso desta etapa

O repositório GitHub não contém um dump do banco Lovable Cloud e esta etapa não tem acesso autenticado ao SQL Editor, à exportação de dados do Cloud nem ao painel do projeto Supabase de destino. Logo, não é possível copiar honestamente o conteúdo do Cloud para o banco novo só alterando arquivos Git. É necessário obter o dump/exportação do backend de origem para produzir migrações e dados fiéis.
