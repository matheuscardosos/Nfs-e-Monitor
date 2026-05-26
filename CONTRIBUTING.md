<p align="center">
  <img src="nfse-monitor.png" alt="NFS-e Monitor" width="80">
</p>

<h1 align="center">Contribuindo com o NFS-e Monitor</h1>

<p align="center">
  Obrigado pelo interesse em contribuir! Este guia explica como reportar bugs, sugerir melhorias e enviar código de forma eficiente.
</p>

---

## <img src="assets/prancheta.svg" width="18" height="18" style="vertical-align:middle"> Índice

- [Código de Conduta](#-código-de-conduta)
- [Reportar Bugs](#-reportar-bugs)
- [Sugerir Funcionalidades](#-sugerir-funcionalidades)
- [Configurar o Ambiente](#-configurar-o-ambiente)
- [Padrões de Código](#-padrões-de-código)
- [Enviando um Pull Request](#-enviando-um-pull-request)
- [Licença](#-licença)

---

## <img src="assets/documento.svg" width="18" height="18" style="vertical-align:middle"> Código de Conduta

Este projeto segue princípios básicos de respeito e colaboração. Comunicação rude, ofensiva ou fora de contexto técnico resultará em fechamento da issue ou PR sem resposta.

---

## <img src="assets/bug.svg" width="18" height="18" style="vertical-align:middle"> Reportar Bugs

Antes de abrir uma issue, verifique se o problema já foi reportado em [Issues abertas](https://github.com/matheuscardosos/Nfs-e-Monitor/issues).

### O que incluir no relatório

| Campo | Descrição |
|---|---|
| **Versão** | Versão do NFS-e Monitor (visível em Configurações → Sobre) |
| **Sistema Operacional** | Ex: Windows 11 Pro 23H2 |
| **Passos para reproduzir** | Sequência exata que causa o problema |
| **Comportamento esperado** | O que deveria acontecer |
| **Comportamento atual** | O que acontece de fato |
| **Logs** | Conteúdo do arquivo de log (Configurações → Abrir pasta de logs) |

> Nunca inclua senhas, certificados `.pfx`, CNPJs reais ou qualquer dado sensível de clientes no relatório.

---

## <img src="assets/grafico-subindo.svg" width="18" height="18" style="vertical-align:middle"> Sugerir Funcionalidades

Sugestões são bem-vindas. Abra uma issue com o rótulo `enhancement` e descreva:

- **Problema que resolve** — contexto do que motivou a ideia
- **Solução proposta** — como você imagina que funcionaria
- **Alternativas consideradas** — outras abordagens que você descartou

Issues abertas sem esses campos podem ser fechadas por falta de contexto.

---

## <img src="assets/construcao.svg" width="18" height="18" style="vertical-align:middle"> Configurar o Ambiente

### Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | 18 LTS |
| npm | 9 |
| Windows | 10 64-bit |

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/matheuscardosos/Nfs-e-Monitor.git
cd Nfs-e-Monitor

# 2. Instale as dependências
npm install

# 3. Inicie em modo desenvolvimento
npm run dev
```

O modo `dev` ativa as DevTools do Electron automaticamente para facilitar o debug.

### Gerar build local

```bash
npm run build
```

O instalador será gerado em `dist/`.

---

## <img src="assets/monitor.svg" width="18" height="18" style="vertical-align:middle"> Padrões de Código

O projeto usa **JavaScript vanilla** no renderer e **Node.js** nos serviços — sem frameworks, sem transpiladores.

### Regras gerais

- Indentação com **2 espaços** (sem tabs)
- Ponto e vírgula ao final das instruções
- Comentários em **PT-BR**.
- Nomes de variáveis e funções em **camelCase**
- Nomes de arquivos em **kebab-case**
- Sem `console.log` em código de produção — use `electron-log`

### Estrutura de arquivos

```
nfse-manager/
├── main.js              # Processo principal do Electron
├── preload.js           # Bridge IPC (contextBridge)
├── index.html           # Shell da interface
├── renderer/
│   ├── app.js           # Logica da interface (renderer process)
│   └── styles.css       # Estilos globais
├── services/
│   ├── ipc-handlers.js  # Handlers de todos os eventos IPC
│   ├── nfse-api.js      # Integracao com o portal NFS-e Nacional
│   └── pdf-report.js    # Geracao de relatórios PDF
```

### IPC (comunicação entre processos)

Toda comunicação entre o renderer e o processo principal passa pelo `preload.js` via `contextBridge`. Não use `require` no renderer diretamente.

---

## <img src="assets/refresh.svg" width="18" height="18" style="vertical-align:middle"> Enviando um Pull Request

1. **Crie um fork** do repositório
2. **Crie uma branch** descritiva a partir de `main`:
   ```bash
   git checkout -b fix/ordenacao-competencias
   # ou
   git checkout -b feat/exportar-tomadas
   ```
3. **Faça commits atômicos** — um commit por mudança lógica, mensagem em PT-BR:
   ```
   fix: corrige ordenacao de competencias no dashboard
   feat: adiciona exportacao Excel para notas tomadas
   ```
4. **Abra o Pull Request** para a branch `main` com:
   - Descrição clara do que foi alterado e por quê
   - Referência à issue relacionada (`Closes #42`)
   - Prints ou logs se a mudança afetar a interface ou o comportamento de sync

### O que não será aceito

- PRs que introduzam dependências externas sem justificativa
- Mudanças de formatação ou estilo sem alteração funcional
- Código que leia, transmita ou armazene dados do usuário fora do banco local

---

## <img src="assets/cadeado.svg" width="18" height="18" style="vertical-align:middle"> Licença

Ao enviar uma contribuição você concorda que ela será licenciada sob os mesmos termos do projeto: **AGPL-3.0**.

Consulte o arquivo [LICENSE](LICENSE) para os termos completos.

---

<p align="center">
  <sub>Projeto mantido por <a href="https://github.com/matheuscardosos">Matheus Cardoso</a></sub>
</p>
