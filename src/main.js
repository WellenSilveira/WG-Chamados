import { app, BrowserWindow, dialog, ipcMain, Menu, Notification } from 'electron';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

app.setName('WG Chamados');
app.setAppUserModelId(
  app.isPackaged
    ? 'com.squirrel.wg_chamados.WG Chamados'
    : 'com.wgchamados.desktop'
);
const legacyDataDir = path.join(app.getPath('appData'), 'iniciacao');
app.setPath('userData', path.join(app.getPath('appData'), 'WG Chamados'));
const dataDir = app.getPath('userData');
const databasePath = path.join(dataDir, 'chamados-local-db.json');
const previousDatabasePath = path.join(dataDir, 'pixie-local-db.json');
const legacyDatabasePaths = [
  path.join(legacyDataDir, 'chamados-local-db.json'),
  path.join(legacyDataDir, 'pixie-local-db.json'),
];

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

function verifyPasswordSync(password, storedHash) {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i.exec(storedHash);
  if (!match) return false;

  const salt = Buffer.from(match[1], 'hex');
  const expected = Buffer.from(match[2], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function sanitizeDatabase(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Os dados do banco local são inválidos.');
  }

  const users = (Array.isArray(payload.users) ? payload.users : []).map((user) => {
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      throw new Error('O registro de usuário no banco local é inválido.');
    }
    const { senha: legacyPassword, senhaHash, ...safeUser } = user;
    if (/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(senhaHash ?? '')) {
      return { ...safeUser, senhaHash };
    }
    if (typeof legacyPassword === 'string' && legacyPassword.length > 0) {
      return { ...safeUser, senhaHash: hashPasswordSync(legacyPassword) };
    }
    return safeUser;
  });
  const currentUser = payload.currentUser?.id
    ? { id: String(payload.currentUser.id) }
    : null;

  return { ...payload, users, currentUser };
}

function ensureDatabaseFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(databasePath)) {
    const legacyDatabasePath = legacyDatabasePaths.find((filePath) => fs.existsSync(filePath));
    if (legacyDatabasePath) {
      fs.copyFileSync(legacyDatabasePath, databasePath);
    }
  }

  if (!fs.existsSync(databasePath) && fs.existsSync(previousDatabasePath)) {
    fs.renameSync(previousDatabasePath, databasePath);
  }

  if (!fs.existsSync(databasePath)) {
    const seed = JSON.stringify({
      currentUser: null,
      users: [],
      tickets: [],
      assets: [],
      auditLogs: [],
      settings: { appName: 'WG Chamados', offlineMode: true },
    }, null, 2);
    fs.writeFileSync(databasePath, seed, 'utf-8');
  }
}

function readDatabase() {
  ensureDatabaseFile();
  const raw = fs.readFileSync(databasePath, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      currentUser: null,
      users: [],
      tickets: [],
      settings: { appName: 'WG Chamados', offlineMode: true },
    };
  }
  if (!parsed || !Object.keys(parsed).length) {
    return {
      currentUser: null,
      users: [],
      tickets: [],
      settings: { appName: 'WG Chamados', offlineMode: true },
    };
  }
  if (parsed.settings?.appName === 'Pixie OS') {
    parsed.settings.appName = 'WG Chamados';
  }
  const normalized = sanitizeDatabase(parsed);
  if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
    writeDatabase(normalized);
  }
  return normalized;
}

function writeDatabase(payload) {
  ensureDatabaseFile();
  const normalized = sanitizeDatabase(payload);
  fs.writeFileSync(databasePath, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

ipcMain.handle('db:get', () => readDatabase());
ipcMain.handle('db:save', (_, payload) => {
  const normalized = writeDatabase(payload);
  return createAutomaticBackupIfDue(normalized);
});
ipcMain.handle('auth:hash', (_, password) => {
  if (typeof password !== 'string' || !password) {
    throw new Error('Informe uma senha válida para gerar o hash.');
  }
  return hashPasswordSync(password);
});
ipcMain.handle('auth:verify', (_, password, storedHash) => {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    throw new Error('Os dados para verificação da senha são inválidos.');
  }
  return verifyPasswordSync(password, storedHash);
});
ipcMain.handle('db:path', () => databasePath);
ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.handle('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  if (window.isMaximized()) {
    window.unmaximize();
    return false;
  }
  window.maximize();
  return true;
});
ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
ipcMain.handle('notification:show', (_, title, body) => {
  if (!Notification.isSupported()) {
    throw new Error('Notificações nativas não estão disponíveis neste sistema.');
  }
  new Notification({ title: String(title), body: String(body) }).show();
  return true;
});
ipcMain.handle('backup:select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('backup:create', async () => {
  const database = readDatabase();
  const folder = database.settings?.backup?.folder;
  const fileName = `wg-chamados-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  let filePath;

  if (folder) {
    fs.mkdirSync(folder, { recursive: true });
    filePath = path.join(folder, fileName);
  } else {
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('documents'), fileName),
      filters: [{ name: 'Backup WG Chamados', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }

  fs.writeFileSync(filePath, JSON.stringify(database, null, 2), 'utf-8');
  return { filePath, createdAt: new Date().toISOString() };
});
ipcMain.handle('backup:restore', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Backup WG Chamados', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const restored = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
  if (!restored || !Array.isArray(restored.users) || !Array.isArray(restored.tickets)) {
    throw new Error('O arquivo selecionado não parece ser um backup válido do WG Chamados.');
  }
  return writeDatabase(restored);
});

function createAutomaticBackupIfDue(database) {
  const backup = database.settings?.backup;
  const intervals = { daily: 86400000, weekly: 604800000, monthly: 2592000000 };
  const interval = intervals[backup?.frequency];
  if (!interval || !backup?.folder) return database;

  const previous = Date.parse(backup.lastBackupAt ?? '');
  if (Number.isFinite(previous) && Date.now() - previous < interval) return database;

  fs.mkdirSync(backup.folder, { recursive: true });
  const fileName = `wg-chamados-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const nextDatabase = {
    ...database,
    settings: {
      ...database.settings,
      backup: { ...backup, lastBackupAt: new Date().toISOString() },
    },
  };
  fs.writeFileSync(path.join(backup.folder, fileName), JSON.stringify(nextDatabase, null, 2), 'utf-8');
  writeDatabase(nextDatabase);
  return nextDatabase;
}

const createWindow = () => {
  const splashStartedAt = Date.now();
  const splashImagePath = app.isPackaged
    ? path.join(process.resourcesPath, 'atom (2).png')
    : path.join(app.getAppPath(), 'src', 'assets', 'atom (2).png');
  const splashImage = fs.readFileSync(splashImagePath).toString('base64');
  const splashWindow = new BrowserWindow({
    width: 460,
    height: 520,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    frame: false,
    backgroundColor: '#e8edf3',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  const version = app.getVersion();
  const splashPage = `<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; }
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            background: #e8edf3;
            color: #1e293b;
            font-family: "Segoe UI", Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          main {
            display: flex;
            width: 100%;
            height: 100%;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 36px;
          }
          img {
            width: 190px;
            height: 190px;
            object-fit: contain;
            animation: breathe 3s ease-in-out infinite;
          }
          .crest-frame {
            display: flex;
            width: 200px;
            height: 200px;
            flex: 0 0 200px;
            align-items: center;
            justify-content: center;
          }
          h1 {
            margin: 24px 0 0;
            font-size: 22px;
            font-weight: 650;
            letter-spacing: .02em;
          }
          .progress {
            width: 190px;
            height: 3px;
            margin-top: 24px;
            overflow: hidden;
            border-radius: 999px;
            background: #cbd5e1;
            background-image: linear-gradient(90deg, transparent, #0f766e 20%, #0f766e 80%, transparent);
            background-repeat: no-repeat;
            background-size: 42% 100%;
            animation: progress 1.3s ease-in-out infinite;
          }
          footer {
            position: absolute;
            right: 18px;
            bottom: 15px;
            color: #64748b;
            font-size: 11px;
            letter-spacing: .04em;
          }
          @keyframes breathe {
            0%, 100% { width: 190px; height: 190px; }
            50% { width: 196px; height: 196px; }
          }
          @keyframes progress {
            from { background-position: -42% 0; }
            to { background-position: 242% 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after { animation-duration: .01ms !important; }
          }
        </style>
      </head>
      <body>
        <main>
          <div class="crest-frame">
            <img src="data:image/png;base64,${splashImage}" alt="WG Chamados">
          </div>
          <h1>WG Chamados</h1>
          <div class="progress" role="progressbar" aria-label="Carregando o aplicativo"></div>
        </main>
        <footer>v${version}</footer>
      </body>
    </html>`;

  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 640,
    minHeight: 480,
    title: 'WG Chamados',
    frame: false,
    show: false,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'app-icon.ico')
      : path.join(app.getAppPath(), 'src', 'assets', 'app-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  const sendWindowState = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  splashWindow.once('ready-to-show', () => splashWindow.show());
  const revealMainWindow = () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    if (!splashWindow.isDestroyed()) splashWindow.close();
  };
  mainWindow.once('ready-to-show', () => {
    const remainingSplashTime = Math.max(0, 1200 - (Date.now() - splashStartedAt));
    setTimeout(revealMainWindow, remainingSplashTime);
  });
  mainWindow.webContents.once('did-fail-load', (_, errorCode, errorDescription) => {
    console.error(`Falha ao carregar a janela principal (${errorCode}): ${errorDescription}`);
    revealMainWindow();
  });
  splashWindow.webContents.once('did-fail-load', (_, errorCode, errorDescription) => {
    console.error(`Falha ao carregar a tela de abertura (${errorCode}): ${errorDescription}`);
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashPage)}`).catch((error) => {
    console.error('Falha ao carregar a tela de abertura:', error);
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL).catch((error) => {
      console.error('Falha ao abrir o aplicativo:', error);
      revealMainWindow();
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)).catch((error) => {
      console.error('Falha ao abrir o aplicativo:', error);
      revealMainWindow();
    });
  }

};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const firstRunDelay = process.argv.includes('--squirrel-firstrun') ? 3000 : 0;
  setTimeout(createWindow, firstRunDelay);
  setInterval(() => {
    try {
      createAutomaticBackupIfDue(readDatabase());
    } catch (error) {
      console.error('Falha no backup automático:', error);
    }
  }, 60000);

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
