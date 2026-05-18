import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { CustNoShardingUtil } from './hash_utils.js';

const { Client } = pg;

export class DataConsistencyChecker {
  constructor(configPath) {
    this.configPath = configPath;
    try {
      this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      this.config = { databases: {} };
      console.warn("Failed to load config.json:", err.message);
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
      return { clause: "1=1", values: [] };
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
      throw new Error(`配置错误: 当前环境 ${environment} 未配置任何数据源，请先在数据库配置中添加！`);
    }
    // 按 DUS 类型过滤数据源
    const allSources = dbSettings[environment];
    const filteredSources = allSources.filter(ds => (ds.dus || 'bdus') === dus);

    if (filteredSources.length === 0) {
      throw new Error(`配置错误: 当前环境 ${environment} 未配置 [${dus}] 类型的数据源，请先在数据库配置中添加！`);
    }
    if (!filteredSources[dbIndex - 1]) {
      throw new Error(`配置错误: 当前环境 ${environment} 的 [${dus}] 数据源不足 (需要第 ${dbIndex} 个分片，当前共 ${filteredSources.length} 个)，请添加更多数据源！`);
    }

    const dbConfig = filteredSources[dbIndex - 1];
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

  deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
      return false;
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (let key of keys1) {
      if (!keys2.includes(key) || !this.deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }
    return true;
  }

  async runCheck(request) {
    const logs = [];
    const addLog = (message, level = "INFO") => {
      logs.push({ timestamp: new Date().toISOString(), level, message });
    };

    try {
      addLog("开始执行数据一致性检查 (Node.js)...");
      const { tables = [], tableConditions = {}, tableSettings = {}, environment = null } = request;

      addLog("开始按顺序查询各表（支持跨表依赖）...");
      
      const beforeData = {};
      // 缓存每张表实际查询到的第一条记录，供后续表提取依赖字段
      const tableResultsCache = {};
      
      for (const tableName of tables) {
        addLog(`处理表: ${tableName}`);
        
        // 从前端传来的初始条件（request/route 来源）出发
        const baseConditions = { ...(tableConditions[tableName] || {}) };
        
        // 处理跨表依赖条件（source=table）
        const tableConfig = tableSettings[tableName];
        addLog(`  tableSettings中 ${tableName} 的配置: ${tableConfig ? JSON.stringify(tableConfig.conditionFields) : '(无配置)'}`);
        addLog(`  当前 tableResultsCache 的表: [${Object.keys(tableResultsCache).join(', ')}]`);
        if (tableConfig && tableConfig.conditionFields) {
          for (const cond of tableConfig.conditionFields) {
            if (cond.source !== 'table') continue;
            // 格式: "depTableName.depFieldName"
            const parts = (cond.path || '').split('.');
            const depTable = parts[0];
            const depField = parts.slice(1).join('.');
            addLog(`  处理table依赖: field=${cond.field}, path=${cond.path}, depTable=${depTable}, depField=${depField}`);
            if (depTable && depField && tableResultsCache[depTable]) {
              const val = tableResultsCache[depTable][depField];
              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
                addLog(`  从表 ${depTable} 获取 ${cond.field} = ${val}`);
              } else {
                addLog(`  警告: 依赖表 ${depTable} 中字段 ${depField} 不存在或为空，可用字段: [${Object.keys(tableResultsCache[depTable] || {}).join(', ')}]`, "WARNING");
              }
            } else {
              addLog(`  警告: 依赖表 ${depTable} 尚未查询或无结果缓存（缓存中有: [${Object.keys(tableResultsCache).join(', ')}]）`, "WARNING");
            }
          }
        }

        if (Object.keys(baseConditions).length === 0) {
          addLog(`表 ${tableName} 没有查询条件，跳过查询`, "WARNING");
          continue;
        }

        // 确定路由字段值：优先使用 cust_no，其次取第一个条件值
        let routingValue = baseConditions.cust_no || baseConditions.zone_val;
        if (!routingValue) {
          routingValue = Object.values(baseConditions)[0];
        }

        const { dbName, tableNameWithSuffix, hashResult, dbIndex } = this.calculateRouting(routingValue, environment, tableName);
        const tableDus = (tableSettings[tableName]?.dus) || 'bdus';
        addLog(`路由到: 数据源 ${dbIndex} (${dbName}) . ${tableNameWithSuffix} (hash=${hashResult}) [DUS: ${tableDus}]`);

        const safeTableName = this.quoteIdentifier(tableNameWithSuffix, 'table');
        const { clause: whereClause, values } = this.buildWhereClause(baseConditions);
        const sqlQuery = `SELECT * FROM ${safeTableName} WHERE ${whereClause}`;
        
        let displaySqlQuery = sqlQuery;
        values.forEach((val, idx) => {
          const valStr = typeof val === 'string' ? `'${val}'` : val;
          displaySqlQuery = displaySqlQuery.replace(new RegExp(`\\$${idx + 1}(?!\\d)`, 'g'), valStr);
        });

        addLog(`SQL查询: ${displaySqlQuery}`, "SQL");
        addLog(`查询条件: ${JSON.stringify(baseConditions)}`);

        try {
          addLog(`尝试连接到环境 ${environment} 的 [${tableDus}] 数据源 ${dbIndex}...`);
          const results = await this.queryDatabase(dbIndex, environment, request.dbSettings, sqlQuery, values, tableDus);
          addLog(`成功连接到 [${tableDus}] 数据源 ${dbIndex}`);
          
          beforeData[tableName] = {
            sql: displaySqlQuery,
            count: results.length,
            data: results
          };
          addLog(`查询到 ${results.length} 条记录`);
          
          // 缓存第一条记录供后续表依赖使用
          if (results.length > 0) {
            tableResultsCache[tableName] = results[0];
            addLog(`缓存表 ${tableName} 的查询结果，供后续表依赖使用`);
          }
        } catch (e) {
          addLog(`查询失败: ${e.message}`, "ERROR");
          throw e;  // 中断整个检查流程
        }
      }

      if (request.apiResponse) {
        addLog("使用提供的API响应进行后续处理...");
      } else {
        addLog("未提供API响应，跳过接口调用");
      }

      const afterData = {};
      // after 阶段重置缓存，重新顺序查询
      const afterResultsCache = {};
      
      for (const tableName of tables) {
        const baseConditions = { ...(tableConditions[tableName] || {}) };
        if (Object.keys(baseConditions).length === 0 && !(tableSettings[tableName]?.conditionFields?.some(c => c.source === 'table'))) {
          continue;
        }

        // 处理跨表依赖条件
        const tableConfig = tableSettings[tableName];
        if (tableConfig && tableConfig.conditionFields) {
          for (const cond of tableConfig.conditionFields) {
            if (cond.source !== 'table') continue;
            const parts = (cond.path || '').split('.');
            const depTable = parts[0];
            const depField = parts.slice(1).join('.');
            if (depTable && depField && afterResultsCache[depTable]) {
              const val = afterResultsCache[depTable][depField];
              if (val !== undefined && val !== null) {
                baseConditions[cond.field] = String(val);
              }
            }
          }
        }

        if (Object.keys(baseConditions).length === 0) continue;

        let routingValue = baseConditions.cust_no || baseConditions.zone_val;
        if (!routingValue) routingValue = Object.values(baseConditions)[0];

        const tableDus = (tableSettings[tableName]?.dus) || 'bdus';
        const { dbName: _dbName, tableNameWithSuffix, dbIndex } = this.calculateRouting(routingValue, environment, tableName);
        const safeTableName = this.quoteIdentifier(tableNameWithSuffix, 'table');
        const { clause: whereClause, values } = this.buildWhereClause(baseConditions);
        const sqlQuery = `SELECT * FROM ${safeTableName} WHERE ${whereClause}`;

        let displaySqlQuery = sqlQuery;
        values.forEach((val, idx) => {
          const valStr = typeof val === 'string' ? `'${val}'` : val;
          displaySqlQuery = displaySqlQuery.replace(new RegExp(`\\$${idx + 1}(?!\\d)`, 'g'), valStr);
        });

        try {
          const results = await this.queryDatabase(dbIndex, environment, request.dbSettings, sqlQuery, values, tableDus);
          afterData[tableName] = {
            sql: displaySqlQuery,
            count: results.length,
            data: results
          };
          if (results.length > 0) {
            afterResultsCache[tableName] = results[0];
          }
        } catch (e) {
          addLog(`查询失败: ${e.message}`, "ERROR");
          throw e;  // 中断整个检查流程
        }
      }

      addLog("开始比对数据差异...");
      const resultsArray = [];

      for (const tableName of tables) {
        const before = beforeData[tableName] || {};
        const after = afterData[tableName] || {};

        if (before.error || after.error) {
          resultsArray.push({
            table: tableName,
            status: "错误",
            message: before.error || after.error,
            before, after, diff: null
          });
          continue;
        }

        const beforeCount = before.count || 0;
        const afterCount = after.count || 0;

        if (beforeCount === afterCount && this.deepEqual(before.data, after.data)) {
          resultsArray.push({
            table: tableName,
            status: "通过",
            message: "数据一致性检查通过",
            before, after, diff: null
          });
        } else {
          resultsArray.push({
            table: tableName,
            status: "失败",
            message: "数据不一致",
            before, after, diff: { count_changed: true }
          });
        }
      }

      addLog("数据一致性检查完成");

      return {
        success: true,
        logs,
        results: resultsArray
      };
    } catch (e) {
      addLog(`执行失败: ${e.message}`, "ERROR");
      return { success: false, logs, results: [], error: e.message };
    }
  }
}
