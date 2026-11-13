# Integrações ERP — visão de dados do armaZen

## Objetivo

A guia **Integrações ERP** apresenta a estrutura prevista para o intercâmbio de informações entre o WMS armaZen e um sistema de gestão empresarial. Ela é independente da guia **Exportação para ERP**, que continua responsável por gerar arquivos CSV, XLSX e JSON para importação manual.

O painel foi organizado para apresentar os principais fluxos, o mapeamento de campos e os registros operacionais que podem participar de uma integração.

## Áreas do painel

### Visão geral

Consolida os principais volumes da organização: materiais cadastrados e ativos, armazéns, endereços, linhas de saldo, movimentações e itens de inventário. Também reúne a atividade recente derivada de movimentações, exportações e auditoria.

### Mapeamento

Apresenta a correspondência entre campos de negócio do ERP e entidades do armaZen para materiais, armazéns, endereços, saldos, movimentações e inventários. Os nomes de campos externos são referências ilustrativas e deverão ser ajustados conforme o produto, versão e layout do ERP adotado.

### Fluxos de dados

Organiza a comunicação prevista em duas direções:

- **ERP → armaZen:** cadastros de materiais, armazéns e referências de endereçamento.
- **armaZen → ERP:** saldos por posição e lote, movimentações e resultados de inventário.

A tela também descreve as etapas gerais de recebimento, conversão, validação e retorno dos dados.

### Dados e histórico

Apresenta informações carregadas dos módulos operacionais da organização:
- cadastro de materiais e seus saldos consolidados por material;
- saldos por material, endereço, armazém, lote e validade;
- histórico de movimentações com origem, destino, quantidade e referência;
- resultados de inventário com quantidade esperada, contada e diferença;
- histórico de arquivos exportados;
- eventos de auditoria disponíveis.

As tabelas exibem os registros carregados pelo aplicativo para a organização atual. O volume depende dos limites de consulta definidos nos módulos de origem.

## Regras de conversão consideradas

- **Identificadores:** códigos de materiais, armazéns e endereços devem ser utilizados como referências de negócio; identificadores internos do banco não devem ser expostos como códigos externos.
- **Unidades:** quantidades precisam preservar a unidade de medida de cada material. Unidades diferentes não podem ser somadas em um saldo geral.
- **Lotes e validade:** lote e data de validade devem acompanhar o saldo da respectiva posição quando essas informações estiverem cadastradas.
- **Movimentações:** cada evento deve preservar número, tipo, material, quantidade, origem, destino, lote, referência e data/hora.
- **Inventário:** a integração deve considerar quantidade esperada, quantidade física contada, diferença e justificativa.
- **Duplicidade e reprocessamento:** uma integração efetiva deverá identificar cada evento de forma única para impedir lançamentos repetidos em caso de retentativa.

## Escopo técnico

O painel apresenta uma visão de integração e utiliza os registros reais disponíveis no armaZen para contextualizar os fluxos. A comunicação com um ERP externo depende da seleção do fornecedor, produto e versão, da definição de credenciais e ambiente de homologação, do ajuste dos mapeamentos e da implementação do conector no servidor.

Uma integração efetiva também exigirá armazenamento seguro de credenciais, processamento em segundo plano, fila persistente, idempotência, tratamento de falhas, logs técnicos, monitoramento e conciliação entre os sistemas.

A existência do painel e dos mapeamentos de referência não representa uma conexão ativa nem certifica compatibilidade com um ERP específico.
