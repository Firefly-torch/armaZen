# Revisão de lacunas do armaZen

**Branch:** `feat/armazen-operational-modules`  
**Referência funcional:** `README.md` (especificação do WMS).  
**Estado desta revisão:** implementação de uma primeira versão operacional dos módulos no frontend; ainda depende de validação no ambiente Supabase conectado.

## Alterações implementadas nesta branch

- **Dashboard:** indicadores calculados a partir dos registros consultados, filtro de período para contagem de movimentações, listas recentes e barras de distribuição por tipo de movimentação, status de tarefas e situação de endereços. Não são apresentados números demonstrativos fixos.
- **Armazém e endereçamento:** cadastro/edição e ativação/desativação de armazéns; níveis configuráveis por armazém; cadastro/edição de endereços com relação pai/filho, capacidade e unidade, status disponível/bloqueado/reservado; pesquisa e mapa esquemático dos endereços. A desativação de endereço com saldo é bloqueada no frontend.
- **Materiais e estoque:** cadastro/edição de materiais, categoria, unidade, código de barras, mínimo, status, rastreio de lote e atributos adicionais em JSON; consulta de saldo total e por endereço, pesquisa e alerta de estoque abaixo do mínimo.
- **Movimentações:** entrada, saída e transferência encaminhadas à RPC `register_movement`; ajuste de inventário encaminhado à RPC `register_adjustment`; consulta do histórico e solicitação de estorno via `reverse_movement`. Não se grava saldo diretamente pelo frontend.
- **Tarefas:** criação/edição, atribuição a membro, prazo, prioridade, vínculos com material/endereço e alteração persistida de status no Kanban. A mudança de coluna não movimenta estoque.
- **Exportação:** seleção do conjunto de dados, seleção de campos, prévia textual, CSV com delimitador configurável, XLSX e JSON; salvamento de modelos personalizados e registro do histórico da exportação. O fluxo informa que gerar arquivo não significa importar ou sincronizar com ERP.
- **Usuários/configurações:** visualização de membros e papéis; associação por e-mail de usuário existente por meio da RPC `add_member_by_email`. A tela não inclui login, conforme a decisão anterior; as operações exigem uma sessão Supabase já autenticada.
- **Tratamento de estado:** carregamento, erro, sucesso, ausência de sessão e ausência de organização são sinalizados; os formulários não anunciam sucesso antes da resposta do backend.
- **Segurança de integração:** nenhuma chave administrativa foi adicionada ao frontend; a interface mantém as operações dependentes de sessão e organização e não recomenda desativar RLS.

## Lacunas restantes / validações obrigatórias

### P0 — Banco, integridade e segurança

1. **Migrações SQL não foram encontradas na pasta `supabase/`** durante esta revisão; nela foi localizado `config.toml`. Os tipos TypeScript descrevem tabelas e RPCs, mas não comprovam que o esquema, as funções, as restrições e as políticas estejam aplicados no projeto Supabase conectado.
2. Validar a implementação real das RPCs `register_movement`, `register_adjustment`, `reverse_movement` e `add_member_by_email`, incluindo transações, concorrência, idempotência, validação de endereço/material, auditoria e checagem de papel.
3. Auditar políticas RLS para todas as tabelas, incluindo `profiles`, `organization_members`, `inventory_balances`, `stock_movements`, `inventory_count_items`, `export_templates`, `export_history` e `audit_logs`. A interface não substitui autorização no banco.
4. Confirmar as variáveis de ambiente e a sessão autenticada do Supabase/Lovable. Sem sessão e associação à organização, os dados e operações são bloqueados; não foi reintroduzido um formulário de login.
5. Verificar se a consulta de perfil e associação a organização corresponde ao esquema real do ambiente e se os papéis usam os valores `consulta`, `operacao` e `gestao`.

### P1 — Completar requisitos do README

- **Ocupação/capacidade:** o dashboard ainda não calcula percentual de ocupação; esse cálculo exige respeitar a unidade de capacidade e não somar unidades incompatíveis.
- **Mapa físico:** a visualização é esquemática e lista os endereços; ainda não há editor de arranjo visual com posicionamento livre.
- **Inventário:** a tela mostra contagens/diferenças existentes e permite registrar ajuste físico, mas ainda não oferece um fluxo completo para abrir e conduzir uma sessão de inventário com vários itens.
- **Filtros avançados:** ainda faltam filtros dedicados por armazém/período nas consultas, paginação e ordenação configurável em tabelas extensas.
- **Exportação:** a ordem dos campos segue a seleção e não há reordenação por arrastar; modelos são salvos e selecionáveis, mas edição/substituição de modelo existente ainda não está concluída. A validação de campos obrigatórios e filtros específicos por dataset também precisa ser ampliada.
- **Atributos configuráveis:** materiais aceitam objeto JSON, mas ainda não existe um construtor visual de atributos por categoria.
- **Auditoria:** a interface depende de trilha de auditoria gerada e protegida no banco; não foi criada uma gravação manual no frontend para evitar duplicação ou falsa garantia.
- **Dados demonstrativos:** não foram inseridos seeds fictícios automaticamente; a rotina deve ser aplicada de forma controlada em ambiente apropriado.

### P2 — Qualidade e entrega

- Build, lint, testes automatizados e testes integrados ainda precisam ser executados; nenhum resultado de execução é declarado nesta revisão.
- Testar entradas/saídas/transferências concorrentes, saldo insuficiente, endereço bloqueado, material inativo, estorno, isolamento entre organizações e exportação dos três formatos.
- Testar responsividade em celular/tablet, navegação por teclado, foco e rótulos.
- Confirmar os campos e enums usados no ambiente real, pois os tipos locais podem estar desatualizados.
- Depois da validação, atualizar a documentação de configuração, migrações, permissões e procedimento seguro para o primeiro administrador.

## Limitações conhecidas

- Esta implementação foi escrita e commitada no repositório por meio da API do GitHub, mas não foi executada localmente contra o banco conectado.
- A existência de tipos TypeScript não comprova que as funções SQL e RLS estejam aplicadas ou corretas.
- O protótipo não implementa integração direta com ERP: apenas exporta arquivos.
- Não foram adicionadas credenciais, senhas padrão nem dados fictícios como se fossem reais.

## Próxima sequência recomendada

1. Conferir e versionar as migrações SQL e as políticas RLS.
2. Executar build, lint e testes e corrigir erros encontrados.
3. Validar as funções transacionais de estoque no Supabase.
4. Completar inventário, ocupação/capacidade e mapa visual editável.
5. Completar filtros avançados, paginação, validações e gestão de modelos de exportação.
6. Testar o fluxo ponta a ponta: material → endereço → entrada/transferência/saída → saldo/histórico → exportação.
