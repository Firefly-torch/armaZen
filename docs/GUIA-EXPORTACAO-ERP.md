# Guia de exportação de dados do armaZen

## Para que serve

A exportação gera um arquivo com informações cadastradas no armaZen. Ela não envia dados, não sincroniza e não confirma importação no ERP. Antes de usar o arquivo em outro sistema, confirme com o responsável pelo ERP quais colunas, códigos, formatos de data e valores são aceitos.

## Fluxo em quatro etapas

1. **Dados:** escolha um conjunto (materiais, saldos, endereços, movimentações, inventário ou tarefas), defina um período e, se necessário, um filtro textual.
2. **Colunas e formato:** escolha as informações que deseja incluir e o formato XLSX, CSV ou JSON. Campos obrigatórios permanecem selecionados. O perfil Gestão também pode salvar uma configuração para reutilizá-la.
3. **Conferência:** gere a prévia, confira a amostra e corrija campos obrigatórios sem valor. A geração é bloqueada enquanto houver campos obrigatórios vazios.
4. **Arquivo pronto:** o navegador solicita o download e o sistema registra a geração no histórico.

## Identificadores de relacionamento

Os arquivos usam identificadores de negócio em vez de expor UUIDs internos sempre que o relacionamento pode ser resolvido:

| Campo no cadastro | Valor no arquivo |
| --- | --- |
| Material | Código do material |
| Endereço | Código do endereço |
| Armazém | Código do armazém |
| Nível de armazenagem | Nome do nível |
| Endereço superior | Código do endereço superior |
| Responsável | Nome ou e-mail cadastrado |
| Sessão de inventário | Descrição da sessão ou data de criação |

Se uma referência cadastrada não puder ser localizada, o valor fica vazio e a prévia apresenta um aviso. O sistema não substitui silenciosamente um código desconhecido por um UUID.

## Campos obrigatórios

- **Materiais:** código, descrição, categoria e unidade.
- **Saldos:** código do material, código do endereço e quantidade.
- **Endereços:** código, nome e código do armazém.
- **Movimentações:** tipo, código do material e quantidade.
- **Inventário:** sessão, código do material, código do endereço, quantidade contada e motivo.
- **Tarefas:** título, tipo e situação.

Além dos campos obrigatórios, outros campos podem ficar vazios conforme o cadastro de origem. A prévia mostra a quantidade de campos vazios e identifica cada campo obrigatório que precisa de correção.

## Limites e cuidados

- Uma exportação gera um conjunto de dados por arquivo; não monta automaticamente um pacote de tabelas relacionadas.
- A consulta atual considera até 5.000 registros por arquivo. Ao atingir esse limite, a tela apresenta um aviso de possível truncamento; use períodos ou filtros mais específicos.
- Personalizar o nome de uma coluna altera o cabeçalho do arquivo. Isso não traduz automaticamente valores de domínio, como situação, tipo de movimentação ou prioridade.
- XLSX é indicado para leitura e conferência. CSV deve ser escolhido quando o sistema de destino solicitar esse formato. JSON é voltado a usos técnicos.
- Modelos salvos armazenam campos, nomes de colunas, formato, separador CSV e formato de data. Ao aplicá-los, essas opções são restauradas.
- Os modelos são configurações personalizadas do armaZen, não layouts oficiais de TOTVS, Senior, Sankhya, SAP ou outro ERP.
- A exportação não realiza importação de volta, validação de layout externo, sincronização automática nem integração por API.

## Recomendação operacional

Antes de importar qualquer arquivo, faça um teste com poucos registros em ambiente de homologação, confira se o ERP reconhece os códigos de materiais e endereços e valide o resultado com a equipe responsável pelo sistema de destino.
