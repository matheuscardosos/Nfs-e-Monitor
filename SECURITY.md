<h1 align="center">Segurança do NFS-e Monitor</h1>

<p align="center">
  <strong>Informações sobre segurança, privacidade e limites de suporte</strong>
</p>

---

## Armazenamento de Dados

O NFS-e Monitor armazena todas as informações **exclusivamente no computador local** do usuário, incluindo:

- Dados cadastrais das empresas e CNPJs
- Credenciais de acesso ao portal NFS-e Nacional (senhas e certificados digitais A1)
- Notas fiscais sincronizadas e respectivos XMLs
- Configurações do sistema

Nenhuma informação é transmitida, armazenada ou processada em servidores externos. O banco de dados fica localizado em:

```
C:\Users\[usuario]\AppData\Roaming\nfse-monitor\
```

---

## Proteja Seu Banco de Dados

O arquivo de banco de dados (`.db`) contém informações sensíveis dos seus clientes, incluindo credenciais de acesso ao portal NFS-e Nacional.

> **Nunca compartilhe o arquivo `.db` com terceiros**, independentemente do motivo alegado: suporte técnico, auditoria, consultoria ou qualquer outra justificativa.

**Em caso de solicitação suspeita:**
- Nenhum desenvolvedor, colaborador ou representante deste projeto solicitará acesso ao seu banco de dados
- Nenhum membro deste projeto solicitará acesso remoto à sua máquina
- Desconfie de qualquer pessoa que alegue ser do suporte do NFS-e Monitor e peça esses dados

---

## Limites de Suporte

Este projeto **não oferece suporte remoto** de nenhuma natureza. Isso inclui:

- Acesso remoto à máquina via TeamViewer, AnyDesk ou ferramentas similares
- Solicitação de arquivos de banco de dados, certificados ou senhas
- Atendimento por telefone ou videochamada

O suporte é prestado **exclusivamente** via issues no repositório GitHub:

[github.com/matheuscardosos/Nfs-e-Monitor/issues](https://github.com/matheuscardosos/Nfs-e-Monitor/issues)

Qualquer contato fora desse canal não é oficial e não deve ser atendido.

---

## Responsabilidades do Usuário

O usuário é responsável por:

- Controlar quem tem acesso físico e remoto ao computador onde o software está instalado
- Realizar backups regulares do banco de dados em local seguro
- Proteger os arquivos de certificado digital A1 (`.pfx`)
- Não compartilhar credenciais do portal NFS-e Nacional com terceiros
- Manter o sistema operacional e antivírus atualizados

---

## Reportar Vulnerabilidades

Encontrou uma vulnerabilidade de segurança no software? **Não abra uma issue pública.**

Reporte de forma responsável abrindo uma [Security Advisory](https://github.com/matheuscardosos/Nfs-e-Monitor/security/advisories/new) diretamente no GitHub. A vulnerabilidade será avaliada e corrigida antes de qualquer divulgação pública.

---

<p align="center">
  <sub>Projeto mantido por <a href="https://github.com/matheuscardosos">Matheus Cardoso</a></sub>
</p>
