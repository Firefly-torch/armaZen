# Revisão de implementação — mapa visual e operações do armaZen

**Branch:** `feat/warehouse-visual-map`  
**Base:** `main`  
**Escopo desta alteração:** ampliar a visualização do armazém sem modificar o modelo de estoque, as RPCs de movimentação ou as políticas RLS.

## Implementado nesta alteração

- Mapa geral que renderiza a hierarquia ativa inteira do armazém, em vez de apresentar somente os filhos do nível selecionado.
- Organização recursiva por níveis, mantendo zonas, corredores, estantes e posições visíveis no mesmo contexto.
- Controles de zoom, visão geral, expandir tudo e recolher tudo.
- Pesquisa de endereço, nível ou material; os ancestrais permanecem visíveis para preservar o contexto da localização.
- Filtros por posições com saldo, sem saldo, bloqueadas, reservadas e materiais abaixo do estoque mínimo.
- Resumo de posições de armazenagem, ocupadas, bloqueadas, reservadas e localizações com materiais abaixo do mínimo.
- Detalhes contextuais do endereço selecionado: caminho hierárquico, saldos por lote, capacidade, ocupação estimada, movimentações recentes e tarefas abertas.
- Modo de organização visual restrito ao perfil Gestão. Arrastar um endereço para uma célula vazia do mesmo nível atualiza `locations.pos_x` e `locations.pos_y`.
- Reaproveitamento dos campos `pos_x` e `pos_y` já existentes na migração inicial. Nenhuma migração nova é necessária para o mapa.
- A visualização é explicitamente identificada como esquemática; as coordenadas não representam medidas físicas ou planta técnica.

## Compatibilidade e cuidados

- Não foram alteradas as tabelas de saldo, movimentações, inventários, tarefas ou permissões.
- O mapa lê os dados já carregados pelo módulo atual e não grava saldos nem movimentações.
- A atualização de posição altera somente as coordenadas visuais do endereço, com filtro por organização e sujeito às políticas RLS existentes.
- A posição inicial de registros sem coordenadas válidas é calculada de forma determinística no frontend. A coordenada só é persistida quando a Gestão move o item.
- O arraste só permite reposicionar endereços dentro do mesmo conjunto de irmãos, evitando alterações acidentais na hierarquia pai/filho.
- O cálculo de ocupação só é exibido quando a unidade da capacidade é compatível com a unidade do saldo.

## Limitações que permanecem

- O mapa é uma representação hierárquica/espacial esquemática, não uma planta CAD ou um gêmeo digital.
- O editor organiza os endereços dentro de uma grade de quatro colunas por nível; ainda não permite desenhar paredes, docas, corredores com largura real ou áreas poligonais.
- Os campos `pos_x` e `pos_y` são coordenadas de layout, não dimensões físicas.
- Leitura por câmera de códigos de barras/QR, picking guiado, packing especializado, reposição automática, programação de inventário e sincronização direta por API com ERP continuam fora deste escopo.
- O resumo de ocupação conta posições marcadas como armazenamento ocupadas; não estima volume físico do armazém inteiro.
- A ficha contextual exibe os registros já carregados pela aplicação. A paginação/consulta de grandes volumes deve ser evoluída separadamente.

## Verificações a executar no deployment

1. Entrar como Gestão, abrir Armazém e endereçamento e confirmar que todos os níveis aparecem no mapa.
2. Reposicionar um endereço em uma célula vazia e recarregar a página; confirmar que a posição foi preservada.
3. Confirmar que não é possível soltar um endereço em célula ocupada ou em outro nível hierárquico.
4. Pesquisar por código de endereço, nome de material e código de material.
5. Aplicar cada filtro e confirmar que os ancestrais de resultados continuam visíveis.
6. Selecionar um endereço com saldo e conferir lote, quantidade e unidade.
7. Conferir movimentações recentes e tarefas relacionadas.
8. Repetir a consulta como Consulta e Operação; confirmar que o modo de edição não aparece.
9. Testar o mapa em desktop, tablet e celular, incluindo zoom e rolagem horizontal/vertical.
10. Confirmar no Supabase que somente `pos_x` e `pos_y` mudaram durante o arraste e que saldo/histórico permaneceram inalterados.

## Validação automatizada

A PR deve passar pelo build, lint e testes configurados no repositório. A validação real do banco e a demonstração de ponta a ponta devem ser confirmadas após o deploy Vercel, pois a criação do commit não comprova que as variáveis de ambiente ou migrações do projeto publicado estejam corretas.
