# Regras de endereçamento e leitura de saldos — armaZen

## Conceito operacional

O endereço-pai representa uma estrutura de localização (por exemplo, área, container, pátio ou estante). Ele organiza a hierarquia e ajuda o operador a localizar a posição, mas não deve ser contado como uma posição física de armazenagem quando possui subendereços.

Uma posição de armazenagem válida precisa:
- pertencer a um armazém ativo e estar ativa;
- estar em um nível configurado como armazenagem;
- não possuir endereços-filhos;
- não estar bloqueada para que receba novas entradas ou transferências.

O estado reservado continua sendo uma posição física de armazenagem, mas seu saldo não é disponibilidade livre. O estado bloqueado também continua existindo fisicamente e aparece separado, porém não recebe novas alocações.

## Leitura dos saldos

- **Disponível:** saldo em posições finais ativas com situação disponível.
- **Reservado:** saldo em posições finais reservadas; não é tratado como disponibilidade livre.
- **Bloqueado:** saldo em posições finais bloqueadas; não deve ser alocado.
- **Fora de posição válida:** saldo ligado diretamente a endereço-pai ou endereço cujo nível não está configurado para armazenagem. Deve ser conferido e transferido para uma posição física válida.
- **Endereço inativo:** saldo em endereço ou armazém inativo. É preservado para rastreabilidade, mas não é disponibilidade operacional.
- **Total registrado:** soma de todos os saldos cadastrados, inclusive os que precisam de revisão. Não deve ser usado sozinho para decidir reposição ou separação.

O cálculo de reposição e a disponibilidade operacional usam somente o saldo disponível. A necessidade estimada continua sendo a diferença até o estoque mínimo cadastrado; ela não substitui previsão de consumo, análise de prazo de entrega, compras pendentes, estoque de segurança ou aprovação de compra.

## Tratamento de dados legados

A migração não move saldos existentes automaticamente. O sistema não tem evidência suficiente para decidir em qual posição física cada material está. Saldos em endereços-pai, níveis não armazenáveis ou endereços inativos permanecem visíveis em uma seção de revisão e são excluídos da disponibilidade e da ocupação. A equipe deve conferir fisicamente e registrar uma transferência para a posição correta.

A migração bloqueia novas entradas, transferências de entrada e ajustes em endereços que não sejam posições finais válidas. Saídas a partir de endereços com saldo legado continuam possíveis para permitir a retirada controlada. Estornos também podem restaurar a movimentação original no endereço de origem para preservar o histórico.

## Relação com Assistente de PCP

As regras reforçam o controle de materiais, a acuracidade dos registros, a identificação de exceções, a reposição orientada por estoque mínimo e a rastreabilidade de movimentações. O armaZen continua sendo um WMS de apoio ao planejamento e controle de materiais. Ele não passa a planejar ordens de produção, capacidade de máquinas, listas técnicas de produção ou compras automaticamente.

## Limitações técnicas conhecidas

- Os indicadores e listas ainda dependem de consultas no frontend limitadas a 1.000 registros. Para operações maiores, devem ser substituídas por agregações no PostgreSQL e paginação.
- A capacidade do endereço é uma referência para estimar ocupação no mapa. A aplicação ainda não bloqueia entradas ou transferências que ultrapassem o valor cadastrado; a unidade da capacidade também precisa ser compatível com a unidade do material para que o percentual seja calculado.
- O cadastro do material pode exigir identificação do lote e essa exigência é validada nos fluxos de movimentação e contagem. A data de validade aparece quando existe no registro/exportação, mas o fluxo normal de entrada ainda não oferece campo para registrá-la; portanto, o sistema não deve ser usado como controle completo de vencimento até essa etapa ser implementada.
- A devolução de obra é registrada como entrada vinculada a uma referência textual da obra. O sistema ainda não concilia automaticamente a devolução com uma saída anterior nem limita a quantidade devolvida ao que foi retirado.
- O estoque mínimo é uma referência cadastrada manualmente; não há previsão estatística de consumo, lead time, pedidos de compra abertos ou reserva formal por obra.
- A condição declarada numa devolução não substitui inspeção física, aceite ou processo formal de quarentena.
- O endereço no mapa é uma representação hierárquica/esquemática; não substitui planta física validada, identificação visual no local ou procedimento de segurança.
- A implementação acadêmica não substitui procedimentos operacionais, treinamento, inventário físico, análise de risco ou atendimento às NRs aplicáveis ao ambiente real.
