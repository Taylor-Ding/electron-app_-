import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
/* global process */
import { writeFile } from 'fs/promises';
import sqlite3 from 'sqlite3';

let configDb;

function initConfigDB() {
  const dbPath = path.join(app.getPath('userData'), 'local_config.db');
  configDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('[main] 本地数据库连接失败:', err.message);
    } else {
      console.log('[main] 连接到本地数据库:', dbPath);
      configDb.run(`CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT
      )`);
    }
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 使用软件禁用硬件加速（避免 GPU 进程崩溃，Electron 31 已知问题）
app.disableHardwareAcceleration();

const isDev = process.env.NODE_ENV === 'development';

// ─────────────────────────────────────────────
// 导入后端模块（从 backend/ 独立模块，避免代码重复）
// ─────────────────────────────────────────────
import { HashUtils, CustNoShardingUtil } from './backend/hash_utils.mjs';
import { DataConsistencyChecker } from './backend/db_checker.mjs';
import { isPlainObject } from './backend/utils.mjs';

function startBackend() {
  console.log('Backend execution has been migrated to Node.js.');
}

let cachedTableSettings = {};
let backendProcess = null;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:4173';

// 注册 IPC：前端主动保存 tableSettings 到主进程
ipcMain.handle('save-table-settings', async (event, tableSettings) => {
  if (isPlainObject(tableSettings)) {
    cachedTableSettings = tableSettings;
    console.log('[main] tableSettings cached, tables:', Object.keys(tableSettings));
    return { ok: true };
  }
  return { ok: false, error: 'Invalid table settings payload' };
});

// 注册 IPC：执行数据一致性校验（拆分为前置/后置两步）
function normalizeCheckPayload(requestPayload) {
  let payload = { ...requestPayload };
  if (
    !isPlainObject(payload.tableSettings) ||
    Object.keys(payload.tableSettings).length === 0
  ) {
    if (Object.keys(cachedTableSettings).length > 0) {
      console.log('[main] tableSettings missing in payload, using cached version');
      payload = { ...payload, tableSettings: cachedTableSettings };
    }
  } else {
    cachedTableSettings = payload.tableSettings;
  }
  return payload;
}

// 接口调用前：查询各表当前状态
ipcMain.handle('run-before-check', async (event, requestPayload) => {
  if (!isPlainObject(requestPayload)) throw new Error('Invalid request payload');
  const configPath = path.join(__dirname, 'backend', 'config', 'config.json');
  const checker = new DataConsistencyChecker(configPath);
  return await checker.runBeforeCheck(normalizeCheckPayload(requestPayload));
});

// 接口调用后：查询各表最新状态并与前置结果比对
ipcMain.handle('run-after-check', async (event, requestPayload) => {
  if (!isPlainObject(requestPayload)) throw new Error('Invalid request payload');
  const configPath = path.join(__dirname, 'backend', 'config', 'config.json');
  const checker = new DataConsistencyChecker(configPath);
  return await checker.runAfterCheck(normalizeCheckPayload(requestPayload));
});

// 注册 IPC：查询系统数据库（通用单次查询）
ipcMain.handle('query-system-db', async (event, { dbConfig, sql, values = [] }) => {
  if (!dbConfig || !sql) {
    throw new Error('缺少数据库配置或 SQL 语句');
  }
  const { default: pg } = await import('pg');
  const { Client } = pg;
  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  try {
    const res = await client.query(sql, values);
    return { rows: res.rows };
  } finally {
    await client.end();
  }
});

// 注册 IPC：保存文件（导出配置）
ipcMain.handle('save-file', async (event, payload) => {
  try {
    const { content, filename } = payload ?? {};
    if (typeof content !== 'string' || typeof filename !== 'string') {
      return { success: false, error: 'Invalid save payload' };
    }
    const safeFilename = path.basename(filename);
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: safeFilename,
      filters: [
        { name: 'TOML 配置文件', extensions: ['toml'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) {
      return { success: false, cancelled: true };
    }
    await writeFile(filePath, content, 'utf-8');
    console.log('[main] 配置已导出到:', filePath);
    return { success: true, filePath };
  } catch (err) {
    console.error('[main] save-file 失败:', err);
    return { success: false, error: err.message };
  }
});

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    title: '数据一致性自动化核对工具',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      enableRemoteModule: false,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedPrefix = isDev ? DEV_SERVER_URL : 'file://';
    if (!url.startsWith(allowedPrefix)) {
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// 创建应用程序菜单，包含编辑功能
const createMenu = () => {
  const template = [
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'delete', label: '删除' },
        { role: 'selectall', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forcereload', label: '强制重新加载' },
        { role: 'toggledevtools', label: '切换开发者工具' },
        { type: 'separator' },
        { role: 'resetzoom', label: '重置缩放' },
        { role: 'zoomin', label: '放大' },
        { role: 'zoomout', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// 注册配置存储的 IPC
ipcMain.handle('get-config', (event, key) => {
  return new Promise((resolve, reject) => {
    if (!configDb) return resolve(null);
    configDb.get('SELECT value FROM app_config WHERE key = ?', [key], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.value : null);
    });
  });
});

ipcMain.handle('set-config', (event, key, value) => {
  return new Promise((resolve, reject) => {
    if (!configDb) return resolve({ success: false, error: 'DB not initialized' });
    configDb.run(
      'INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
      function (err) {
        if (err) {
          reject(err);
        } else {
          // 广播通知到所有窗口以实现实时多窗或本地状态同步
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('config-changed', { key, value });
            }
          });
          resolve({ success: true });
        }
      }
    );
  });
});

app.whenReady().then(() => {
  initConfigDB();
  createMenu();
  startBackend();
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', function () {
  stopBackend();
});
