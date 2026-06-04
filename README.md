## Interrupção temporária no Portal NFS-e Nacional (03/06/2026)

**Status do Nfs-e Monitor:** Indisponível para todos os usuários desde 03/06/2026

---

### O que aconteceu

No dia 03/06/2026, o portal da NFS-e Nacional (`www.nfse.gov.br`) implementou o hCaptcha especificamente na etapa de download de XMLs e DANFSEs.

O programa funcionava realizando login automático no portal, navegando pelas páginas de notas emitidas e recebidas e baixando os arquivos, simulando o comportamento de um navegador comum. O hCaptcha é um sistema de verificação humana que identifica esse tipo de acesso automatizado e bloqueia a requisição antes que o arquivo seja entregue. O resultado é que no lugar do XML ou do DANFSE, o servidor retorna uma página HTML de erro `403 Forbidden`.

Todos os usuários foram afetados sem exceção, pois o programa dependia exclusivamente desse fluxo para realizar os downloads.

---

### Próximos passos

Estou avaliando uma possível correção imediata. Caso ela não funcione, será feita uma refatoração no projeto para que a busca de notas fiscais passe a funcionar exclusivamente via certificado digital A1 ou A3, utilizando a API oficial do Ambiente Nacional de Produção. Essa mudança vai exigir um tempo de adaptação e será comunicada aqui assim que houver uma previsão.

---

### Agradecimentos

Agradeço imensamente aos 15 usuários que eu tinha conhecimento de estavam utilizando o programa, e também aos meus amigos que me apoiaram durante o desenvolvimento deste projeto. Assim que houver novidades este repositório será atualizado.
