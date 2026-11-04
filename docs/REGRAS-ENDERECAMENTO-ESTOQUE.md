# Regras de endereçamento e leitura de saldos — armaZen

## Conceito operacional

O endereço-pai representa uma estrutura de localização (por exemplo, área, container, pátio ou estante). Ele organiza a hierarquia e ajuda o operador a localizar a posição, mas não deve ser contado como uma posição física de armazenagem quando possui subendereços.

Uma posição de armazenagem válida precisa:
- pertencer a um armazém ativo e estar ativa;
- estar em um nível configurado como armazenagem;
- não possuir endereços-filhos;
- não estar bloqueada para que receba novas entradas ou transferências.

## Ocupação dos endereços estruturais

Endereços-pai não recebem saldo operacional. A ocupação apresentada neles é uma média das taxas de ocupação das posições finais descendentes que possuem capacidade cadastrada e unidade compatível com a unidade dos materiais armazenados. O cálculo é feito posição a posição: não soma kg, litros, unidades ou outras medidas diferentes. Posições sem capacidade compatível continuam no total de posições e no indicador de posições ocupadas, mas ficam fora da média percentual.

A ocupação física considera saldos disponíveis, reservados e bloqueados nas posições finais. Saldo antigo registrado diretamente no endereço-pai continua separado para revisão e não é somado novamente à ocupação dos subendereços.

## Reorganização da hierarquia

No mapa, arrastar um endereço sobre um endereço estrutural transfere-o para dentro desse grupo. Arrastar sobre uma posição final transfere-o para o mesmo grupo dessa posição. Arrastar entre endereços que já pertencem ao mesmo grupo continua apenas trocando suas posições visuais. A operação preserva os subendereços do item movido, atribui uma célula visual livre e impede relações circulares, mudanças entre armazéns e o uso de níveis de armazenagem como endereço-pai.

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

Um saldo legado diretamente em um endereço-pai não impede a edição rotineira desse endereço nem a reorganização de seus subendereços. O saldo continua destacado como “a revisar”, não se torna disponível e não é movido automaticamente. A regra impede que novos níveis de armazenagem sejam atribuídos a endereços que já possuem subendereços; para corrigir um endereço-pai legado, o nível pode ser alterado para um tipo estrutural.

A migração bloqueia novas entradas, transferências de entrada e ajustes em endereços que não sejam posições finais válidas. Saídas a partir de endereços com saldo legado continuam possíveis para permitir a retirada controlada. Estornos também podem restaurar a movimentação original no endereço de origem para preservar o histórico.

## Acuracidade e recontagem de inventário

O indicador do dashboard usa somente a contagem concluída mais recente de cada combinação material/endereço/lote dentro do período selecionado. Uma nova contagem concluída substitui a anterior para o cálculo atual, inclusive quando corrige uma divergência. As linhas antigas continuam preservadas no histórico para auditoria. Sessões em andamento não entram no indicador. Uma contagem válida demonstra apenas as combinações efetivamente contadas; não representa automaticamente uma auditoria integral de todo o armazém.

No ambiente demonstrativo, a migração cria uma conferência identificada como fictícia com 40 linhas, das quais 39 sem divergência (97,5%). Esse exemplo serve para demonstrar o KPI e a regra de recontagem; não representa uma contagem física real e não é aplicado às organizações operacionais.

## Conferência e reconstrução de saldos

A Gestão pode executar uma conferência que compara cada saldo de material/endereço/lote com o resultado do livro de movimentações (entradas, saídas, transferências, ajustes e estornos). A primeira etapa é somente leitura. A reconstrução exige confirmação explícita e substitui os saldos da organização pelo resultado validado do histórico, mantendo as datas de validade existentes nas combinações preservadas.

A reconstrução é cancelada se o livro produzir saldo negativo em qualquer ponto cronológico, se uma movimentação apontar para material/endereço de outra organização ou se existir saldo positivo sem movimentação que o explique. Esses casos exigem investigação manual; o sistema não inventa quantidade nem corrige histórico de forma automática. Antes de executar a reconstrução em uma organização real, deve ser feito backup e a conferência deve ser revisada pela Gestão.

## Relação com Assistente de PCP

As regras reforçam o controle de materiais, a acuracidade dos registros, a identificação de exceções, a reposição orientada por estoque mínimo e a rastreabilidade de movimentações. O armaZen continua sendo um WMS de apoio ao planejamento e controle de materiais. Ele não passa a planejar ordens de produção, capacidade de máquinas, listas técnicas de produção ou compras automaticamente.

## Limitações técnicas conhecidas

- Os indicadores e listas ainda dependem de consultas no frontend limitadas a 1.000 registros. Para operações maiores, devem ser substituídas por agregações no PostgreSQL e paginação.
- A capacidade do endereço é uma referência para estimar ocupação no mapa. A aplicação ainda não bloqueia entradas ou transferências que ultrapassem o valor cadastrado; a unidade da capacidade também precisa ser compatível com a unidade do material para que o percentual seja calculado.
- O cadastro do material pode exigir identificação do lote. Novas entradas sem lote são bloqueadas; saldos legados já registrados sem lote continuam podendo ser retirados, transferidos ou contados na posição original. A data de validade aparece quando existe no registro/exportação, mas o fluxo normal de entrada ainda não oferece campo para registrá-la; portanto, o sistema não deve ser usado como controle completo de vencimento até essa etapa ser implementada.
- A devolução de obra é registrada como entrada vinculada a uma referência textual da obra. O sistema ainda não concilia automaticamente a devolução com uma saída anterior nem limita a quantidade devolvida ao que foi retirado.
- O estoque mínimo é uma referência cadastrada manualmente; não há previsão estatística de consumo, lead time, pedidos de compra abertos ou reserva formal por obra.
- A condição declarada numa devolução não substitui inspeção física, aceite ou processo formal de quarentena.
- O endereço no mapa é uma representação hierárquica/esquemática; não substitui planta física validada, identificação visual no local ou procedimento de segurança.
- A implementação acadêmica não substitui procedimentos operacionais, treinamento, inventário físico, análise de risco ou atendimento às NRs aplicáveis ao ambiente real.
