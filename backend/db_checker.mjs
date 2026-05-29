// ─────────────────────────────────────────────
// db_checker.mjs — Data consistency checker
// 从 main.js 内联版本提取（改进版），保持完全一致的行为
// ─────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { CustNoShardingUtil } from './hash_utils.mjs';

export class DataConsistencyChecker {
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

  // ── 递归解析所有需要查询的直接和间接依赖表 ─────────────────────────────
  resolveTablesToQuery(tables, tableSettings = {}) {
    const allTables = new Set(tables);
    const queue = [...tables];

    while (queue.length > 0) {
      const current = queue.shift();
      const config = tableSettings[current];
      if (config && config.conditionFields) {
        for (const cond of config.conditionFields) {
          if (cond.source === 'table') {
            const depTable = (cond.path || '').split('.')[0];
            if (depTable && !allTables.has(depTable)) {
              allTables.add(depTable);
              queue.push(depTable);
            }
          }
        }
      }
    }
    return Array.from(allTables);
  }

  // ── 拓扑排序：保证被依赖的表先执行查询 ───────────────────────────────
  topologicalSort(allTables, tableSettings = {}) {
    const sorted = [];
    const remaining = [...allTables];
    const maxPasses = allTables.length + 1;
    let pass = 0;
    while (remaining.length > 0 && pass < maxPasses) {
      pass++;
      const nextRound = [];
      for (const t of remaining) {
        const deps = (tableSettings[t]?.conditionFields || [])
          .filter(c => c.source === 'table')
          .map(c => (c.path || '').split('.')[0])
          .filter(Boolean);
        // 如果依赖的表已经排好序，或者根本不在待查询的表列表中（则无法查询，视为已解决），则依赖已解决
        const depsResolved = deps.every(d => sorted.includes(d) || !allTables.includes(d));
        if (depsResolved) {
          sorted.push(t);
        } else {
          nextRound.push(t);
        }
      }
      remaining.length = 0;
      remaining.push(...nextRound);
    }
    // 若有循环依赖，把剩余的追加到末尾
    for (const t of remaining) {
      sorted.push(t);
    }
    return sorted;
  }

  // ── 从给定对象中按路径提取属性值 ───────────────────────────────
  extractValue(data, path) {
    if (!data || !path) return null;
    let jsonPath = path.trim().replace(/^\$\.?/, ''); // 去掉 $. 或 $
    const keys = jsonPath.split('.');
    let current = data;
    for (const key of keys) {
      if (current && typeof current === 'object') {
        const arrayMatch = key.match(/^([^\[]+)\[(\d+)\]$/);
        if (arrayMatch) {
          const prop = arrayMatch[1];
          const idx = parseInt(arrayMatch[2], 10);
          current = current[prop]?.[idx];
        } else {
          current = current[key];
        }
      } else {
        return null;
      }
    }
    return current;
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

      // 扫描 tableConditions，收集共享的路由参数（如 cust_no, zone_val）
      let sharedCustNo = null;
      let sharedZoneVal = null;
      for (const tName of Object.keys(tableConditions)) {
        if (tableConditions[tName]) {
          if (tableConditions[tName].cust_no) sharedCustNo = String(tableConditions[tName].cust_no);
          if (tableConditions[tName].zone_val) sharedZoneVal = String(tableConditions[tName].zone_val);
        }
      }

      const allTables = this.resolveTablesToQuery(tables, tableSettings);
      const sortedTables = this.topologicalSort(allTables, tableSettings);

      for (const tableName of sortedTables) {
        if (!tables.includes(tableName)) {
          addLog(`[${tableName}] 作为过渡依赖表，进行过渡查询（不对该表进行最终断言）`);
        }
        addLog(tableName, 'TABLE');
        const baseConditions = { ...(tableConditions[tableName] || {}) };
        const tableConfig = tableSettings[tableName];

        if (tableConfig && tableConfig.conditionFields) {
          for (const cond of tableConfig.conditionFields) {
            // 如果已存在该条件，则不再重复提取
            if (baseConditions[cond.field] !== undefined && baseConditions[cond.field] !== null) {
              continue;
            }

            if (cond.source === 'table') {
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
            } else if (cond.source === 'request') {
              const val = this.extractValue(request.requestData, cond.path);
              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
                addLog(`[${tableName}] 从请求报文提取条件: ${cond.field} = ${val}`);
              }
            } else if (cond.source === 'custom') {
              const val = cond.customValue;
              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
                addLog(`[${tableName}] 用户自定义条件: ${cond.field} = ${val}`);
              }
            } else if (cond.source === 'route') {
              let val = null;
              if (cond.field === 'cust_no') {
                val = sharedCustNo || sharedZoneVal;
              } else if (cond.field === 'zone_val') {
                val = sharedZoneVal || sharedCustNo;
              }
              
              // 降级1：从 request.routingKey 提取（支持对象或直接数值）
              if (val === undefined || val === null) {
                if (request.routingKey) {
                  if (typeof request.routingKey === 'string' || typeof request.routingKey === 'number') {
                    val = String(request.routingKey);
                  } else if (request.routingKey.value !== undefined && request.routingKey.value !== null) {
                    val = String(request.routingKey.value);
                  } else {
                    val = this.extractValue(request.routingKey, cond.path);
                  }
                }
              }

              // 降级2：从 request.requestData 的常规路径或指定路径中提取
              if (val === undefined || val === null) {
                if (cond.path) {
                  val = this.extractValue(request.requestData, cond.path);
                }
                if (val === undefined || val === null) {
                  const commonPaths = ['txHeader.custNo', 'txHeader.cust_no', 'txBody.custNo', 'txBody.cust_no', 'cust_no', 'custNo', 'zone_val', 'zoneVal'];
                  for (const p of commonPaths) {
                    const tempVal = this.extractValue(request.requestData, p);
                    if (tempVal !== undefined && tempVal !== null) {
                      val = String(tempVal);
                      break;
                    }
                  }
                }
              }

              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
                addLog(`[${tableName}] 继承或解析路由/客户号条件: ${cond.field} = ${val}`);
              } else {
                if (cond.required) {
                  addLog(`[${tableName}] 警告: 无法获取必填的路由条件 ${cond.field}`, 'WARN');
                }
              }
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
          if (results.length > 0) {
            tableResultsCache[tableName] = results[0];
            // 动态补充共享的路由字段，方便未包含在 tableConditions 中的过渡表使用
            if (results[0].cust_no && !sharedCustNo) sharedCustNo = String(results[0].cust_no);
            if (results[0].zone_val && !sharedZoneVal) sharedZoneVal = String(results[0].zone_val);
          }
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

      // 扫描 tableConditions，收集共享的路由参数（如 cust_no, zone_val）
      let sharedCustNo = null;
      let sharedZoneVal = null;
      for (const tName of Object.keys(tableConditions)) {
        if (tableConditions[tName]) {
          if (tableConditions[tName].cust_no) sharedCustNo = String(tableConditions[tName].cust_no);
          if (tableConditions[tName].zone_val) sharedZoneVal = String(tableConditions[tName].zone_val);
        }
      }

      const allTables = this.resolveTablesToQuery(tables, tableSettings);
      const sortedTables = this.topologicalSort(allTables, tableSettings);

      for (const tableName of sortedTables) {
        if (!tables.includes(tableName)) {
          addLog(`[${tableName}] 作为过渡依赖表，进行过渡查询（不对该表进行最终断言）`);
        }
        addLog(tableName, 'TABLE');

        const baseConditions = { ...(tableConditions[tableName] || {}) };
        const tableConfig = tableSettings[tableName];
        if (tableConfig && tableConfig.conditionFields) {
          for (const cond of tableConfig.conditionFields) {
            // 如果已存在该条件，则不再重复提取
            if (baseConditions[cond.field] !== undefined && baseConditions[cond.field] !== null) {
              continue;
            }

            if (cond.source === 'table') {
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
            } else if (cond.source === 'request') {
              const val = this.extractValue(request.requestData, cond.path);
              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
              }
            } else if (cond.source === 'custom') {
              const val = cond.customValue;
              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
              }
            } else if (cond.source === 'route') {
              let val = null;
              if (cond.field === 'cust_no') {
                val = sharedCustNo || sharedZoneVal;
              } else if (cond.field === 'zone_val') {
                val = sharedZoneVal || sharedCustNo;
              }
              
              // 降级1：从 request.routingKey 提取
              if (val === undefined || val === null) {
                if (request.routingKey) {
                  if (typeof request.routingKey === 'string' || typeof request.routingKey === 'number') {
                    val = String(request.routingKey);
                  } else if (request.routingKey.value !== undefined && request.routingKey.value !== null) {
                    val = String(request.routingKey.value);
                  } else {
                    val = this.extractValue(request.routingKey, cond.path);
                  }
                }
              }

              // 降级2：从 request.requestData 的常规路径或指定路径中提取
              if (val === undefined || val === null) {
                if (cond.path) {
                  val = this.extractValue(request.requestData, cond.path);
                }
                if (val === undefined || val === null) {
                  const commonPaths = ['txHeader.custNo', 'txHeader.cust_no', 'txBody.custNo', 'txBody.cust_no', 'cust_no', 'custNo', 'zone_val', 'zoneVal'];
                  for (const p of commonPaths) {
                    const tempVal = this.extractValue(request.requestData, p);
                    if (tempVal !== undefined && tempVal !== null) {
                      val = String(tempVal);
                      break;
                    }
                  }
                }
              }

              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
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
          if (results.length > 0) {
            afterResultsCache[tableName] = results[0];
            // 动态补充共享的路由字段，方便未包含在 tableConditions 中的过渡表使用
            if (results[0].cust_no && !sharedCustNo) sharedCustNo = String(results[0].cust_no);
            if (results[0].zone_val && !sharedZoneVal) sharedZoneVal = String(results[0].zone_val);
          }
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
