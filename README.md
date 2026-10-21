# armaZen — Manual do app

O **armaZen** é um protótipo web responsivo de WMS para cadastro e endereçamento de armazéns, materiais, estoque, movimentações, inventários, tarefas operacionais e exportações para ERP. Usa React, TypeScript, TanStack Start e Supabase/PostgreSQL. A especificação funcional completa está em [docs/ESPECIFICACAO-WMS.md](docs/ESPECIFICACAO-WMS.md).

A identidade visual usa o azul índigo **#404890** como cor primária. Os estados funcionais (erro, atenção e sucesso) mantêm cores próprias para continuar distinguíveis.

## Requisitos e execução local

Use Node.js compatível com Vite 8 e Bun (o projeto inclui bun.lock). Na raiz:

    bun install
    cp .env.example .env
    bun run dev

No PowerShell, use Copy-Item .env.example .env no lugar de cp. Configure as variáveis antes de iniciar o app.

## Configuração do Supabase

A configuração deste pacote aponta para o projeto Supabase definido em supabase/config.toml. Isso não altera automaticamente os deployments publicados.

| Variável | Uso |
| --- | --- |
| VITE_SUPABASE_URL | URL pública usada pelo navegador |
| VITE_SUPABASE_PUBLISHABLE_KEY | Chave publicável usada pelo navegador; protegida por RLS |
| SUPABASE_URL | URL do Supabase usada no servidor |
| SUPABASE_PUBLISHABLE_KEY | Chave publicável nas chamadas de servidor autenticadas como usuário |
| SUPABASE_SERVICE_ROLE_KEY | Chave secreta sb_secret_, exclusiva do servidor; ignora RLS e nunca deve ir ao navegador, Git ou a uma variável VITE_* |

O modelo está em [.env.example](.env.example). O arquivo .env local é ignorado pelo Git. Não copie segredos para o README, o frontend ou arquivos versionados.

## Banco de dados e primeiro deploy

A estrutura inicial está em [supabase/migrations/20261016000000_initial_schema.sql](supabase/migrations/20261016000000_initial_schema.sql). A migração incremental [supabase/migrations/20261021000000_demo_profiles_inventory_workflow.sql](supabase/migrations/20261021000000_demo_profiles_inventory_workflow.sql) prepara os perfis de demonstração e as sessões de inventário.

Antes de aplicar migrações, confirme o banco de destino, faça backup e confira o estado atual do esquema. A migração inicial não é idempotente; não a execute manualmente duas vezes nem aplique o conjunto inicial sobre um banco com objetos existentes sem comparar o plano.

    supabase link --project-ref tqtwptmwkldamhesrorm
    supabase db push

Use supabase db push apenas depois de confirmar que o projeto linkado é o correto e revisar o conjunto de migrações que será aplicado. Não desative RLS para contornar erros. Migrações SQL não criam automaticamente os usuários do Supabase Auth nem migram arquivos do Storage ou dados de outro backend.

## Perfis de demonstração

A tela inicial oferece três acessos pré-configurados:

- **Consulta:** visualização de indicadores, materiais, saldos, endereços, movimentações e tarefas, sem ações operacionais.
- **Operação:** consulta dos registros, movimentações de estoque, contagens físicas e atualização de tarefas.
- **Gestão:** acesso aos módulos operacionais, administração de armazéns e materiais, equipe, atributos configuráveis e exportação.

Os perfis usam três contas fictícias distintas dentro de uma organização demonstrativa compartilhada. No primeiro acesso, o servidor prepara as contas, a organização e os dados de exemplo. A migração incremental acima precisa estar aplicada para esse provisionamento funcionar.

O login demonstrativo não aceita e-mail ou senha arbitrários e não altera a senha de contas existentes. Os perfis reservados são para demonstração visual e funcional; não devem ser usados como contas de produção ou para armazenar dados reais. A chave de serviço permanece apenas no servidor.

## Módulos

- **Dashboard:** indicadores do Supabase, filtro por armazém e período, estoque agrupado por unidade de medida, ocupação estimada de posições e tendência de movimentações.
- **Armazém e endereçamento:** estrutura hierárquica configurável, pesquisa e mapa esquemático navegável com detalhes por endereço.
- **Materiais e estoque:** cadastro, saldos por endereço, alertas de estoque mínimo e campos adicionais configuráveis.
- **Movimentações:** entradas, saídas, transferências, ajustes e estornos por funções transacionais do banco.
- **Inventário:** sessões de contagem, quantidade esperada e contada, divergências e histórico. Uma sessão concluída não aceita novas contagens.
- **Tarefas:** Kanban integrado ao armazém; mudar uma tarefa não altera o estoque.
- **Exportação para ERP:** CSV, XLSX e JSON com prévia, seleção e mapeamento de campos, filtros de data e modelos reutilizáveis. Exportar não sincroniza com o ERP.
- **Usuários e configurações:** perfis de organização e atributos personalizados dos materiais, conforme permissões.

O layout se adapta a computadores, tablets e celulares. As tabelas usam paginação no conjunto de dados carregado; consultas gerais ainda têm um limite de carregamento por lista e não são destinadas a volumes ilimitados nesta versão acadêmica.

## Comandos úteis

    bun run dev
    bun run build
    bun run lint
    bun run test

O repositório inclui scripts de lint e testes; a presença desses comandos não significa que todos os fluxos tenham cobertura automatizada. Execute o build e os testes antes de mesclar alterações.

A configuração Drizzle usa SUPABASE_DB_URL para operações pelo Drizzle. Prefira a pasta supabase/migrations e o Supabase CLI para aplicar as migrações SQL versionadas.

## Estrutura de referência

- src/: aplicação React/TanStack.
- src/integrations/supabase/: cliente, autenticação e tipos do banco.
- supabase/migrations/: SQL versionado para o banco.
- drizzle/: schema Drizzle de origem.
- docs/ESPECIFICACAO-WMS.md: especificação funcional original.
