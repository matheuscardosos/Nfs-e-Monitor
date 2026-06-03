# Changelog

Todas as mudanças relevantes do NFS-e Monitor são documentadas aqui.

O formato segue o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [1.5.2] — 3 de junho de 2026

### Corrigido

- SVGs dos icones (autorizadas, canceladas, emitidas, valor-total, botoes XML/DANFSe) e PR template ausentes dos commits anteriores

---

## [1.5.1] — 3 de junho de 2026

### Corrigido

- `status-window.html` e `status-preload.js` ausentes do pacote de build — janela de historico de status abria em branco na versao 1.5.0

---

## [1.5.0] — 3 de junho de 2026

### Adicionado

- **Monitor de status do portal** — verificacao paralela com 10 probes simultâneos + pontuação (ok+rapida=2pts, ok+lenta=1pt, falha=0pts; max=20; green≥18, yellow≥10, red<10); deteccao de offline via canary (1.1.1.1); historico de 30 dias persistido no banco
- **Historico de status** — popup no systray com grafico de barras (filtros 1d/7d/1m), uptime %, tooltips com data/horario e tempo medio de resposta
- **Pause/resume automatico do autosync** — quando offline ou portal red, sync pausa imediatamente e retoma sozinho ao detectar recuperacao (polling 30s offline / 3min portal); retry automatico em erros de rede/503 com backoff antes de pausar
- **Configuracoes de notificacoes** — nova aba "Notificacoes" em Configuracoes com toggles estilo Windows para cada tipo de alerta: novas notas, falha no ciclo, offline, portal indisponivel, atualizacoes
- **Notificacao de falha no ciclo** — ao fim de cada ciclo automatico com erros, notifica quantas empresas falharam
- **Refatoracao de Configuracoes** — layout com sidebar interna (Autenticacao, Busca Automatica, Notificacoes, Sobre)

### Melhorias

- **Deteccao de instabilidade** — erros HTTP 503 durante sync disparam verificacao de conectividade antes de decidir pausar ou continuar
- **Logs de status** — cada verificacao do portal registra resultado de cada probe individualmente (status, ms, ok) alem do calculo final (good/slow/failed/score/avgMs)

---

## [1.3.1] — 1 de junho de 2026

### Melhorias

- **Performance de navegação** — troca de aba (Emitidas ↔ Tomadas) agora é instantânea para a mesma empresa; dados são cacheados em memória e só re-buscados ao trocar de empresa, após sincronização ou ao alterar filtros
- **Botões XML/DANFSe** — SVGs redesenhados com viewBox menor (`120×44`), reduzindo a largura renderizada de ~135 px para ~71 px por botão e eliminando o corte em colunas estreitas

### Corrigido

- **Campo senha bloqueado após troca de método** — ao trocar autenticação de Certificado Digital para Senha do Portal, o campo de senha não aceitava digitação; corrigido substituindo `confirm()` nativo por `dialog.showMessageBox()` do Electron, que não quebra o foco do teclado
- **Botão DANFSe cortado** — coluna de ações agora tem `min-width` e `overflow:visible` garantindo que os dois botões apareçam mesmo em linhas com nomes de empresa longos

---

## [1.3.0] — 26 de maio de 2026

### Novidades

- **NFS-e Tomadas** — sincronização, listagem e exportação de notas fiscais de serviço recebidas, com filtros independentes por competência, status e período
- **Excel — Tomadas** — relatório em planilha com aba de resumo por competência exclusiva para notas recebidas
- **XMLs em lote — Tomadas** — exportação em arquivo ZIP das notas recebidas com os mesmos filtros da listagem

### Melhorias

- **Geração de PDF** — migrado do Puppeteer para o motor de impressão nativo do Electron (`webContents.printToPDF`), eliminando o conflito entre processos que causava falha na geração
- **Indicador de carregamento** — barra de progresso exibida durante todas as operações de exportação e download (Excel, PDF, XML, DANFSe)
- **Escritas assíncronas** — gravação de arquivos convertida de `writeFileSync` para `fs.promises.writeFile` em todos os handlers de exportação

### Corrigido

- PDF não era salvo — erro `TargetCloseError: Protocol error (Page.printToPDF): Target closed` resolvido com a migração para o motor nativo do Electron

---

## [1.2.0] — 11 de maio de 2026

### Novidades

- **Detecção de Senha Alterada** — quando a senha do portal é modificada externamente, o sistema detecta automaticamente e exibe badge vermelha na lista de empresas, alerta no topo da interface e indicador "Senha incorreta — Reconfigure" nas configurações
- **Reset Automático de Status** — ao reconfigurar a senha corretamente, o status volta para "OK" sem intervenção manual

### Segurança

- **Bloqueio de Certificado Vencido** — cadastro de empresa com certificado A1 vencido agora é bloqueado, evitando configurações inválidas desde o início
- **Rastreamento de Autenticação** — novo campo `senha_status` no banco de dados monitora se a última sincronização falhou por erro de autenticação

---

## [1.1.8] — 11 de maio de 2026

### Corrigido

- Ordenação incorreta das competências na listagem do dashboard

---

## [1.1.7] — 11 de maio de 2026

### Corrigido

- Número de versão exibido incorretamente na interface
- Animação da notificação de atualização disponível
- Logo corporativa não carregava corretamente no PDF gerado

---

## [1.1.6] — 11 de maio de 2026

### Corrigido

- Versão exibida incorretamente no rodapé do programa após atualização
- Logo do PDF referenciando caminho inválido na build empacotada

---

## [1.1.5] — 8 de maio de 2026

### Corrigido

- Animação da tela de notificação de atualização disponível

---

## [1.1.4] — 8 de maio de 2026

### Novidades

- **PDF Profissional** — relatórios gerados com HTML real via Puppeteer, permitindo selecionar e copiar texto diretamente do arquivo
- **Logo no PDF** — logo corporativa exibida no cabeçalho do relatório com tamanho aumentado (120 px)
- **Design moderno** — layout com cards coloridos, gradientes e tipografia aprimorada em modo landscape
- **Proteção de código** — ofuscação com JavaScript Obfuscator aplicada na build final de distribuição
- **Auto-update agressivo** — verificação a cada 30 minutos com instalação automática ao fechar

### Corrigido

- Logo do PDF agora carregada corretamente via base64 do arquivo oficial

---

## [1.1.3] — 8 de maio de 2026

### Corrigido

- Valores de PIS/COFINS calculados (não retidos na fonte) eram somados incorretamente como retenções — agora utiliza apenas `vRetPIS` e `vRetCOFINS`
- Splash screen não era exibida na versão empacotada — arquivos de animação agora incluídos na build

### Melhorias

- **Reparar Dados** — processo convertido para assíncrono com barra de progresso em tempo real, sem travar a interface
- **Notificação de atualização** — redesign completo em Fluent UI (Windows 11) com animação de foguete e botão "Reiniciar agora" centralizado

---

## [1.1.2] — 8 de maio de 2026

### Novidades

- **Splash screen** — tela de inicialização com animação Lottie e design Fluent UI (Windows 11)
- **Badges de status em SVG** — "Autorizada", "Cancelada" e "Substituída" exibem badges visuais em vez de texto puro
- **Botões XML/DANFSe** — redesenhados com ícones SVG modernos na tabela de notas
- Tamanho do banco de dados exibido em KB/MB/GB nas configurações

### Melhorias

- Layout do dashboard reorganizado: toolbar no topo, cards abaixo, espaçamento revisado
- Versão exibida no splash agora lida diretamente do `package.json`

---

## [1.1.1] — 7 de maio de 2026

### Corrigido

- Botão "Reiniciar agora" renderizava como texto HTML em vez de elemento clicável na notificação de atualização

---

## [1.0.3] — 7 de maio de 2026

### Novidades

- **Auto-Update via GitHub Releases** — verificação automática no startup e a cada 24 horas, download silencioso em background e notificação "Reiniciar agora?" quando pronto
- **Single Instance Lock** — impede abertura de múltiplas janelas simultâneas; foca a janela existente
- Instalador NSIS atualizado com banners e número de versão corretos

### Infraestrutura

- Integrado `electron-updater` para atualizações automáticas via GitHub Releases
- `GH_TOKEN` configurável para acesso ao repositório privado
- `AppUserModelId` definido para notificações do Windows com nome e ícone corretos

---

## [1.0.0–1.0.2] — maio de 2026

Versões iniciais de desenvolvimento. Funcionalidades entregues ao longo dessas versões:

- Sincronização de NFS-e via certificado digital A1 (`.pfx`) ou senha do portal
- Dashboard com filtros por competência, status e período customizado
- Suporte a múltiplas empresas com troca rápida e código de cor por empresa
- Download individual e em lote (ZIP) de XML e DANFSe
- Exportação de relatório Excel com resumo por competência
- Aba de alertas para divergências entre data de emissão e competência declarada
- Auto-sync configurável com intervalo em minutos por empresa
- Banco de dados SQLite local — dados nunca saem da máquina do usuário
- Instalador NSIS com ícone, atalhos no desktop/menu e logs persistentes via `electron-log`

---

[1.5.2]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.3.1...v1.5.0
[1.3.1]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.1.8...v1.2.0
[1.1.8]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/matheuscardosos/Nfs-e-Monitor/compare/v1.0.3...v1.1.1
[1.0.3]: https://github.com/matheuscardosos/Nfs-e-Monitor/releases/tag/v1.0.3
