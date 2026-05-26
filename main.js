const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, Notification } = require('electron');
const path = require('path');
const log = require('electron-log/main');

// Configura logging
log.initialize();
log.transports.file.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB por arquivo
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';
// Sobrescreve console pra gravar no arquivo de log
Object.assign(console, log.functions);

let mainWindow;
let splashWindow;
let db;
let tray = null;
let isQuitting = false;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 320,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js')
    }
  });

  splashWindow.loadFile('splash.html');
  splashWindow.center();

  // Espera carregar antes de mostrar (evita janela vazia)
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });
}

// Detecta se iniciou no login (flag hidden)
const launchedAtLogin = process.argv.includes('--hidden');

// Bloqueio de instancia unica - previne multiplas janelas
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[app] Outra instancia ja esta rodando. Encerrando.');
  app.quit();
  process.exit(0);
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
  console.log('[app] Segunda instancia detectada, focando janela existente.');
  if (mainWindow) {
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
  }
});

function getMainWindow() {
  return mainWindow;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'NFS-e Monitor',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  // Corrige bug de input do teclado apos dialog
  mainWindow.on('focus', () => {
    mainWindow.webContents.focus();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

app.setAppUserModelId('com.nfse.monitor');

app.whenReady().then(async () => {
  const splashStartTime = Date.now();

  // Exibe splash primeiro
  if (!launchedAtLogin) createSplashWindow();

  const { initDatabase } = require('./services/database');
  db = await initDatabase(app.getPath('userData'));

  // Cria janela principal (oculta inicialmente)
  createWindow();

  // Fecha splash e exibe janela principal apos minimo de 3.5s
  const minSplashTime = launchedAtLogin ? 0 : 3500; // 3.5s minimo para o usuario ver o splash
  const elapsed = Date.now() - splashStartTime;
  const remaining = Math.max(0, minSplashTime - elapsed);

  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    if (!launchedAtLogin && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize();
      mainWindow.show();
      mainWindow.focus();
    }
  }, remaining);

  tray = new Tray(path.join(__dirname, 'build', 'icon.ico'));
  tray.setToolTip('NFS-e Monitor');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir', click: () => { mainWindow.maximize(); mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { mainWindow.maximize(); mainWindow.show(); mainWindow.focus(); });

  const { setupIpcHandlers } = require('./services/ipc-handlers');
  setupIpcHandlers(ipcMain, db, getMainWindow, dialog, app);

  // Configuracao de atualizacao automatica
  const { autoUpdater } = require('electron-updater');
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;  // Instala automaticamente ao sair
  // Desabilita notificacoes padrao em ingles

  // Verifica atualizacoes ao iniciar e a cada 30 minutos
  log.info('[update] Verificando atualizacoes ao iniciar...');
  autoUpdater.checkForUpdates().catch(e => log.warn('[update] Verificacao falhou:', e.message));

  setInterval(() => {
    log.info('[update] Verificando atualizacoes (intervalo 30min)...');
    autoUpdater.checkForUpdates().catch(e => {});
  }, 30 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    log.info('[update] Nova versao disponivel:', info.version);
    // Notificacao em PT-BR
    new Notification({
      title: 'NFS-e Monitor - Nova versao disponivel',
      body: `Versao ${info.version} disponivel. Baixando automaticamente...`,
      icon: path.join(__dirname, 'assets', 'icon.png')
    }).show();
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[update] Atualizacao baixada, pronta para instalar');
    // Notificacao em PT-BR
    new Notification({
      title: 'NFS-e Monitor - Atualizacao pronta',
      body: `Versao ${info.version} baixada. Sera instalada ao fechar o aplicativo ou reiniciar.`,
      icon: path.join(__dirname, 'assets', 'icon.png')
    }).show();
    if (mainWindow) {
      mainWindow.webContents.send('update-ready', info.version);
    }
  });

  autoUpdater.on('error', (err) => {
    log.error('[update] Erro:', err.message);
  });

  // Handlers IPC para atualizacao
  ipcMain.handle('install-update', () => {
    log.info('[update] Usuario solicitou instalacao');
    isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
  });

  // Dialog de mensagem nao-bloqueante
  ipcMain.handle('show-message', (_, msg) => {
    return dialog.showMessageBox(mainWindow, { type: 'info', title: 'NFS-e Monitor', message: String(msg), buttons: ['OK'] });
  });

  // Abre pasta de logs
  ipcMain.handle('open-log-folder', () => {
    const logPath = log.transports.file.getFile().path;
    require('electron').shell.showItemInFolder(logPath);
    return { path: logPath };
  });

  ipcMain.handle('get-log-path', () => {
    return log.transports.file.getFile().path;
  });

  // Inicia sempre com o Windows (minimizado na bandeja)
  app.setLoginItemSettings({
    openAtLogin: true,
    args: ['--hidden']
  });
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
