# Revisão de lacunas do armaZen

**Branch desta revisão:** `feat/armazen-gap-fixes`  
**Escopo:** comparação da especificação fornecida com os arquivos do repositório que foi possível inspecionar.  
**Importante:** esta é uma revisão estática. Não foi possível executar a aplicação, validar o ambiente Supabase conectado nem confirmar o comportamento em produção. Os itens abaixo distinguem evidência observada de trabalho ainda necessário.

## Alterações realizadas nesta branch

- Substituída a página inicial placeholder de `src/routes/index.tsx` por uma primeira tela de acesso e dashboard.
- A tela inicial usa Supabase Auth para verificar sessão, entrar e sair.
- Depois do login, tenta localizar a organização e o perfil em `organization_members`.
- Os cartões do dashboard consultam registros reais de materiais, endereços, saldos, movimentações, tarefas e itens de inventário; mostram estado de erro em vez de inventar valores quando a consulta falha.
- Foi mantida a navegação principal do produto. As áreas ainda não implementadas mostram explicitamente que faltam fluxos funcionais, em vez de fingirem que já operam.
- Não foram adicionadas credenciais, senhas padrão nem dados fictícios ao banco.

## Diagnóstico por prioridade

### P0 — Bloqueadores de funcionamento e integridade

1. **Fluxos dos módulos ainda ausentes.** O arquivo de rota inicial anterior era apenas um placeholder visual. A nova página cria autenticação/dashboard inicial, mas Armazém, Materiais, Movimentações, Tarefas, Exportação e Configurações continuam sem CRUD e fluxos operacionais completos.
2. **Esquema e migrações precisam ser verificados.** O repositório contém tipos gerados do Supabase com entidades como `organizations`, `organization_members`, `warehouses`, `location_levels`, `locations`, `materials`, `inventory_balances`, `stock_movements`, `inventory_counts`, `inventory_count_items`, `tasks`, `export_templates`, `export_history` e `audit_logs`. Isso comprova a existência de tipos no código, mas não prova que o banco conectado tenha as mesmas tabelas, constraints, funções e políticas. Conferir e versionar migrações SQL reais.
3. **Transações de estoque.** Entrada, saída, transferência, ajuste e estorno precisam ser implementados como operações atômicas no PostgreSQL, com bloqueio/concorrência, validação de saldo, idempotência e trilha de auditoria. Não atualizar saldo e histórico em chamadas independentes do frontend.
4. **Segurança RLS.** Auditar todas as tabelas, inclusive tabelas auxiliares, para leitura/escrita por organização e papel. Impedir que o cliente altere papel, organização, usuário responsável, saldo ou histórico sem autorização. Confirmar que `audit_logs` e movimentações concluídas não podem ser editados/apagados indevidamente.
5. **Configuração real do Supabase.** O cliente exige URL e chave pública de configuração. Confirmar as variáveis no ambiente de execução e documentar o procedimento de conexão. Nunca colocar `service_role` ou segredo administrativo no frontend.

### P1 — Funcionalidades obrigatórias da especificação

- **Armazém/endereço:** CRUD de armazéns; níveis configuráveis; hierarquia pai/filho com profundidade variável; códigos únicos no escopo correto; estados livre/ocupado/bloqueado/reservado; capacidade com unidades compatíveis; mapa esquemático editável; impedir exclusão quando houver saldo ou histórico.
- **Materiais:** CRUD, status, categoria, unidade, código de barras, estoque mínimo, atributos configuráveis, lote/série/validade quando aplicável, filtros, paginação, saldo total e por endereço.
- **Movimentações:** formulários de entrada/saída/transferência/ajuste; origem/destino; responsável; referência; motivos; filtros; estorno rastreável; validação de material inativo, endereço bloqueado, quantidade e saldo; prevenção de duplicidade.
- **Inventário:** fluxo de contagem com saldo esperado, contagem física, diferença, justificativa e geração de ajuste rastreável. O indicador atual usa os itens de contagem disponíveis; precisa ser conferido contra o modelo de negócio final.
- **Kanban:** criar/editar/atribuir tarefas, prazo, prioridade e colunas persistidas; alertas de atraso; vínculo com material/endereço/movimentação. Mudar coluna não pode alterar estoque por si só.
- **Exportação:** selecionar conjunto de dados e campos; ordenar/mapear cabeçalhos; filtros; formatos de data/número e CSV; prévia e validação; geração real de CSV/XLSX/JSON; salvar/reutilizar modelos e registrar histórico. A dependência `xlsx` já aparece no `package.json`, mas isso não comprova que a exportação esteja implementada.
- **Gestão de usuários:** convite/cadastro seguro, associação a organização e papéis Consulta/Operação/Gestão; controles também no backend, não apenas na interface.
- **Auditoria:** registrar ator, ação, entidade, data/hora e contexto relevante, sem permitir edição comum dos registros.

### P1 — Dashboard

A página inicial agora consulta dados do Supabase e mostra cartões básicos. Ainda faltam:
- filtro por período e armazém;
- gráficos de movimentação por período/tipo, ocupação, status de tarefas e divergências ao longo do tempo;
- cálculo correto da ocupação com capacidade e unidades compatíveis;
- validação das regras de saldo mínimo e dos estados reais usados pelos enums do banco;
- filtros e consultas agregadas mais eficientes quando o volume crescer.

### P2 — Qualidade e entrega

- Testes automatizados de componentes, autorização e fluxos críticos; em especial, duas saídas concorrentes para o mesmo saldo, transferência atômica, estorno, isolamento entre organizações e exportações.
- Executar build, lint e testes; nenhum resultado desses comandos é declarado nesta revisão.
- Testes de responsividade em celular/tablet, acessibilidade por teclado, foco, rótulos e mensagens.
- Estados de carregamento, vazio, falha e sucesso em cada módulo; preservar formulários quando uma operação falhar.
- Dados de demonstração via seed/migração controlada, apenas em ambiente apropriado e claramente identificados como fictícios.
- Atualizar documentação com configuração do Supabase, migrações, permissões, limites do protótipo e procedimento seguro para o primeiro administrador.

## Próxima sequência recomendada

1. Confirmar/regularizar migrações SQL e políticas RLS no Supabase.
2. Implementar cadastro de armazéns, níveis e endereços configuráveis.
3. Implementar materiais e leitura consistente dos saldos.
4. Implementar funções transacionais de movimentação, ajuste e estorno no banco.
5. Implementar inventário e Kanban conectado aos mesmos registros.
6. Completar dashboard com filtros e gráficos derivados dos dados reais.
7. Completar exportações e modelos reutilizáveis.
8. Finalizar gestão de usuários, auditoria, seeds e testes integrados.

## Limitações desta revisão

- Não foi executado build, lint, suíte de testes nem teste de integração contra um projeto Supabase.
- A presença de tipos TypeScript não comprova que o esquema esteja aplicado no banco.
- A tela inicial é uma fundação funcional e não significa que o WMS completo esteja pronto.
- A branch desta revisão foi criada separadamente; a branch principal não foi alterada diretamente.
