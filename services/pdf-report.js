const { BrowserWindow } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');

function gerarRelatorioPDF(empresa, notas, competencia, outputPath, logoBase64) {
  return new Promise(async (resolve, reject) => {
    let win = null;
    const tmpFile = path.join(os.tmpdir(), `nfse_pdf_${Date.now()}.html`);
    try {
      const autorizadas    = notas.filter(n => n.status === 'Autorizada');
      const canceladas     = notas.filter(n => n.status === 'Cancelada' || n.status === 'Substituida');
      const totalServico   = autorizadas.reduce((s, n) => s + (n.valor_servico   || 0), 0);
      const totalRetencoes = autorizadas.reduce((s, n) =>
        s + (n.iss_retido||0) + (n.pis_retido||0) + (n.cofins_retido||0)
          + (n.ir_retido ||0) + (n.csll_retido||0) + (n.inss_retido   ||0), 0);
      const totalLiquido   = autorizadas.reduce((s, n) => s + (n.valor_liquido   || 0), 0);

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 10mm; size: A4 landscape; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    color: #1a2130;
    background: #fff;
  }

  /* ── CABEÇALHO ─────────────────────────────────────────────────────── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 32px 20px;
    border-bottom: 2px solid #163d72;
  }

  .header-logo img {
    height: 120px;        /* logotipo */
    width: auto;
    display: block;
  }

  .header-logo .logo-fallback {
    font-size: 22px;
    font-weight: 700;
    color: #163d72;
    letter-spacing: -0.5px;
  }

  .header-info {
    text-align: right;
  }

  .header-info .report-title {
    font-size: 15px;
    font-weight: 700;
    color: #163d72;
    letter-spacing: 0.3px;
    margin-bottom: 6px;
  }

  .header-info .report-meta {
    font-size: 10px;
    color: #6b7585;
    line-height: 1.8;
  }

  /* ── CORPO ──────────────────────────────────────────────────────────── */
  .body { padding: 20px 32px 0; }

  /* — Empresa — */
  .empresa-block {
    background: #f3f6fb;
    border-left: 3px solid #163d72;
    padding: 12px 16px;
    margin-bottom: 18px;
    display: flex;
    gap: 48px;
    align-items: center;
  }

  .empresa-block .field-label {
    font-size: 9px;
    font-weight: 700;
    color: #6b7585;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }

  .empresa-block .field-value {
    font-size: 12px;
    font-weight: 600;
    color: #1a2130;
  }

  /* — Indicadores — */
  .indicators {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    border: 1px solid #dde3ed;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 18px;
  }

  .ind-item {
    padding: 14px 20px;
    border-right: 1px solid #dde3ed;
  }

  .ind-item:last-child { border-right: none; }

  .ind-item .ind-label {
    font-size: 9px;
    font-weight: 700;
    color: #6b7585;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .ind-item .ind-number {
    font-size: 26px;
    font-weight: 700;
    line-height: 1;
  }

  .ind-item .ind-number.total   { color: #163d72; }
  .ind-item .ind-number.success { color: #127847; }
  .ind-item .ind-number.danger  { color: #b72121; }
  .ind-item .ind-number.neutral { color: #6b7585; }

  /* — Totais — */
  .totals-bar {
    background: #163d72;
    border-radius: 6px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin-bottom: 22px;
    overflow: hidden;
  }

  .tot-item {
    padding: 12px 20px;
    border-right: 1px solid #1e4d8a;
  }

  .tot-item:last-child { border-right: none; }

  .tot-item .tot-label {
    font-size: 9px;
    color: #93b8e0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 5px;
  }

  .tot-item .tot-value {
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
  }

  /* — Tabela — */
  .table-title {
    font-size: 10px;
    font-weight: 700;
    color: #6b7585;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 8px;
    padding-left: 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
  }

  thead th {
    background: #163d72;
    color: #c5d9f0;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 8px 7px;
    white-space: nowrap;
  }

  thead th.num { text-align: right; }
  thead th.txt { text-align: left;  }

  tbody tr:nth-child(even) td { background: #f7f9fc; }
  tbody tr:hover td { background: #eef3fb; }

  tbody tr.cancelada td { color: #b72121; }
  tbody tr.cancelada td { background: #fdf2f2 !important; }

  tbody td {
    padding: 7px 7px;
    border-bottom: 1px solid #e8ecf3;
    white-space: nowrap;
    vertical-align: middle;
  }

  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-family: 'Courier New', monospace;
    font-size: 9px;
  }

  td.txt { text-align: left; }

  tbody tr:last-child td { border-bottom: none; }

  .table-wrap {
    border: 1px solid #dde3ed;
    border-radius: 6px;
    overflow: hidden;
  }

  /* — Rodapé — */
  .footer {
    margin: 20px 32px 0;
    padding: 12px 0;
    border-top: 1px solid #dde3ed;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 9px;
    color: #9aa3b0;
  }

  @page {
    size: A4 landscape;
    margin: 10mm;
  }

  @media print {
    thead { display: table-header-group; }
    tbody tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- ── CABEÇALHO ──────────────────────────────────────────────── -->
<div class="header">
  <div class="header-logo">
    ${logoBase64
      ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo">`
      : `<span class="logo-fallback">NFS-e Monitor</span>`}
  </div>
  <div class="header-info">
    <div class="report-title">RELATÓRIO FISCAL DE COMPETÊNCIA</div>
    <div class="report-meta">
      Competência: <strong>${competencia}</strong><br>
      Emitido em: ${new Date().toLocaleString('pt-BR')}<br>
      ${empresa.razao_social || ''} &nbsp;·&nbsp; CNPJ ${empresa.cnpj || ''}
    </div>
  </div>
</div>

<!-- ── CORPO ──────────────────────────────────────────────────── -->
<div class="body">

  <!-- Empresa -->
  <div class="empresa-block">
    <div>
      <div class="field-label">Razão Social</div>
      <div class="field-value">${empresa.razao_social || 'N/A'}</div>
    </div>
    <div>
      <div class="field-label">CNPJ</div>
      <div class="field-value">${empresa.cnpj || 'N/A'}</div>
    </div>
    <div>
      <div class="field-label">Mês de Referência</div>
      <div class="field-value">${competencia}</div>
    </div>
  </div>

  <!-- Indicadores -->
  <div class="indicators">
    <div class="ind-item">
      <div class="ind-label">Total de Notas</div>
      <div class="ind-number total">${notas.length}</div>
    </div>
    <div class="ind-item">
      <div class="ind-label">Autorizadas</div>
      <div class="ind-number ${autorizadas.length > 0 ? 'success' : 'neutral'}">${autorizadas.length}</div>
    </div>
    <div class="ind-item">
      <div class="ind-label">Canceladas</div>
      <div class="ind-number ${canceladas.length > 0 ? 'danger' : 'neutral'}">${canceladas.length}</div>
    </div>
  </div>

  <!-- Totais -->
  <div class="totals-bar">
    <div class="tot-item">
      <div class="tot-label">Valor de Serviços</div>
      <div class="tot-value">${fmtM(totalServico)}</div>
    </div>
    <div class="tot-item">
      <div class="tot-label">Total de Retenções</div>
      <div class="tot-value">${fmtM(totalRetencoes)}</div>
    </div>
    <div class="tot-item">
      <div class="tot-label">Valor Líquido</div>
      <div class="tot-value">${fmtM(totalLiquido)}</div>
    </div>
  </div>

  <!-- Tabela -->
  <div class="table-title">Detalhamento das Notas Fiscais de Serviço</div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="txt">Data</th>
          <th class="txt">Nº Nota</th>
          <th class="num">Valor Serviço</th>
          <th class="num">ISS Ret.</th>
          <th class="num">PIS Ret.</th>
          <th class="num">COFINS Ret.</th>
          <th class="num">IR Ret.</th>
          <th class="num">CSLL Ret.</th>
          <th class="num">INSS Ret.</th>
          <th class="num">Valor Líquido</th>
          <th class="txt">CNPJ Tomador</th>
          <th class="txt">Razão Social Tomador</th>
        </tr>
      </thead>
      <tbody>
        ${notas.map(nota => {
          const cancelada = nota.status === 'Cancelada' || nota.status === 'Substituida';
          return `
          <tr class="${cancelada ? 'cancelada' : ''}">
            <td class="txt">${nota.data_emissao || ''}</td>
            <td class="txt">${nota.numero || ''}</td>
            <td class="num">${fmtM(nota.valor_servico  || 0)}</td>
            <td class="num">${fmtM(nota.iss_retido     || 0)}</td>
            <td class="num">${fmtM(nota.pis_retido     || 0)}</td>
            <td class="num">${fmtM(nota.cofins_retido  || 0)}</td>
            <td class="num">${fmtM(nota.ir_retido      || 0)}</td>
            <td class="num">${fmtM(nota.csll_retido    || 0)}</td>
            <td class="num">${fmtM(nota.inss_retido    || 0)}</td>
            <td class="num">${fmtM(nota.valor_liquido  || 0)}</td>
            <td class="txt">${nota.tomador_cnpj  || ''}</td>
            <td class="txt">${(nota.tomador_razao || '').substring(0, 35)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

</div>

<!-- ── RODAPÉ ─────────────────────────────────────────────────── -->
<div class="footer">
  <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
</div>

</body>
</html>`;

      await fs.promises.writeFile(tmpFile, html, 'utf-8');

      win = new BrowserWindow({
        show: false,
        width: 1400,
        height: 900,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          javascript: true,
        }
      });

      await win.loadFile(tmpFile);

      const pdfBuffer = await win.webContents.printToPDF({
        pageSize: 'A4',
        landscape: true,
        printBackground: true,
        marginsType: 1,
      });

      await fs.promises.writeFile(outputPath, pdfBuffer);
      console.log('PDF gerado:', outputPath);
      resolve(outputPath);

    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      reject(err);
    } finally {
      if (win && !win.isDestroyed()) win.close();
      fs.unlink(tmpFile, () => {});
    }
  });
}

function fmtM(v) {
  return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

module.exports = { gerarRelatorioPDF };
