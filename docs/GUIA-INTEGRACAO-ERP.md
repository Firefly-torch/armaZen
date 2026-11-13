# Integrações ERP — demonstração do armaZen

## Objetivo

A área **Integrações ERP** demonstra, de forma interativa, como o armaZen poderá trocar informações com sistemas ERP. Ela é independente da guia **Exportação para ERP**, que continua responsável pela geração manual de arquivos CSV, XLSX e JSON.

## O que a demonstração permite

- Testar uma conexão fictícia e visualizar os dados ilustrativos do conector.
- Mapear os campos de cadastro recebidos do ERP para o modelo de materiais do armaZen.
- Conferir uma prévia dos registros depois da conversão.
- Importar materiais fictícios para um sandbox isolado da demonstração.
- Preparar até cinco movimentações recentes do armaZen e simular o envio para o ERP.
- Simular uma falha de comunicação, visualizar o resultado e reprocessar o lote.
- Consultar o histórico e o payload demonstrativo de cada operação.

## Isolamento e persistência

A demonstração não chama endpoints externos, não usa credenciais de fornecedores e não realiza sincronização real. Os materiais importados ficam em uma lista fictícia separada; eles não são gravados na tabela de materiais do Supabase. O envio utiliza os dados existentes somente para montar uma prévia e não cria, baixa ou altera saldos ou movimentações.

O mapeamento e o histórico demonstrativo ficam no armazenamento de sessão do navegador. Eles permanecem disponíveis enquanto a sessão da aba do navegador existir e podem ser apagados pelo botão **Limpar demonstração**.

## Como demonstrar

1. Entre no módulo **Integrações ERP** usando o perfil Gestão.
2. Na aba **Conexão**, clique em **Testar conexão** e mostre o estado simulado.
3. Em **Mapeamento**, altere a associação entre os campos do ERP fictício e os campos do armaZen. Observe a prévia ser atualizada.
4. Em **Sincronização**, execute a importação dos três materiais de exemplo. O resultado será armazenado apenas no sandbox demonstrativo.
5. Para demonstrar o fluxo de saída, habilite **Simular falha no próximo envio** e envie o lote de movimentações.
6. Abra o **Histórico**, consulte o payload e clique em **Reprocessar lote** para demonstrar a recuperação.
7. Repita o envio sem falha para mostrar o cenário de sucesso.

## Diferença entre demonstração e integração real

| Recurso | Demonstração atual | Integração real futura |
| --- | --- | --- |
| Conexão | Estado simulado no navegador | Teste do endpoint do fornecedor |
| Autenticação | Token ilustrativo, sem segredo | OAuth, chave de API ou método do ERP |
| Mapeamento | Campos de exemplo configuráveis | Mapeamento validado para cada API/versão |
| Importação | Lista fictícia isolada | Gravação controlada após validação e confirmação |
| Envio | Resposta simulada | Requisição real e confirmação do ERP |
| Falhas | Falha configurada pelo usuário | Timeout, indisponibilidade, validação ou recusa real |
| Reprocessamento | Atualização simulada do histórico | Fila persistente, idempotência e política de retentativa |
| Histórico | Armazenamento de sessão do navegador | Registro persistente no servidor, com auditoria |

## Próximos passos para uma integração real

Antes de conectar um ERP, será necessário escolher o fornecedor, produto e versão; obter documentação e credenciais de homologação; definir qual sistema é a fonte principal de cada informação; validar códigos, unidades e regras de negócio; e implementar um conector no servidor.

Uma integração de produção também precisará de armazenamento seguro de credenciais, fila persistente, idempotência para impedir duplicidade, logs técnicos, alertas, controle de acesso, conciliação e testes com o ERP do cliente.

**Importante:** a tela representa um fluxo possível de integração. Ela não comprova compatibilidade com TOTVS, Senior, Sankhya, SAP ou qualquer outro ERP.
