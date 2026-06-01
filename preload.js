const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  refocusWindow: () => ipcRenderer.invoke('refocus-window'),
  showConfirmDialog: (message) => ipcRenderer.invoke('show-confirm-dialog', message),

  // Empresas
  getEmpresas: () => ipcRenderer.invoke('get-empresas'),
  getEmpresa: (id) => ipcRenderer.invoke('get-empresa', id),
  addEmpresa: (data) => ipcRenderer.invoke('add-empresa', data),
  updateEmpresa: (id, data) => ipcRenderer.invoke('update-empresa', id, data),
  deleteEmpresa: (id) => ipcRenderer.invoke('delete-empresa', id),

  // Certificado
  selectCertificate: () => ipcRenderer.invoke('select-certificate'),
  parseCertificate: (filePath, password) => ipcRenderer.invoke('parse-certificate', filePath, password),
  fetchCnpjData: (cnpj) => ipcRenderer.invoke('fetch-cnpj-data', cnpj),
  testPortalLogin: (cnpj, senha) => ipcRenderer.invoke('test-portal-login', cnpj, senha),

  // Notas
  getNotas: (empresaId, competencia, status) => ipcRenderer.invoke('get-notas', empresaId, competencia, status),
  getCompetencias: (empresaId) => ipcRenderer.invoke('get-competencias', empresaId),
  getStats: (empresaId, competencia) => ipcRenderer.invoke('get-stats', empresaId, competencia),
  getReportByCompetencia: (empresaId) => ipcRenderer.invoke('get-report-by-competencia', empresaId),

  // Sincronizacao
  syncEmpresa: (empresaId, dataInicio, dataFim) => ipcRenderer.invoke('sync-empresa', empresaId, dataInicio, dataFim),
  syncAll: (dataInicio, dataFim) => ipcRenderer.invoke('sync-all', dataInicio, dataFim),
  onSyncProgress: (callback) => ipcRenderer.on('sync-progress', (_, data) => callback(data)),

  // Notas por periodo
  getNotasByRange: (empresaId, tipo, dataInicio, dataFim, status) => ipcRenderer.invoke('get-notas-by-range', empresaId, tipo, dataInicio, dataFim, status),

  getAlertas: () => ipcRenderer.invoke('get-alertas'),
  exportAlertas: (rows) => ipcRenderer.invoke('export-alertas', rows),
  repairNotasFromXml: () => ipcRenderer.invoke('repair-notas-from-xml'),

  // Exportacao
  exportExcel: (empresaId, filters) => ipcRenderer.invoke('export-excel', empresaId, filters),
  exportPdf: (empresaId, filters) => ipcRenderer.invoke('export-pdf', empresaId, filters),
  downloadXmlZip: (empresaId, filters) => ipcRenderer.invoke('download-xml-zip', empresaId, filters),
  downloadNotaXml: (notaId) => ipcRenderer.invoke('download-nota-xml', notaId),
  downloadNotaDanfe: (notaId) => ipcRenderer.invoke('download-nota-danfe', notaId),

  // Log de sync
  getSyncLog: (empresaId) => ipcRenderer.invoke('get-sync-log', empresaId),

  // Pausar empresa
  toggleAutoSyncPause: (empresaId) => ipcRenderer.invoke('toggle-autosync-pause', empresaId),

  // Auto-sincronizacao
  getAutoSyncConfig: () => ipcRenderer.invoke('get-autosync-config'),
  setAutoSyncConfig: (minutes) => ipcRenderer.invoke('set-autosync-config', minutes),
  stopAutoSync: () => ipcRenderer.invoke('stop-autosync'),
  onAutoSyncAlert: (callback) => ipcRenderer.on('autosync-alert', (_, data) => callback(data)),

  // Logs
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),

  // Stats do banco
  getDbStats: () => ipcRenderer.invoke('get-db-stats'),

  // Versao do app
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Progresso de reparo
  onRepairProgress: (callback) => ipcRenderer.on('repair-progress', (_, data) => callback(data)),

  // Notas Recebidas (Tomadas)
  syncEmpresaRecebidas: (empresaId, dataInicio, dataFim) => ipcRenderer.invoke('sync-empresa-recebidas', empresaId, dataInicio, dataFim),
  getNotasRecebidas: (empresaId, competencia, status) => ipcRenderer.invoke('get-notas-recebidas', empresaId, competencia, status),
  getNotasRecebidasByRange: (empresaId, tipo, dataInicio, dataFim, status) => ipcRenderer.invoke('get-notas-recebidas-by-range', empresaId, tipo, dataInicio, dataFim, status),
  exportExcelRecebidas: (empresaId, filters) => ipcRenderer.invoke('export-excel-recebidas', empresaId, filters),
  downloadXmlZipRecebidas: (empresaId, filters) => ipcRenderer.invoke('download-xml-zip-recebidas', empresaId, filters),

  // Dialogo nao-bloqueante
  showMessage: (msg) => ipcRenderer.invoke('show-message', msg),

  // Atualizacoes
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, version) => callback(version)),
  onUpdateReady: (callback) => ipcRenderer.on('update-ready', (_, version) => callback(version)),
  installUpdate: () => ipcRenderer.invoke('install-update'),
});
