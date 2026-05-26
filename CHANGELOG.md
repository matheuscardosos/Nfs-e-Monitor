# Changelog

Todas as mudanças relevantes do NFS-e Monitor são documentadas aqui.

O formato segue o padrão [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
