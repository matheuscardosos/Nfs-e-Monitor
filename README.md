<p align="center">
  <img src="nfse-monitor.png" alt="NFS-e Monitor" width="120">
</p>

<h1 align="center">NFS-e Monitor</h1>

<p align="center">
  <strong>Gestão inteligente de Notas Fiscais de Serviço para Escritórios de Contabilidade</strong>
</p>

<p align="center">
  <a href="https://github.com/matheuscardosos/Nfs-e-Monitor/releases">
    <img src="https://img.shields.io/github/v/release/matheuscardosos/Nfs-e-Monitor?style=flat-square&color=blue" alt="Latest Release">
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows" alt="Platform">
  </a>
  <a href="https://github.com/matheuscardosos/Nfs-e-Monitor/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/matheuscardosos/Nfs-e-Monitor/releases">
    <img src="https://img.shields.io/github/downloads/matheuscardosos/Nfs-e-Monitor/total?style=flat-square&color=brightgreen" alt="Downloads">
  </a>
</p>

<p align="center">
  <a href="https://www.electronjs.org/">
    <img src="https://img.shields.io/badge/Electron-191970?style=flat-square&logo=Electron&logoColor=white" alt="Electron">
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-43853D?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  </a>
  <a href="https://www.sqlite.org/">
    <img src="https://img.shields.io/badge/SQLite-07405E?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite">
  </a>
</p>

---

## <img src="assets/prancheta.svg" width="18" height="18" style="vertical-align:middle"> Sobre

O **NFS-e Monitor** é uma aplicação desktop desenvolvida especificamente para **escritórios de contabilidade de pequeno e médio porte** que precisam gerenciar eficientemente as Notas Fiscais de Serviço Eletrônicas (NFS-e) emitidas por seus clientes no portal NFS-e Nacional.

O sistema elimina a necessidade de acessar individualmente o portal para cada cliente, centralizando todas as informações em uma interface única, intuitiva e otimizada para a rotina contábil.

---

## <img src="assets/foguete.svg" width="18" height="18" style="vertical-align:middle"> Funcionalidades

<table>
<tr>
<td width="50%">

### <img src="assets/grafico-barras.svg" width="18" height="18" style="vertical-align:middle"> Dashboard Analítico
- Visualização consolidada de notas por empresa
- Indicadores de valor total, autorizadas, canceladas e substituídas
- Filtros por competência, período e status
- Gráficos e métricas em tempo real

### <img src="assets/pasta.svg" width="18" height="18" style="vertical-align:middle"> Gestão de Empresas
- Cadastro ilimitado de clientes
- Autenticação via certificado digital (A1) ou senha do portal
- Identificação visual por cores
- Alertas de vencimento de certificado

</td>
<td width="50%">

### <img src="assets/refresh.svg" width="18" height="18" style="vertical-align:middle"> Sincronização Automática
- Sincronização manual ou automática (agendada)
- Download automático de XMLs
- Atualização de status em tempo real
- Suporte a múltiplas empresas simultaneamente

### <img src="assets/grafico-subindo.svg" width="18" height="18" style="vertical-align:middle"> Relatórios e Exportações
- Relatórios PDF por competência
- Exportação Excel completa
- Identificação de divergências de competência
- DANFSE e XML individual ou em lote

</td>
</tr>
</table>

---

## 📥 Instalação

### Requisitos
- Windows 10 ou superior (64-bit)
- Certificado digital A1 (opcional, alternativa: senha do portal)

### Download
Acesse a [página de releases](https://github.com/matheuscardosos/Nfs-e-Monitor/releases) e baixe a versão mais recente:

```
NFS-e-Monitor-Setup-X.X.X.exe
```

### Instalação Rápida
1. Execute o instalador baixado
2. Siga o assistente de instalação
3. Atalhos serão criados automaticamente na área de trabalho e menu iniciar
4. Pronto para usar

---

## <img src="assets/monitor.svg" width="18" height="18" style="vertical-align:middle"> Primeiros Passos

### 1. Adicionar uma Empresa
```
Menu Empresas → Nova Empresa
```
- Escolha o método de autenticação (Certificado ou Senha)
- Informe os dados de acesso
- O sistema buscará automaticamente os dados da empresa

### 2. Sincronizar Notas
```
Selecione a empresa → Ícone de sincronização
```
- Defina o período desejado
- Aguarde a conclusão da sincronização
- As notas aparecerão automaticamente no dashboard

### 3. Gerar Relatórios
```
Dashboard → Botão "Gerar Relatório"
```
- Exporte para Excel ou PDF
- Filtre por período, status ou competência

---

## <img src="assets/construcao.svg" width="18" height="18" style="vertical-align:middle"> Arquitetura

O sistema foi desenvolvido com tecnologias modernas e robustas:

| Componente | Tecnologia | Propósito |
|------------|------------|-----------|
| Framework | [Electron](https://www.electronjs.org/) | Aplicação desktop multiplataforma |
| Runtime | [Node.js](https://nodejs.org/) | Execução JavaScript server-side |
| Database | [SQLite](https://www.sqlite.org/) | Armazenamento local estruturado |
| PDF Engine | Electron `printToPDF` | Geração de relatórios PDF |
| Excel Export | [ExcelJS](https://github.com/exceljs/exceljs) | Exportação de planilhas |
| Crypto | [node-forge](https://github.com/digitalbazaar/forge) | Processamento de certificados |
| HTTP Client | [axios](https://axios-http.com/) | Integração com APIs |

---

## <img src="assets/cadeado.svg" width="18" height="18" style="vertical-align:middle"> Segurança e Privacidade

### Armazenamento Local
- <img src="assets/check.svg" width="18" height="18" style="vertical-align:middle"> Todos os dados são armazenados **exclusivamente no computador local**
- <img src="assets/check.svg" width="18" height="18" style="vertical-align:middle"> Nenhuma informação é transmitida ou armazenada em servidores externos
- <img src="assets/check.svg" width="18" height="18" style="vertical-align:middle"> Banco de dados SQLite criptografado localmente
- <img src="assets/check.svg" width="18" height="18" style="vertical-align:middle"> Credenciais processadas apenas em memória

### Responsabilidades do Usuário
O usuário é responsável por:
- Manter o ambiente de rede seguro e isolado
- Realizar backups regulares dos dados
- Proteger arquivos de certificados digitais
- Manter sistema operacional e antivírus atualizados

> **Aviso Legal**: O funcionamento depende da disponibilidade e estabilidade do portal NFS-e Nacional. Não há garantia de compatibilidade futura com alterações no sistema oficial. O software é fornecido no estado atual, sem garantias explícitas ou implícitas de qualquer natureza.

---

## <img src="assets/prancheta.svg" width="18" height="18" style="vertical-align:middle"> Requisitos do Sistema

| Especificação | Mínimo | Recomendado |
|---------------|--------|-------------|
| Sistema Operacional | Windows 10 | Windows 11 |
| Arquitetura | 64-bit | 64-bit |
| Memória RAM | 4 GB | 8 GB |
| Espaço em Disco | 500 MB | 2 GB |
| Conectividade | Internet 2 Mbps | Internet 10 Mbps |

---

## <img src="assets/bug.svg" width="18" height="18" style="vertical-align:middle"> Suporte e Contribuições

### Reportar Problemas
Encontrou um bug ou tem uma sugestão? Abra uma issue em nosso [repositório GitHub](https://github.com/matheuscardosos/Nfs-e-Monitor/issues).

### Atualizações
O sistema inclui atualização automática. Quando uma nova versão estiver disponível, você será notificado e poderá instalar com um clique.

---

## <img src="assets/documento.svg" width="18" height="18" style="vertical-align:middle"> Licença

**AGPL-3.0** © 2026 Matheus Cardoso

> Este software é distribuído sob a [GNU Affero General Public License v3.0](LICENSE). Consulte o arquivo [LICENSE](LICENSE) para os termos completos de uso.

---

<p align="center">
  <sub>Projeto mantido por <a href="https://github.com/matheuscardosos">Matheus Cardoso</a></sub>
</p>
