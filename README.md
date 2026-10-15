# Zen Ware Sync

armaZen — Sistema de Gestão de Armazém (WMS)

1. Objetivo do projeto

Desenvolva um protótipo funcional, integrado e responsivo de um Warehouse Management System (WMS), denominado armaZen, destinado à gestão de armazenagem, endereçamento, movimentação de materiais e acompanhamento de tarefas operacionais.

O projeto tem finalidade acadêmica e utiliza a Kemia como referência para o contexto logístico, mas deve ser construído de maneira genérica, adaptável a diferentes empresas e instalações.

O objetivo é demonstrar como um sistema digital pode contribuir para reduzir divergências entre o estoque físico e os registros de controle, agilizar a localização, a conferência e a separação de materiais, melhorar a rastreabilidade das movimentações e organizar as atividades da equipe.

Desenvolva uma única aplicação integrada. Todos os módulos devem compartilhar o mesmo banco de dados e refletir as alterações uns dos outros.

Não construa apenas telas estáticas ou um conjunto de páginas sem conexão funcional. Implemente os principais fluxos de uso, validações, persistência de dados e relacionamentos entre módulos.

2. Tecnologias e arquitetura

Utilize as seguintes tecnologias:

Frontend: React com TypeScript.

Interface: componentes reutilizáveis, layout responsivo e design consistente.

Backend e banco de dados: Supabase com PostgreSQL.

Autenticação: Supabase Auth.

Autorização e segurança dos dados: Row Level Security (RLS).

Consultas e operações: cliente oficial do Supabase, com acesso controlado aos dados.

Exportação: geração de arquivos CSV, XLSX e JSON no aplicativo.

Versionamento e revisão posterior: código organizado para manutenção e análise no Kiro.

Utilize o Supabase como fonte central e persistente dos dados. Não crie um segundo banco independente nem utilize arrays locais como substitutos permanentes do banco de dados.

Antes de implementar as funcionalidades, estabeleça uma estrutura coerente de tabelas, relacionamentos, restrições e políticas de acesso.

Se a conexão com o Supabase ainda não estiver configurada, prepare a aplicação para essa integração e informe claramente quais configurações e credenciais são necessárias. Não simule persistência real nem afirme que uma operação foi salva no banco quando isso não tiver ocorrido.

Nunca exponha chaves administrativas ou a chave service_role no frontend. Utilize apenas as credenciais públicas apropriadas e proteja os dados por meio das políticas de segurança do banco.

3. Identidade visual e experiência de uso

Crie uma interface profissional, moderna, clara e adequada a um ambiente industrial e logístico.

O sistema deve transmitir organização, precisão, confiabilidade e eficiência operacional.

Utilize:

Hierarquia visual clara.

Tipografia legível.

Ícones consistentes.

Cores funcionais para estados, alertas e prioridades.

Tabelas com filtros, ordenação e paginação quando necessário.

Formulários objetivos, com validação e mensagens de erro compreensíveis.

Indicadores visuais para estoque baixo, endereços bloqueados, divergências e tarefas atrasadas.

Confirmações para operações que alterem significativamente o estoque.

Feedback visual de carregamento, sucesso e falha.

Evite excesso de elementos decorativos, gráficos sem utilidade e informações desnecessárias nas telas operacionais.

A aplicação deve funcionar bem em computadores, tablets e celulares. Priorize a rapidez de consulta e o uso durante as rotinas de armazém.

Utilize o nome “armaZen” de forma consistente na identidade visual.

4. Estrutura geral de navegação

Crie uma navegação principal com as seguintes áreas:

Dashboard.

Armazém e endereçamento.

Materiais e estoque.

Movimentações.

Tarefas operacionais.

Exportação para ERP.

Usuários e configurações, conforme as permissões do perfil.

A navegação deve manter uma estrutura consistente, destacar a seção atual e permitir acesso rápido às funções mais utilizadas.

O usuário deve conseguir sair de uma informação para outra sem perder o contexto. Por exemplo, ao selecionar um endereço no mapa, deve conseguir consultar os materiais armazenados nele e acessar seu histórico de movimentações.

5. Dashboard operacional

Desenvolva um painel inicial com indicadores alimentados pelos dados persistidos no Supabase.

Apresente, no mínimo:

Total de materiais cadastrados.

Quantidade de endereços cadastrados e percentual de ocupação.

Total de unidades em estoque, considerando a unidade de medida dos materiais.

Quantidade de itens com estoque abaixo do mínimo.

Número de movimentações no período selecionado.

Quantidade de tarefas pendentes, em andamento e atrasadas.

Quantidade de divergências de inventário registradas.

Inclua gráficos úteis, como:

Movimentações por período e por tipo.

Distribuição da ocupação dos endereços.

Situação das tarefas operacionais.

Evolução das divergências de inventário, quando houver histórico suficiente.

Permita filtrar os indicadores por período e, quando aplicável, por armazém.

Os indicadores devem ser calculados a partir dos dados reais disponíveis no banco. Não utilize valores fictícios fixos como se fossem resultados atuais do sistema.

Quando não houver dados suficientes, exiba um estado vazio com orientação para cadastrar materiais ou registrar operações.

6. Armazém e endereçamento configurável

Crie um módulo para cadastrar, visualizar e editar a estrutura física do armazém.

A estrutura deve ser configurável e não pode ficar limitada a uma instalação específica da Kemia.

Não fixe o sistema em quatro containers, um pátio e uma fábrica. Esses elementos podem ser utilizados nos dados demonstrativos, mas devem ser exemplos editáveis, e não uma limitação da arquitetura.

Permita que o usuário autorizado cadastre diferentes armazéns e defina seus próprios níveis de organização, por exemplo:

Armazém → Zona → Corredor → Estante → Prateleira → Posição.

Essa hierarquia é apenas um exemplo. O usuário deve poder definir níveis diferentes conforme a instalação, incluindo estruturas com menos ou mais níveis.

Cada nível deve possuir identificação, nome, tipo, localização hierárquica e propriedades pertinentes. Utilize relacionamentos entre registros para representar a hierarquia, em vez de criar colunas fixas para cada possível nível.

Implemente:

Cadastro, edição e desativação de armazéns.

Criação e edição dos níveis estruturais.

Criação, edição e desativação de endereços.

Geração ou cadastro de códigos únicos para os endereços.

Pesquisa por código, nome ou nível hierárquico.

Consulta dos materiais armazenados em cada endereço.

Visualização de capacidade e ocupação, quando esses dados forem aplicáveis.

Identificação de endereços livres, ocupados, bloqueados e reservados.

Bloqueio de endereços para impedir novas alocações.

Prevenção contra exclusão de endereços que possuam estoque ou histórico associado.

Implemente uma visualização gráfica do armazém que represente os locais cadastrados. Quando a disposição física não puder ser inferida da hierarquia, permita organizar os elementos visualmente por meio de uma interface de edição apropriada.

Não invente uma planta física exata. A representação visual deve ser identificada como esquemática quando não corresponder a uma planta real.

Ao selecionar um endereço, apresente seus dados, sua situação, sua capacidade, os materiais armazenados e as movimentações relacionadas.

A ocupação deve ser calculada conforme a unidade de capacidade configurada, evitando comparar diretamente unidades incompatíveis, como litros, quilogramas e unidades físicas.

7. Cadastro de materiais e controle de estoque

Crie um módulo para registrar e consultar os materiais armazenados.

Cada material deve possuir, no mínimo:

Código interno único.

Descrição.

Categoria.

Unidade de medida.

Código de barras opcional.

Estoque mínimo.

Status de cadastro.

Data de criação e de atualização.

Permita campos adicionais configuráveis para diferentes tipos de materiais, sem exigir alterações no código sempre que uma empresa precisar de novas informações.

Quando aplicável, inclua lote, número de série, validade e outras características relevantes para rastreabilidade.

Implemente:

Cadastro e edição de materiais.

Pesquisa por código, descrição e categoria.

Filtros por situação e nível de estoque.

Consulta de saldo total por material.

Consulta de saldo por endereço.

Histórico de movimentações.

Identificação de materiais sem endereço ativo.

Alertas de estoque abaixo do mínimo.

Paginação para listas extensas.

O saldo deve ser calculado de forma consistente com as movimentações registradas. Evite manter saldos independentes em telas diferentes.

Não permita que o usuário registre quantidades negativas em operações que não as admitem, utilize unidades de medida incompatíveis ou movimente estoque inexistente.

8. Movimentações de estoque

Crie um módulo para registrar as principais operações logísticas:

Entrada

Registra o recebimento de materiais, com material, quantidade, endereço de destino, data, responsável e referência documental opcional.

Saída

Registra a retirada de materiais, com material, quantidade, endereço de origem, data, responsável e motivo ou referência documental.

Transferência

Move materiais de um endereço para outro, registrando origem, destino, quantidade e responsável.

A transferência deve ser uma operação consistente: a saída do endereço de origem e a entrada no destino devem ser confirmadas como uma única transação lógica. Não permita que apenas uma das etapas seja efetivada.

Ajuste de inventário

Permite registrar a quantidade contada fisicamente, comparar com o saldo esperado e registrar a diferença.

Exija motivo para o ajuste e mantenha o histórico do valor anterior, do valor contado, da diferença e do responsável.

Histórico de movimentações

Cada operação deve possuir identificador único, tipo, data e hora, material, quantidade, origem e destino quando aplicáveis, usuário responsável, referência e observações.

Implemente filtros por período, tipo, material, endereço e responsável.

As operações concluídas devem permanecer no histórico. Não permita que o usuário simplesmente apague uma movimentação confirmada para corrigir um erro. Utilize um procedimento de estorno ou ajuste rastreável.

Implemente validações para evitar saldo negativo, endereços bloqueados, materiais inativos e operações duplicadas.

Para operações críticas, utilize transações no banco de dados e mecanismos adequados de concorrência, de forma que duas operações simultâneas não consumam o mesmo saldo disponível.

9. Tarefas operacionais — Kanban

Desenvolva um quadro Kanban para organizar as atividades da equipe.

Permita criar tarefas relacionadas a operações como:

Recebimento.

Conferência.

Armazenagem.

Separação.

Transferência.

Inventário.

Expedição.

Cada tarefa deve conter título, descrição, tipo, prioridade, responsável, prazo, status e referências a materiais ou endereços, quando aplicáveis.

Utilize colunas como:

A fazer.

Em andamento.

Aguardando.

Concluída.

Permita criar, editar, filtrar e atribuir tarefas. A movimentação entre colunas deve atualizar o status no banco de dados.

Apresente alertas para tarefas vencidas e prioridades elevadas.

Quando uma tarefa representar uma movimentação real de estoque, não altere o saldo apenas por mudar o cartão de coluna. A movimentação deverá ser registrada e validada por meio do módulo de operações.

O Kanban deve estar integrado aos demais módulos, sem funcionar como um sistema isolado.

10. Exportação de dados para ERP

Implemente uma área específica para exportar informações do armaZen para posterior utilização em sistemas ERP.

O protótipo não deve prometer integração direta, sincronização automática ou conexão com APIs de ERPs. A funcionalidade desta versão é preparar e exportar arquivos estruturados que possam ser adaptados ao formato exigido por diferentes sistemas.

Permita exportar dados como:

Cadastro de materiais.

Saldos de estoque.

Endereços.

Histórico de movimentações.

Inventários e ajustes.

Informações selecionadas de tarefas, quando pertinentes.

Ofereça os formatos CSV, XLSX e JSON.

Implemente as seguintes funções:

Seleção do conjunto de dados.

Seleção dos campos que serão exportados.

Definição da ordem das colunas.

Mapeamento dos campos do armaZen para os nomes utilizados no ERP de destino.

Configuração de cabeçalhos e formatos de data e número.

Configuração de delimitador e codificação para arquivos CSV.

Aplicação de filtros de período, material e outros campos pertinentes.

Pré-visualização dos dados antes da exportação.

Validação de campos obrigatórios e identificação de registros incompletos.

Salvamento de modelos de exportação para reutilização.

Registro do histórico de exportações, incluindo usuário, data, formato e filtros utilizados.

O sistema deve permitir modelos diferentes para ERPs distintos sem exigir mudanças na estrutura principal do banco.

Antes de gerar o arquivo, informe a quantidade de registros e apresente possíveis problemas de validação.

Não invente layouts oficiais de ERPs específicos. Os modelos devem ser configuráveis pelo usuário e identificados como modelos personalizados, salvo quando um layout oficial tiver sido comprovadamente implementado.

Gere os arquivos a partir dos dados reais selecionados. Não inclua credenciais, segredos, dados de autenticação ou informações internas desnecessárias.

A exportação não deve alterar o estoque nem marcar registros como sincronizados com um ERP. A simples geração do arquivo não comprova que houve importação no sistema de destino.

11. Usuários e controle de acesso

Implemente autenticação com Supabase Auth e perfis de acesso.

Utilize, no mínimo, três perfis:

Consulta

Pode visualizar os dados autorizados, consultar o estoque, endereços, indicadores e histórico.

Operação

Pode executar as funções operacionais permitidas, como registrar movimentações, atualizar tarefas e consultar informações necessárias ao trabalho.

Gestão

Pode administrar a estrutura do armazém, materiais, configurações, usuários e permissões, além de acessar os recursos de gestão e exportação autorizados.

Organize as permissões de forma que seja possível refiná-las posteriormente.

A interface deve ocultar ou desabilitar ações não autorizadas, mas a segurança precisa ser garantida no backend, e não somente visualmente.

Implemente políticas RLS em todas as tabelas que contenham dados acessíveis pela aplicação. Garanta que os usuários só possam consultar e alterar os registros permitidos pelo seu perfil e pelo escopo de acesso.

Quando houver mais de uma empresa ou organização cadastrada, cada uma deve possuir seus próprios dados e limites de acesso. Não permita que um usuário de uma organização visualize ou altere informações de outra.

O primeiro acesso administrativo deve ser configurado por um procedimento seguro, sem deixar senhas fixas, contas administrativas públicas ou credenciais embutidas no código.

12. Modelagem do banco de dados

Organize o banco PostgreSQL em tabelas relacionais normalizadas, com chaves primárias, chaves estrangeiras, restrições e índices apropriados.

Considere as seguintes entidades, adaptando-as quando necessário:

organizations: organizações ou empresas.

profiles: dados complementares dos usuários autenticados.

organization_members: vínculo entre usuários e organizações, com perfil e permissões.

warehouses: armazéns.

location_levels: definições dos níveis de organização.

locations: endereços e elementos hierárquicos.

materials: cadastro de materiais.

material_attributes: atributos adicionais configuráveis.

inventory_balances: saldos por material e endereço, quando necessário para desempenho.

stock_movements: registros das operações de estoque.

stock_movement_items: itens de cada operação, caso seja necessário suportar documentos com múltiplos materiais.

inventory_counts: contagens de inventário.

inventory_count_items: itens e diferenças identificadas.

tasks: tarefas operacionais.

export_templates: modelos de exportação.

export_history: histórico de arquivos gerados.

audit_logs: registros de auditoria.

A estrutura final deve evitar duplicação desnecessária e permitir a evolução do sistema.

Os nomes acima são uma proposta de modelagem, não uma exigência de criar tabelas sem necessidade. Se alguma entidade puder ser representada de forma mais consistente por outra estrutura, justifique a decisão.

A hierarquia de endereços deve permitir diferentes quantidades e tipos de níveis. Não implemente a hierarquia por meio de colunas fixas como container, pátio, fábrica, corredor e prateleira.

Defina regras de integridade para impedir referências inválidas, códigos duplicados no mesmo escopo e exclusões que comprometam o histórico.

Para operações de estoque, defina uma estratégia consistente para registrar movimentações, calcular saldos e lidar com operações simultâneas. Utilize funções transacionais no banco quando forem necessárias para garantir a integridade.

O histórico de movimentações e de auditoria deve ser protegido contra alterações indevidas.

13. Segurança e auditoria

Implemente segurança desde o início, e não como uma etapa opcional.

Inclua:

Políticas RLS adequadas para cada tabela.

Validação de permissões no backend.

Separação de dados por organização.

Restrições para impedir movimentações inválidas.

Registro de operações relevantes.

Proteção das credenciais.

Tratamento seguro de erros.

Registro de usuário e data nas operações importantes.

O log de auditoria deve registrar, quando pertinente, usuário, ação, entidade afetada, data e hora e informações necessárias para rastreabilidade.

Não armazene senhas em texto puro nem crie autenticação própria quando o Supabase Auth puder atender à necessidade.

14. Dados demonstrativos

Crie dados fictícios coerentes para demonstrar as funcionalidades.

Inclua:

Pelo menos um armazém demonstrativo.

Uma estrutura física editável, com diferentes níveis de endereçamento.

Materiais de categorias variadas.

Diferentes unidades de medida.

Saldos em vários endereços.

Movimentações de entrada, saída e transferência.

Exemplos de tarefas em diferentes estados.

Exemplos de estoque abaixo do mínimo.

Alguns registros de inventário e divergências, para demonstrar os indicadores.

Containers, pátio e fábrica podem aparecer nos dados de demonstração, mas devem ser cadastrados como elementos editáveis, sem tratamento especial obrigatório no código.

Identifique os dados de demonstração como fictícios. Não os apresente como informações reais da Kemia.

Os dados iniciais devem ser criados por um processo controlado e não devem ser inseridos novamente a cada carregamento da página.

Não substitua dados reais por dados fictícios quando o usuário já estiver utilizando o sistema.

15. Estados, erros e validações

Todas as telas devem contemplar estados de carregamento, sucesso, falha e ausência de dados.

Implemente mensagens claras para problemas como:

Falha de conexão com o Supabase.

Usuário sem permissão.

Material inexistente ou inativo.

Quantidade insuficiente.

Endereço bloqueado.

Código duplicado.

Dados obrigatórios ausentes.

Falha ao registrar movimentação.

Falha ao gerar arquivo de exportação.

Não exiba mensagens de sucesso antes da confirmação da operação pelo backend.

Se uma operação falhar, preserve os dados digitados sempre que possível e explique como corrigir o problema.

16. Critérios de aceitação do protótipo

Considere o protótipo funcional quando for possível:

Autenticar usuários e aplicar seus perfis de acesso.

Cadastrar um armazém e modificar sua estrutura hierárquica.

Criar endereços com diferentes níveis de profundidade.

Cadastrar materiais e consultar seus saldos.

Registrar entradas, saídas, transferências e ajustes de estoque.

Consultar o histórico e rastrear as movimentações.

Criar tarefas, atribuí-las e acompanhar seu andamento no Kanban.

Visualizar indicadores calculados a partir dos dados existentes.

Exportar dados em CSV, XLSX e JSON.

Criar e reutilizar modelos personalizados de exportação.

Restringir o acesso aos dados conforme as permissões e a organização.

Utilizar a aplicação em computadores e celulares.

Manter os dados persistidos após atualizar ou reabrir a aplicação.

Evitar alterações inconsistentes de estoque e duplicações indevidas.

Executar um fluxo completo, do cadastro de material à movimentação, consulta de saldo e exportação.

17. Ordem de implementação

Construa o projeto em uma única aplicação, mas siga uma ordem de implementação que preserve a consistência técnica:

Configuração do projeto e integração com Supabase.

Modelagem relacional, migrações, autenticação e políticas RLS.

Estrutura de navegação e componentes visuais.

Cadastro de armazéns e endereçamento configurável.

Cadastro de materiais e consulta de estoque.

Movimentações e integridade dos saldos.

Tarefas operacionais e Kanban.

Dashboard e indicadores.

Exportação de dados para ERP.

Testes integrados, validações, acessibilidade e revisão responsiva.

Essa ordem define a sequência de implementação, não módulos independentes. Todas as funcionalidades devem compartilhar os mesmos dados e estar integradas no resultado final.

Antes de concluir, teste os principais fluxos, confira as permissões e valide se os indicadores e arquivos exportados correspondem aos dados registrados.

18. Resultado esperado

Entregue um protótipo de WMS funcional, coerente e visualmente profissional, que demonstre como o armaZen pode organizar a armazenagem, melhorar a rastreabilidade e facilitar o controle operacional.

Priorize a consistência dos dados, a flexibilidade do endereçamento, a facilidade de uso e a qualidade da arquitetura.

Não implemente integrações diretas com ERPs, automações externas ou funcionalidades complexas que não sejam necessárias para validar a proposta nesta primeira versão.

Quando houver uma limitação de configuração, integração ou funcionalidade, documente-a claramente em vez de apresentar uma simulação como se fosse uma implementação real.

O código deve ser organizado, legível e preparado para futuras melhorias e revisão técnica no Kiro.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/86ae3308-f88d-572a-8ae6-b8d1aceec9a8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
