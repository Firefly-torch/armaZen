# Acesso demonstrativo e dados fictícios do armaZen

## O que o modo de demonstração faz

O login utiliza o Supabase Auth. Uma pessoa pode criar uma conta com qualquer e-mail válido e uma senha aceita pelas regras do Supabase. Na primeira entrada, o aplicativo tenta criar uma organização própria chamada **armaZen — Demonstração**, com perfil administrador e dados fictícios, usando a função de banco `create_organization` com `_with_demo: true`.

Isso não é uma conta universal compartilhada: cada pessoa cria sua própria conta e organização de teste. Não use dados reais. Para uma aplicação pública de produção, não deixe a criação irrestrita de administradores habilitada.

## 1. Abrir o projeto Supabase

Abra o [painel do projeto armaZen](https://supabase.com/dashboard/project/ztqvwjdnpnyaktfxvfna) e entre com a conta que tem acesso ao projeto.

## 2. Permitir entrada imediata durante a apresentação

1. No menu lateral, abra **Authentication**.
2. Entre em **Sign In / Providers** e selecione **Email**.
3. Desative **Confirm email** apenas para o ambiente de demonstração, se quiser que o usuário entre sem confirmar a caixa de entrada.
4. Salve a configuração.

Se essa opção estiver ativa, o Supabase pode criar a conta sem iniciar uma sessão imediatamente. Nesse caso, o usuário precisa confirmar o e-mail antes de entrar. A opção de confirmação é uma configuração do Supabase, não do formulário.

## 3. Criar e entrar

1. Abra o aplicativo armaZen.
2. Clique em **Não tenho conta — criar acesso**.
3. Digite um e-mail válido e uma senha aceita pelo Supabase.
4. Clique em **Criar conta e entrar**.
5. Na primeira entrada, o aplicativo tenta provisionar a organização de demonstração e carregar os dados fictícios.

O formulário não cria usuários por meio de uma chave administrativa e não deve receber a chave `service_role`.

## 4. Conferir os dados no Supabase

No painel do projeto:

1. Abra **Table Editor**.
2. Confira as tabelas `organizations`, `organization_members`, `warehouses`, `location_levels`, `locations`, `materials`, `inventory_balances`, `stock_movements` e `tasks`.
3. Filtre pelos registros da organização **armaZen — Demonstração**. Use o `org_id` da organização correspondente para distinguir os dados de cada conta.
4. Faça alterações pelo aplicativo para que as operações de estoque continuem passando pelas validações e funções transacionais.

## 5. SQL Editor: consultas somente de leitura

Abra **SQL Editor → New query** e execute esta consulta para localizar as organizações:

```sql
select id, name, created_at
from public.organizations
order by created_at desc;
```

Depois, substitua o UUID abaixo pelo `id` da organização de demonstração para conferir seus registros:

```sql
select code, description, category, unit, min_stock, status
from public.materials
where org_id = 'UUID-DA-ORGANIZACAO'
order by code;
```

Para conferir os saldos:

```sql
select m.code, m.description, l.code as endereco, b.lot, b.quantity, m.unit
from public.inventory_balances b
join public.materials m on m.id = b.material_id
join public.locations l on l.id = b.location_id
where b.org_id = 'UUID-DA-ORGANIZACAO'
order by m.code, l.code;
```

Não insira registros de movimentação manualmente para simular operações: use a interface do armaZen, pois entradas, saídas, transferências e ajustes devem atualizar o estoque de forma transacional.

## Se o ambiente não carregar

Se aparecer erro mencionando `create_organization`, `load_demo_data`, permissões ou tabela inexistente, as migrações/funções necessárias podem não estar aplicadas no projeto Supabase conectado. Confira **Database → Migrations** e compare com os arquivos de migração do repositório antes de alterar políticas RLS. Não desative RLS globalmente e nunca coloque chaves secretas no frontend.
