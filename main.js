import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
/* global process */
import { writeFile } from 'fs/promises';
import fs from 'fs';
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

// 添加 GPU 相关的启动选项，解决 GPU 进程崩溃问题
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const isDev = process.env.NODE_ENV === 'development';

// ─────────────────────────────────────────────
// 内联 hash_utils.js（避免打包后 ESM 跨文件 import 路径解析问题）
// ─────────────────────────────────────────────
class HashUtils {
  static C1_32 = -862048943;
  static C2_32 = 461845907;
  static R1_32 = 15;
  static R2_32 = 13;
  static M_32 = 5;
  static N_32 = -430675100;
  static DEFAULT_SEED = 104729;

  static hash32(data) {
    let buffer;
    if (typeof data === 'string') {
      buffer = Buffer.from(data, 'utf8');
    } else if (Buffer.isBuffer(data)) {
      buffer = data;
    } else {
      throw new TypeError('data must be string or Buffer');
    }
    return HashUtils._hash32(buffer, 0, buffer.length, HashUtils.DEFAULT_SEED);
  }

  static _hash32(data, offset, length, seed) {
    let hash_val = seed | 0;
    const nblocks = length >> 2;
    let idx = 0;
    for (idx = 0; idx < nblocks; idx++) {
      const i = idx << 2;
      let k =
        (data[offset + i] & 0xff) |
        ((data[offset + i + 1] & 0xff) << 8) |
        ((data[offset + i + 2] & 0xff) << 16) |
        ((data[offset + i + 3] & 0xff) << 24);
      hash_val = HashUtils._mix32(k, hash_val);
    }
    idx = nblocks << 2;
    let k1 = 0;
    if (length - idx === 3) {
      k1 ^= data[offset + idx + 2] << 16;
      k1 ^= data[offset + idx + 1] << 8;
      hash_val = HashUtils._get_hash(data, offset, hash_val, idx, k1);
    } else if (length - idx === 2) {
      k1 ^= data[offset + idx + 1] << 8;
      hash_val = HashUtils._get_hash(data, offset, hash_val, idx, k1);
    } else if (length - idx === 1) {
      hash_val = HashUtils._get_hash(data, offset, hash_val, idx, k1);
    }
    return HashUtils._fmix32(length, hash_val);
  }

  static _get_hash(data, offset, hash_val, idx, k1) {
    k1 ^= data[offset + idx];
    k1 = Math.imul(k1, HashUtils.C1_32);
    k1 = HashUtils._rotate_left(k1, HashUtils.R1_32);
    k1 = Math.imul(k1, HashUtils.C2_32);
    hash_val ^= k1;
    return hash_val | 0;
  }

  static _mix32(k, hash_val) {
    k = Math.imul(k, HashUtils.C1_32);
    k = HashUtils._rotate_left(k, HashUtils.R1_32);
    k = Math.imul(k, HashUtils.C2_32);
    hash_val ^= k;
    let result =
      Math.imul(HashUtils._rotate_left(hash_val, HashUtils.R2_32), HashUtils.M_32) +
      HashUtils.N_32;
    return result | 0;
  }

  static _fmix32(length, hash_val) {
    hash_val ^= length;
    hash_val ^= hash_val >>> 16;
    hash_val = Math.imul(hash_val, -2048144789);
    hash_val ^= hash_val >>> 13;
    hash_val = Math.imul(hash_val, -1028477387);
    hash_val ^= hash_val >>> 16;
    return hash_val | 0;
  }

  static _rotate_left(x, n) {
    return (x << n) | (x >>> (32 - n));
  }
}

class CustNoShardingUtil {
  static calculate_hash(cust_no, total_sharding_table_number = 8) {
    let hash_key = HashUtils.hash32(cust_no);
    if (hash_key < 0) hash_key = Math.abs(hash_key);
    return (hash_key % total_sharding_table_number) + 1;
  }
}

// ─────────────────────────────────────────────
// 内联 db_checker.js
// ─────────────────────────────────────────────
class DataConsistencyChecker {
  constructor(configPath) {
    this.configPath = configPath;
    try {
      this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      this.config = { databases: {} };
      console.warn('Failed to load config.json:', err.message);
    }
  }

  getDbConfig(dbName) {
    return this.config.databases[dbName];
  }

  calculateRouting(custNoOrMedium, environment, baseName = 'tb_dpmst_medium') {
    let totalShardingTableNumber = 8;
    if (environment && ['T1', 'T2', 'SITA'].includes(environment.toUpperCase())) {
      totalShardingTableNumber = 16;
    }
    const hashResult = CustNoShardingUtil.calculate_hash(custNoOrMedium, totalShardingTableNumber);
    const dbIndex = Math.floor((hashResult - 1) / 2) + 1;
    const dbName = `dcdpdb${dbIndex}`;
    const tableSuffix = hashResult.toString().padStart(4, '0');
    return { dbName, tableNameWithSuffix: `${baseName}_${tableSuffix}`, hashResult, dbIndex };
  }

  quoteIdentifier(identifier, label = 'identifier') {
    if (typeof identifier !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
      throw new Error(`Invalid ${label}: ${identifier}`);
    }
    return `"${identifier}"`;
  }

  buildWhereClause(conditions) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return { clause: '1=1', values: [] };
    }
    const values = [];
    const clause = Object.entries(conditions)
      .map(([k, v], index) => {
        values.push(v);
        return `${this.quoteIdentifier(k, 'column')} = $${index + 1}`;
      })
      .join(' AND ');
    return { clause, values };
  }

  async queryDatabase(dbIndex, environment, dbSettings, sqlQuery, values = [], dus = 'bdus') {
    if (!dbSettings || !dbSettings[environment]) {
      throw new Error(
        `配置错误: 当前环境 ${environment} 未配置任何数据源，请先在数据库配置中添加！`
      );
    }
    const allSources = dbSettings[environment];
    const filteredSources = allSources.filter((ds) => (ds.dus || 'bdus') === dus);
    if (filteredSources.length === 0) {
      throw new Error(
        `配置错误: 当前环境 ${environment} 未配置 [${dus}] 类型的数据源，请先在数据库配置中添加！`
      );
    }
    if (!filteredSources[dbIndex - 1]) {
      throw new Error(
        `配置错误: 当前环境 ${environment} 的 [${dus}] 数据源不足 (需要第 ${dbIndex} 个分片，当前共 ${filteredSources.length} 个)，请添加更多数据源！`
      );
    }
    const dbConfig = filteredSources[dbIndex - 1];

    // pg 使用动态 import，避免打包后 native module 路径解析问题
    const { default: pg } = await import('pg');
    const { Client } = pg;

    const client = new Client({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });
    await client.connect();
    try {
      const res = await client.query(sqlQuery, values);
      return res.rows;
    } finally {
      await client.end();
    }
  }

  deepEqual(obj1, obj2, ignoreFields = []) {
    if (obj1 === obj2) return true;
    if (
      typeof obj1 !== 'object' ||
      obj1 === null ||
      typeof obj2 !== 'object' ||
      obj2 === null
    ) {
      return false;
    }

    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      if (obj1.length !== obj2.length) return false;
      for (let i = 0; i < obj1.length; i++) {
        if (!this.deepEqual(obj1[i], obj2[i], ignoreFields)) return false;
      }
      return true;
    }

    const keys1 = Object.keys(obj1).filter(k => !ignoreFields.includes(k));
    const keys2 = Object.keys(obj2).filter(k => !ignoreFields.includes(k));
    if (keys1.length !== keys2.length) return false;
    for (let key of keys1) {
      if (!keys2.includes(key) || !this.deepEqual(obj1[key], obj2[key], ignoreFields)) return false;
    }
    return true;
  }

  // ── 接口调用前：查询各表当前状态 ──────────────────────────────────
  async runBeforeCheck(request) {
    const logs = [];
    const addLog = (message, level = 'INFO') => {
      logs.push({ timestamp: new Date().toISOString(), level, message });
    };

    try {
      const {
        tables = [],
        tableConditions = {},
        tableSettings = {},
        environment = null,
      } = request;

      const beforeData = {};
      const tableResultsCache = {};

      for (const tableName of tables) {
        addLog(tableName, 'TABLE');
        const baseConditions = { ...(tableConditions[tableName] || {}) };
        const tableConfig = tableSettings[tableName];

        if (tableConfig && tableConfig.conditionFields) {
          for (const cond of tableConfig.conditionFields) {
            if (cond.source !== 'table') continue;
            const parts = (cond.path || '').split('.');
            const depTable = parts[0];
            const depField = parts.slice(1).join('.');
            if (depTable && depField && tableResultsCache[depTable]) {
              const val = tableResultsCache[depTable][depField];
              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
                addLog(`[${tableName}] 跨表依赖: ${cond.field} = ${val}（来自 ${depTable}）`);
              } else {
                addLog(`[${tableName}] 警告: 依赖表 ${depTable}.${depField} 为空`, 'WARN');
              }
            } else {
              addLog(`[${tableName}] 警告: 依赖表 ${depTable} 尚未查询`, 'WARN');
            }
          }
        }

        if (Object.keys(baseConditions).length === 0) {
          addLog(`[${tableName}] 无查询条件，跳过`, 'WARN');
          continue;
        }

        let routingValue = baseConditions.cust_no || baseConditions.zone_val;
        if (!routingValue) routingValue = Object.values(baseConditions)[0];

        const { dbName, tableNameWithSuffix, hashResult, dbIndex } = this.calculateRouting(
          routingValue, environment, tableName
        );
        const tableDus = tableSettings[tableName]?.dus || 'bdus';
        addLog(`[${tableName}] 路由 → ${tableNameWithSuffix} | 数据源${dbIndex}(${dbName}) hash=${hashResult} DUS:${tableDus}`);

        const safeTableName = this.quoteIdentifier(tableNameWithSuffix, 'table');
        const { clause: whereClause, values } = this.buildWhereClause(baseConditions);
        const sqlQuery = `SELECT * FROM ${safeTableName} WHERE ${whereClause}`;

        let displaySqlQuery = sqlQuery;
        values.forEach((val, idx) => {
          const valStr = typeof val === 'string' ? `'${val}'` : val;
          displaySqlQuery = displaySqlQuery.replace(new RegExp(`\\$${idx + 1}(?!\\d)`, 'g'), valStr);
        });

        addLog(`[${tableName}] ${displaySqlQuery}`, 'SQL');

        try {
          const results = await this.queryDatabase(dbIndex, environment, request.dbSettings, sqlQuery, values, tableDus);
          beforeData[tableName] = { sql: displaySqlQuery, count: results.length, data: results };
          addLog(`[${tableName}] 查询完成，共 ${results.length} 条记录`);
          if (results.length > 0) tableResultsCache[tableName] = results[0];
        } catch (e) {
          addLog(`[${tableName}] 查询失败: ${e.message}`, 'ERROR');
          throw e;
        }
      }

      return { success: true, logs, beforeData };
    } catch (e) {
      addLog(`执行失败: ${e.message}`, 'ERROR');
      return { success: false, logs, beforeData: {}, error: e.message };
    }
  }

  // ── 接口调用后：查询各表最新状态并与前置结果比对 ─────────────────
  async runAfterCheck(request) {
    const logs = [];
    const addLog = (message, level = 'INFO') => {
      logs.push({ timestamp: new Date().toISOString(), level, message });
    };

    try {
      addLog('【接口后】开始执行后置 SQL 查询...');
      const {
        tables = [],
        tableConditions = {},
        tableSettings = {},
        environment = null,
        beforeData = {},
      } = request;

      const afterData = {};
      const afterResultsCache = {};

      // ── 对 tables 做简单拓扑排序：保证被依赖的表先执行查询 ──────────────
      const sortedTables = [];
      const remaining = [...tables];
      const maxPasses = tables.length + 1;
      let pass = 0;
      while (remaining.length > 0 && pass < maxPasses) {
        pass++;
        const nextRound = [];
        for (const t of remaining) {
          const deps = (tableSettings[t]?.conditionFields || [])
            .filter(c => c.source === 'table')
            .map(c => (c.path || '').split('.')[0])
            .filter(Boolean);
          const depsResolved = deps.every(d => sortedTables.includes(d) || !tables.includes(d));
          if (depsResolved) {
            sortedTables.push(t);
          } else {
            nextRound.push(t);
          }
        }
        remaining.length = 0;
        remaining.push(...nextRound);
      }
      // 若有循环依赖导致无法解析，把剩余的追加到末尾
      for (const t of remaining) sortedTables.push(t);

      for (const tableName of sortedTables) {
        addLog(tableName, 'TABLE');

        const baseConditions = { ...(tableConditions[tableName] || {}) };
        if (
          Object.keys(baseConditions).length === 0 &&
          !tableSettings[tableName]?.conditionFields?.some((c) => c.source === 'table')
        ) continue;

        const tableConfig = tableSettings[tableName];
        if (tableConfig && tableConfig.conditionFields) {
          for (const cond of tableConfig.conditionFields) {
            if (cond.source !== 'table') continue;
            const parts = (cond.path || '').split('.');
            const depTable = parts[0];
            const depField = parts.slice(1).join('.');
            if (depTable && depField && afterResultsCache[depTable]) {
              const val = afterResultsCache[depTable][depField];
              if (val !== undefined && val !== null) baseConditions[cond.field] = String(val);
            } else if (depTable && depField && beforeData[depTable]?.data?.length > 0) {
              // fallback：若 afterResultsCache 还没有，从 beforeData 的第一条记录中读取依赖值
              const val = beforeData[depTable].data[0][depField];
              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
                addLog(`[${tableName}] 跨表依赖 fallback（来自 before 快照）: ${cond.field} = ${val}（${depTable}.${depField}）`);
              }
            }
          }
        }

        if (Object.keys(baseConditions).length === 0) continue;

        let routingValue = baseConditions.cust_no || baseConditions.zone_val;
        if (!routingValue) routingValue = Object.values(baseConditions)[0];

        const tableDus = tableSettings[tableName]?.dus || 'bdus';
        const { dbName: _dbName, tableNameWithSuffix, dbIndex } = this.calculateRouting(routingValue, environment, tableName);
        const safeTableName = this.quoteIdentifier(tableNameWithSuffix, 'table');
        const { clause: whereClause, values } = this.buildWhereClause(baseConditions);
        const sqlQuery = `SELECT * FROM ${safeTableName} WHERE ${whereClause}`;

        let displaySqlQuery = sqlQuery;
        values.forEach((val, idx) => {
          const valStr = typeof val === 'string' ? `'${val}'` : val;
          displaySqlQuery = displaySqlQuery.replace(new RegExp(`\\$${idx + 1}(?!\\d)`, 'g'), valStr);
        });

        addLog(`[${tableName}] ${displaySqlQuery}`, 'SQL');

        try {
          const results = await this.queryDatabase(dbIndex, environment, request.dbSettings, sqlQuery, values, tableDus);
          afterData[tableName] = { sql: displaySqlQuery, count: results.length, data: results };
          addLog(`[${tableName}] 查询完成，共 ${results.length} 条记录`);
          if (results.length > 0) afterResultsCache[tableName] = results[0];
        } catch (e) {
          addLog(`[${tableName}] 查询失败: ${e.message}`, 'ERROR');
          throw e;
        }
      }

      const resultsArray = [];
      addLog(`[诊断] runAfterCheck tables: ${tables.join(', ')}`);
      addLog(`[诊断] beforeData keys: ${Object.keys(beforeData).join(', ')}`);
      addLog(`[诊断] afterData keys: ${Object.keys(afterData).join(', ')}`);
      for (const tableName of tables) {
        // 前置数据：若 beforeData 中没有该表，说明该表依赖响应报文条件，前置阶段未查询
        const beforeRaw = beforeData[tableName];
        const afterRaw  = afterData[tableName];
        addLog(`[诊断] ${tableName} before=${beforeRaw ? `sql存在:${!!beforeRaw.sql}, count:${beforeRaw.count}` : 'null/undefined'} after=${afterRaw ? `sql存在:${!!afterRaw.sql}, count:${afterRaw.count}` : 'null/undefined'}`);
        const before = beforeRaw || { sql: '（该表依赖响应报文条件，前置阶段跳过查询）', count: 0, data: [] };
        const after  = afterRaw  || { sql: '（查询条件不满足，本轮未执行后置查询）', count: 0, data: [] };
        if (before.error || after.error) {
          addLog(`[${tableName}] ✗ 查询出错`, 'ERROR');
          resultsArray.push({ table: tableName, status: '错误', message: before.error || after.error, before, after, diff: null });
          continue;
        }
        const beforeCount = before.count || 0;
        const afterCount = after.count || 0;
        
        let ignoreFields = [];
        if (tableSettings[tableName] && tableSettings[tableName].ignoreFields) {
          ignoreFields = tableSettings[tableName].ignoreFields.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (beforeCount === afterCount && this.deepEqual(before.data, after.data, ignoreFields)) {
          addLog(`[${tableName}] ✓ 数据一致（${beforeCount} 条记录无变化）`);
          resultsArray.push({ table: tableName, status: '通过', message: '数据一致性检查通过', before, after, diff: null });
        } else {
          addLog(`[${tableName}] ✗ 数据不一致（前:${beforeCount}条 → 后:${afterCount}条）`, 'WARN');
          resultsArray.push({ table: tableName, status: '失败', message: '数据不一致', before, after, diff: { count_changed: true } });
        }
      }
      return { success: true, logs, results: resultsArray };
    } catch (e) {
      addLog(`执行失败: ${e.message}`, 'ERROR');
      return { success: false, logs, results: [], error: e.message };
    }
  }
}

// ─────────────────────────────────────────────
// Electron 主进程逻辑
// ─────────────────────────────────────────────
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

createMenu();

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
        if (err) reject(err);
        else resolve({ success: true });
      }
    );
  });
});

app.whenReady().then(() => {
  initConfigDB();
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
