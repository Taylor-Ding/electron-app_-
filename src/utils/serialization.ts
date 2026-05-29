// utils/serialization.js — TOML 序列化/反序列化工具
import { encryptPassword, decryptPassword } from './encryption.js';

/**
 * 将配置对象序列化为 TOML 字符串（带注释）
 * 覆盖：systemSettings、apiSettings、dbSettings、systemDbConfig
 */
export function serializeToToml(sysSettings, defaultTabSettings, apiCfg, dbCfg, sysDbCfg) {
  const lines = [];
  const ts = new Date().toISOString();

  lines.push(`# 数据一致性自动化核对工具 — 系统配置导出`);
  lines.push(`# 导出时间: ${ts}`);
  lines.push(`# 此文件可直接用文本编辑器修改后导入，请勿改变 TOML 结构层级`);
  lines.push(`# 密码字段已加密（格式: ENC:<密文>），导入时自动解密；也可手动将密文改为明文密码`);
  lines.push('');

  // ── 1. API 设置 ──────────────────────────────────────────────
  lines.push('# ╔══════════════════════════════════════════╗');
  lines.push('# ║  API 设置（各环境请求地址与 MAC 地址）  ║');
  lines.push('# ╚══════════════════════════════════════════╝');
  lines.push('');
  lines.push('[api]');
  lines.push(`# 路由查询服务地址（全局，不受环境影响）`);
  lines.push(`route_url = ${JSON.stringify(apiCfg.route_url || '')}`);
  lines.push('');

  const envList = ['T1', 'T2', 'SITA', 'DEV1', 'TEST', 'DEVS'];
  for (const env of envList) {
    lines.push(`[api.${env}]`);
    lines.push(`request_url = ${JSON.stringify(apiCfg[env]?.request_url || '')}`);
    lines.push(`mac_url     = ${JSON.stringify(apiCfg[env]?.mac_url || '')}`);
    lines.push('');
  }

  // ── 2. 系统级数据库配置 ──────────────────────────────────────
  lines.push('# ╔══════════════════════════════════════════╗');
  lines.push('# ║       系统级数据库连接配置（全局）       ║');
  lines.push('# ╚══════════════════════════════════════════╝');
  lines.push('');
  lines.push('[system_db]');
  lines.push(`host     = ${JSON.stringify(sysDbCfg.host || '')}`);
  lines.push(`port     = ${Number(sysDbCfg.port) || 5432}`);
  lines.push(`database = ${JSON.stringify(sysDbCfg.database || '')}`);
  lines.push(`user     = ${JSON.stringify(sysDbCfg.user || '')}`);
  lines.push(`password = ${JSON.stringify(encryptPassword(sysDbCfg.password || ''))}`);
  lines.push('');

  // ── 3. 环境级数据库配置 ──────────────────────────────────────
  lines.push('# ╔══════════════════════════════════════════╗');
  lines.push('# ║      各环境数据库数据源配置              ║');
  lines.push('# ╚══════════════════════════════════════════╝');
  lines.push('');
  for (const env of envList) {
    const sources = dbCfg[env] || [];
    if (sources.length === 0) {
      lines.push(`# [db.${env}] — 暂无数据源`);
      lines.push('');
    } else {
      sources.forEach((ds, i) => {
        lines.push(`[[db.${env}]]`);
        lines.push(`# 数据源 ${i + 1}`);
        lines.push(`dus      = ${JSON.stringify(ds.dus || 'bdus')}`);
        lines.push(`host     = ${JSON.stringify(ds.host || '')}`);
        lines.push(`port     = ${Number(ds.port) || 5432}`);
        lines.push(`database = ${JSON.stringify(ds.database || '')}`);
        lines.push(`user     = ${JSON.stringify(ds.user || '')}`);
        lines.push(`password = ${JSON.stringify(encryptPassword(ds.password || ''))}`);
        lines.push('');
      });
    }
  }

  // ── 4. 系统表配置（查询条件规则）────────────────────────────
  lines.push('# ╔══════════════════════════════════════════╗');
  lines.push('# ║     系统表配置（断言查询条件规则）       ║');
  lines.push('# ╚══════════════════════════════════════════╝');
  lines.push('# source 可选值: request（请求报文）| response（响应报文）| route（路由结果）| table（其他表）');
  lines.push('');

  const tables = sysSettings.tables || {};
  for (const [tableName, cfg] of Object.entries(tables)) {
    if (!cfg || typeof cfg !== 'object') continue;
    lines.push(`[tables.${tableName}]`);
    if (cfg.chineseName) { lines.push(`chinese_name = ${JSON.stringify(cfg.chineseName)}`); }
    lines.push(`primary_key = ${JSON.stringify(cfg.primaryKey || '')}`);
    lines.push(`dus         = ${JSON.stringify(cfg.dus || 'bdus')}`);
    lines.push(`ignore_fields = ${JSON.stringify(cfg.ignoreFields || '')}`);
    lines.push('');
    const conds = Array.isArray(cfg.conditionFields) ? cfg.conditionFields : [];
    conds.forEach((cond, i) => {
      lines.push(`[[tables.${tableName}.conditions]]`);
      lines.push(`# 条件 ${i + 1}`);
      lines.push(`field    = ${JSON.stringify(cond.field || '')}`);
      lines.push(`source   = ${JSON.stringify(cond.source || 'request')}`);
      lines.push(`path     = ${JSON.stringify(cond.path || '')}`);
      lines.push(`required = ${cond.required ? 'true' : 'false'}`);
      if (cond.customValue !== undefined) {
        lines.push(`custom_value = ${JSON.stringify(cond.customValue)}`);
      }
      if (cond.selectedTable) {
        lines.push(`selected_table = ${JSON.stringify(cond.selectedTable)}`);
      }
      lines.push('');
    });
  }

  // ── 5. 默认表配置（未自定义规则时作为兜底）────────────────────────────
  lines.push('');
  lines.push('# ╔══════════════════════════════════════════╗');
  lines.push('# ║   默认表配置（未自定义规则时作为兜底）     ║');
  lines.push('# ╚══════════════════════════════════════════╝');
  lines.push('');

  const defaultTables = defaultTabSettings.tables || {};
  for (const [tableName, cfg] of Object.entries(defaultTables)) {
    if (!cfg || typeof cfg !== 'object') continue;
    lines.push(`[default_tables.${tableName}]`);
    if (cfg.chineseName) { lines.push(`chinese_name = ${JSON.stringify(cfg.chineseName)}`); }
    lines.push(`primary_key = ${JSON.stringify(cfg.primaryKey || '')}`);
    lines.push(`dus         = ${JSON.stringify(cfg.dus || 'bdus')}`);
    lines.push(`ignore_fields = ${JSON.stringify(cfg.ignoreFields || '')}`);
    lines.push('');
    const conds = Array.isArray(cfg.conditionFields) ? cfg.conditionFields : [];
    conds.forEach((cond, i) => {
      lines.push(`[[default_tables.${tableName}.conditions]]`);
      lines.push(`# 条件 ${i + 1}`);
      lines.push(`field    = ${JSON.stringify(cond.field || '')}`);
      lines.push(`source   = ${JSON.stringify(cond.source || 'request')}`);
      lines.push(`path     = ${JSON.stringify(cond.path || '')}`);
      lines.push(`required = ${cond.required ? 'true' : 'false'}`);
      if (cond.customValue !== undefined) {
        lines.push(`custom_value = ${JSON.stringify(cond.customValue)}`);
      }
      if (cond.selectedTable) {
        lines.push(`selected_table = ${JSON.stringify(cond.selectedTable)}`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

/**
 * 从 TOML 字符串解析配置（手写解析，覆盖本工具导出的结构）
 * 返回 { newApiSettings, newDbSettings, newSystemDbConfig, newSystemSettings, newDefaultTableSettings } 或 null（解析失败）
 */
export function parseToml(text) {
  try {
    // 去掉注释行，保留有效内容
    const lines = text.split('\n').map(l => {
      const commentIdx = l.indexOf('#');
      // 只有不在引号内的 # 才算注释（简化处理：行首 # 或空格+#）
      if (commentIdx === -1) return l;
      // 检查 # 是否在字符串内
      let inStr = false;
      for (let i = 0; i < commentIdx; i++) {
        if (l[i] === '"') inStr = !inStr;
      }
      if (inStr) return l;
      return l.substring(0, commentIdx);
    }).map(l => l.trimEnd());

    // 构建简单的 TOML 解析状态机
    // 支持: [section], [[array_section]], key = value
    const result = {};
    let currentPath = []; // e.g. ['api', 'DEV1'] 或 ['db', 'DEV1'] (array)
    let isArrayTable = false;
    const arrayCounters = {}; // 记录 [[x.y]] 的当前索引

    const setDeep = (obj, pathParts, value) => {
      let cur = obj;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const k = pathParts[i];
        if (!(k in cur)) cur[k] = {};
        // 如果是数组，指向最后一个元素
        if (Array.isArray(cur[k])) {
          cur = cur[k][cur[k].length - 1];
        } else {
          cur = cur[k];
        }
      }
      const last = pathParts[pathParts.length - 1];
      cur[last] = value;
    };

    const getDeep = (obj, pathParts) => {
      let cur = obj;
      for (const k of pathParts) {
        if (cur == null) return undefined;
        if (Array.isArray(cur)) cur = cur[cur.length - 1];
        cur = cur[k];
      }
      return cur;
    };

    const parseValue = (raw) => {
      raw = raw.trim();
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
      if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
      if ((raw.startsWith('"') && raw.endsWith('"')) ||
          (raw.startsWith("'") && raw.endsWith("'"))) {
        return raw.slice(1, -1)
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t');
      }
      return raw;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // [[array.table]]
      const arrayMatch = trimmed.match(/^\[\[([^\]]+)\]\]$/);
      if (arrayMatch) {
        const path = arrayMatch[1].trim().split('.');
        isArrayTable = true;
        currentPath = path;
        // 确保路径上的数组存在
        let cur = result;
        for (let i = 0; i < path.length - 1; i++) {
          const k = path[i];
          if (!(k in cur)) cur[k] = {};
          if (Array.isArray(cur[k])) cur = cur[k][cur[k].length - 1];
          else cur = cur[k];
        }
        const last = path[path.length - 1];
        if (!Array.isArray(cur[last])) cur[last] = [];
        cur[last].push({});
        continue;
      }

      // [section.table]
      const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        const path = sectionMatch[1].trim().split('.');
        isArrayTable = false;
        currentPath = path;
        // 确保路径存在
        let cur = result;
        for (const k of path) {
          if (Array.isArray(cur[k])) { cur = cur[k][cur[k].length - 1]; continue; }
          if (!(k in cur)) cur[k] = {};
          cur = cur[k];
        }
        continue;
      }

      // key = value
      const kvMatch = trimmed.match(/^([\w_-]+)\s*=\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const value = parseValue(kvMatch[2].trim());
        // 找到当前 section 并设值
        let cur = result;
        for (const k of currentPath) {
          if (Array.isArray(cur[k])) { cur = cur[k][cur[k].length - 1]; continue; }
          if (!(k in cur)) cur[k] = {};
          cur = cur[k];
        }
        cur[key] = value;
      }
    }

    // ── 映射 TOML 结构 → 应用 state ──────────────────────────
    const newApiSettings = {
      route_url: result.api?.route_url || '',
    };
    const envList = ['T1', 'T2', 'SITA', 'DEV1', 'TEST', 'DEVS'];
    for (const env of envList) {
      newApiSettings[env] = {
        request_url: result.api?.[env]?.request_url || '',
        mac_url: result.api?.[env]?.mac_url || ''
      };
    }

    const sysDb = result.system_db || {};
    const newSystemDbConfig = {
      host: sysDb.host || '',
      port: Number(sysDb.port) || 5432,
      database: sysDb.database || '',
      user: sysDb.user || '',
      password: decryptPassword(sysDb.password || '')
    };

    const newDbSettings = {};
    for (const env of envList) {
      const arr = result.db?.[env];
      if (Array.isArray(arr)) {
        newDbSettings[env] = arr.map(ds => ({
          dus: ds.dus || 'bdus',
          host: ds.host || '',
          port: Number(ds.port) || 5432,
          database: ds.database || '',
          user: ds.user || '',
          password: decryptPassword(ds.password || '')
        }));
      } else {
        newDbSettings[env] = [];
      }
    }

    const rawTables = result.tables || {};
    const newSystemSettings = { tables: {} };
    for (const [tName, tCfg] of Object.entries(rawTables)) {
      if (!tCfg || typeof tCfg !== 'object') continue;
      const conds = Array.isArray(tCfg.conditions) ? tCfg.conditions : [];
      newSystemSettings.tables[tName] = {
        chineseName: tCfg.chinese_name || '',
        primaryKey: tCfg.primary_key || '',
        dus: tCfg.dus || 'bdus',
        ignoreFields: tCfg.ignore_fields || '',
        conditionFields: conds.map(c => ({
          field: c.field || '',
          source: c.source || 'request',
          path: c.path || '',
          required: Boolean(c.required),
          ...(c.custom_value !== undefined ? { customValue: c.custom_value } : {}),
          ...(c.selected_table ? { selectedTable: c.selected_table } : {})
        }))
      };
    }

    const rawDefaultTables = result.default_tables || {};
    const newDefaultTableSettings = { tables: {} };
    for (const [tName, tCfg] of Object.entries(rawDefaultTables)) {
      if (!tCfg || typeof tCfg !== 'object') continue;
      const conds = Array.isArray(tCfg.conditions) ? tCfg.conditions : [];
      newDefaultTableSettings.tables[tName] = {
        chineseName: tCfg.chinese_name || '',
        primaryKey: tCfg.primary_key || '',
        dus: tCfg.dus || 'bdus',
        ignoreFields: tCfg.ignore_fields || '',
        conditionFields: conds.map(c => ({
          field: c.field || '',
          source: c.source || 'request',
          path: c.path || '',
          required: Boolean(c.required),
          ...(c.custom_value !== undefined ? { customValue: c.custom_value } : {}),
          ...(c.selected_table ? { selectedTable: c.selected_table } : {})
        }))
      };
    }

    return { newApiSettings, newDbSettings, newSystemDbConfig, newSystemSettings, newDefaultTableSettings };
  } catch (err) {
    console.error('[parseToml] 解析失败:', err);
    return null;
  }
}
