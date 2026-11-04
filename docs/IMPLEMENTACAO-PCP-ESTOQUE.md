# Implementação — apoio ao planejamento e controle de materiais

Esta alteração aproxima o armaZen da demanda de produtividade do setor de estoque sem transformá-lo em um sistema de produção ou em um ERP.

## Implementado nesta alteração

- **Planejamento de reposição:** lista materiais ativos cujo saldo registrado está abaixo do estoque mínimo e calcula a diferença necessária para atingir esse mínimo.
- **Devolução de obra:** fluxo dedicado que registra a devolução como entrada de estoque, identifica a obra de origem, condição informada, lote, destino e observações no histórico de movimentações.
- **Tratamento de material em avaliação:** a interface exige que itens avariados ou pendentes de avaliação sejam destinados a um endereço ativo marcado como reservado.
- **Dashboard reorganizado:** prioriza exceções e decisões operacionais, apresenta acuracidade das contagens, divergências no período, materiais abaixo do mínimo, tarefas atrasadas, devoluções e movimentações.
- **Acuracidade das contagens:** percentual de linhas contadas sem diferença, calculado como linhas com diferença igual a zero divididas pelo total de linhas contadas no período e armazém selecionados.
- Testes unitários para os cálculos de reposição e acuracidade.

## O que permanece fora desta alteração

- **Solicitações formais de materiais para obras:** não implementadas. Exigem um modelo próprio para cabeçalho e itens da solicitação, quantidade demandada, datas necessárias, estado do atendimento, atendimento parcial, vínculo com movimentações e prevenção de dupla alocação/reserva. Reaproveitar tarefas livres para armazenar quantidades e itens comprometeria a integridade do fluxo.
- **Reserva de estoque para demandas futuras:** não implementada; o saldo disponível exibido continua sendo o saldo registrado, sem subtrair materiais reservados para obras.
- **Pedidos de compra e integração com compras:** não implementados. A reposição calculada é apenas a diferença até o estoque mínimo cadastrado; não considera lead time, compras pendentes, previsão de consumo, estoque de segurança ou aprovação do setor de compras.
- **Integração automática por API com ERP:** não implementada. A exportação por arquivo continua sendo uma preparação para intercâmbio, não uma sincronização.
- **Medição real do tempo de separação/localização:** não implementada. O sistema ainda não registra eventos de início/fim de picking, por isso não exibe médias estimadas sem evidência temporal.
- **Acuracidade integral do estoque:** o indicador novo mede as linhas de inventário registradas no escopo e período, não garante que todo o estoque físico tenha sido contado.

## Critérios de interpretação

- O valor de reposição é calculado por material; unidades diferentes nunca são somadas.
- Quando não há linhas de inventário no período, a acuracidade é exibida como indisponível, não como 0%.
- A classificação de condição na devolução é declaratória. O sistema registra o que o operador informou; a inspeção física, o aceite e o reaproveitamento continuam dependendo da equipe.
- Para materiais em avaliação, o endereço reservado funciona como segregação operacional. Não substitui uma área física de quarentena nem um procedimento formal de inspeção.
- Os indicadores usam os registros carregados atualmente pela aplicação. As listas gerais são limitadas no carregamento do frontend; para bases maiores, uma camada de agregação/paginação no banco ainda será necessária.

## Validação recomendada no ambiente

1. Cadastrar materiais ativos com estoque mínimo e saldos em unidades diferentes; conferir que a reposição é calculada por material e unidade.
2. Conferir material com saldo abaixo do mínimo e outro acima; apenas o primeiro deve aparecer.
3. Registrar inventário com contagens iguais e divergentes; conferir a taxa de acuracidade e o número de divergências.
4. Alterar período e armazém no dashboard; conferir que movimentos e contagens respeitam os filtros.
5. Registrar devolução apta e confirmar a entrada no saldo e a referência à obra.
6. Tentar registrar devolução em avaliação para endereço não reservado; a operação deve ser bloqueada na interface.
7. Registrar devolução em avaliação para endereço reservado e conferir condição e observações no histórico.
8. Confirmar que o saldo de origem da obra não é alterado; a devolução é registrada como entrada no destino selecionado.
9. Testar os três perfis de demonstração e os layouts desktop/celular.

A criação da pull request não aplica migrações, não configura variáveis de ambiente e não comprova testes de ponta a ponta no Supabase/Vercel.
