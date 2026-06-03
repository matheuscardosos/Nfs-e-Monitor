## O que foi alterado

<!-- Descreva de forma objetiva o que este PR faz -->

## Motivacao

<!-- Por que essa mudanca e necessaria? Qual problema resolve? -->

## Issue relacionada

<!-- Se aplicavel: Closes #000 -->

## Tipo de mudanca

- [ ] Correcao de bug
- [ ] Nova funcionalidade
- [ ] Melhoria de codigo (sem alteracao funcional)
- [ ] Documentacao

## Como testar

<!-- Passos para verificar que a mudanca funciona corretamente -->

1. 
2. 
3. 

## Checklist

**Codigo**
- [ ] O codigo segue os padroes definidos no `CONTRIBUTING.md` (2 espacos, ponto e virgula, camelCase)
- [ ] Sem `console.log` — logs feitos via `electron-log`
- [ ] Sem dependencias novas sem justificativa no PR
- [ ] Comunicacao renderer ↔ main passa pelo `preload.js` (sem `require` direto no renderer)

**Seguranca**
- [ ] Nenhum dado sensivel incluido (senhas, tokens, certificados `.pfx`, arquivos `.db`)
- [ ] Nenhuma informacao de cliente real em exemplos ou comentarios

**Testes**
- [ ] Testado localmente com `npm run dev`
- [ ] Funcionalidade verificada com ao menos uma empresa real ou de teste
- [ ] Exportacoes (Excel, PDF, XML) testadas se a mudanca as afeta
- [ ] Sincronizacao testada se a mudanca afeta o fluxo de sync

**Documentacao**
- [ ] `CHANGELOG.md` atualizado com a mudanca
- [ ] Comentarios no codigo em PT-BR onde a logica nao é autoexplicativa
