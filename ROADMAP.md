<p align="center">
  <img src="nfse-monitor.png" alt="NFS-e Monitor" width="80">
</p>

<h1 align="center">Roadmap</h1>

<p align="center">
  Funcionalidades planejadas para as próximas versões do NFS-e Monitor.<br>
  A ordem de implementação seguirá a complexidade e o tempo disponível.
</p>

---

## Em andamento

Nenhum item em desenvolvimento no momento.

---

## Planejado

### Acoes sobre notas

- **Cancelar NFS-e** — botão para solicitar cancelamento de uma nota diretamente pelo sistema, sem precisar acessar o portal
- **Substituir NFS-e** — botão para substituição de nota, vinculando automaticamente a nova à cancelada
- **Confirmar / Rejeitar NFS-e** — para escritórios que precisam validar notas recebidas antes de registrá-las

### Emissao de notas

- **Emissão de NFS-e** — emitir notas fiscais de serviço para os clientes diretamente dentro do sistema, eliminando a necessidade de acessar o portal individualmente por empresa
- **Emissão automatizada** — configuração de recorrência por cliente: notas geradas automaticamente no dia definido para clientes com serviços fixos mensais

### Envio por email

- **Envio de NFS-e por email** — integração com servidor SMTP configurável pelo usuário (host, porta, usuário, senha), sem dependência de serviços externos
  - Seleção de uma ou múltiplas notas para envio
  - Nota única: envia XML e PDF (DANFSe) individualmente
  - Múltiplas notas: envia ZIP com XMLs e ZIP com PDFs

---

## Ideias futuras

Itens sem previsão, sujeitos a viabilidade técnica e demanda.

- Tema escuro
- Relatório de competência consolidado multi-empresa
- Backup automático do banco de dados

---

## Concluído

Consulte o [CHANGELOG.md](CHANGELOG.md) para o histórico completo de versões lançadas.

---

<p align="center">
  <sub>Projeto mantido por <a href="https://github.com/matheuscardosos">Matheus Cardoso</a></sub>
</p>
