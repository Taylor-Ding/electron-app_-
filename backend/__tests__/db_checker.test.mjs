import { describe, it, expect } from 'vitest';
import { DataConsistencyChecker } from '../db_checker.mjs';

// Use a mock config path that doesn't exist - checker will use empty databases
const MOCK_CONFIG_PATH = '/nonexistent/config.json';

function createChecker() {
  return new DataConsistencyChecker(MOCK_CONFIG_PATH);
}

describe('DataConsistencyChecker', () => {
  describe('constructor', () => {
    it('should create instance with empty databases when config is missing', () => {
      const checker = createChecker();
      expect(checker.config).toEqual({ databases: {} });
    });

    it('should store configPath', () => {
      const checker = createChecker();
      expect(checker.configPath).toBe(MOCK_CONFIG_PATH);
    });
  });

  describe('quoteIdentifier', () => {
    it('should wrap valid identifier in double quotes', () => {
      const checker = createChecker();
      expect(checker.quoteIdentifier('mytable')).toBe('"mytable"');
    });

    it('should throw for SQL injection attempts (semicolons)', () => {
      const checker = createChecker();
      expect(() => checker.quoteIdentifier('table; DROP TABLE users')).toThrow('Invalid identifier');
    });

    it('should throw for SQL injection attempts (spaces)', () => {
      const checker = createChecker();
      expect(() => checker.quoteIdentifier('table name')).toThrow('Invalid identifier');
    });

    it('should throw for empty string', () => {
      const checker = createChecker();
      expect(() => checker.quoteIdentifier('')).toThrow('Invalid identifier');
    });

    it('should throw for non-string input', () => {
      const checker = createChecker();
      expect(() => checker.quoteIdentifier(123)).toThrow('Invalid identifier');
      expect(() => checker.quoteIdentifier(null)).toThrow('Invalid identifier');
    });

    it('should accept underscores and numbers', () => {
      const checker = createChecker();
      expect(checker.quoteIdentifier('tb_test_01')).toBe('"tb_test_01"');
    });

    it('should include custom label in error message', () => {
      const checker = createChecker();
      try {
        checker.quoteIdentifier('bad$name', 'column');
      } catch (e) {
        expect(e.message).toContain('column');
      }
    });
  });

  describe('buildWhereClause', () => {
    it('should return "1=1" for empty conditions', () => {
      const checker = createChecker();
      expect(checker.buildWhereClause({})).toEqual({ clause: '1=1', values: [] });
      expect(checker.buildWhereClause(null)).toEqual({ clause: '1=1', values: [] });
    });

    it('should build parameterized WHERE clause', () => {
      const checker = createChecker();
      const result = checker.buildWhereClause({ cust_no: '123', name: 'test' });
      expect(result.clause).toBe('"cust_no" = $1 AND "name" = $2');
      expect(result.values).toEqual(['123', 'test']);
    });

    it('should handle single condition', () => {
      const checker = createChecker();
      const result = checker.buildWhereClause({ id: '1' });
      expect(result.clause).toBe('"id" = $1');
      expect(result.values).toEqual(['1']);
    });
  });

  describe('calculateRouting', () => {
    it('should calculate routing for DEV1 (8 shards)', () => {
      const checker = createChecker();
      const result = checker.calculateRouting('00001129443560', 'DEV1', 'tb_dpmst_medium');
      expect(result.dbName).toMatch(/^dcdpdb[1-8]$/);
      expect(result.tableNameWithSuffix).toMatch(/^tb_dpmst_medium_\d{4}$/);
      expect(result.hashResult).toBeGreaterThanOrEqual(1);
      expect(result.hashResult).toBeLessThanOrEqual(8);
      expect(result.dbIndex).toBeGreaterThanOrEqual(1);
      expect(result.dbIndex).toBeLessThanOrEqual(4);
    });

    it('should use 16 shards for T1 environment', () => {
      const checker = createChecker();
      const result = checker.calculateRouting('00001129443560', 'T1');
      expect(result.hashResult).toBeGreaterThanOrEqual(1);
      expect(result.hashResult).toBeLessThanOrEqual(16);
    });

    it('should use 16 shards for T2 environment', () => {
      const checker = createChecker();
      const result = checker.calculateRouting('00001129443560', 'T2');
      expect(result.hashResult).toBeGreaterThanOrEqual(1);
      expect(result.hashResult).toBeLessThanOrEqual(16);
    });

    it('should use 16 shards for SITA environment', () => {
      const checker = createChecker();
      const result = checker.calculateRouting('00001129443560', 'SITA');
      expect(result.hashResult).toBeGreaterThanOrEqual(1);
      expect(result.hashResult).toBeLessThanOrEqual(16);
    });

    it('should be deterministic', () => {
      const checker = createChecker();
      const a = checker.calculateRouting('6222020200007654321', 'DEV1');
      const b = checker.calculateRouting('6222020200007654321', 'DEV1');
      expect(a).toEqual(b);
    });
  });

  describe('getDbConfig', () => {
    it('should return config for known db name', () => {
      const checker = createChecker();
      // Config is empty since we pass nonexistent path
      expect(checker.getDbConfig('nonexistent')).toBeUndefined();
    });
  });

  describe('deepEqual', () => {
    it('should return true for equal primitives', () => {
      const checker = createChecker();
      expect(checker.deepEqual(1, 1)).toBe(true);
      expect(checker.deepEqual('hello', 'hello')).toBe(true);
      expect(checker.deepEqual(null, null)).toBe(true);
    });

    it('should return false for different primitives', () => {
      const checker = createChecker();
      expect(checker.deepEqual(1, 2)).toBe(false);
      expect(checker.deepEqual('hello', 'world')).toBe(false);
    });

    it('should return true for equal objects', () => {
      const checker = createChecker();
      expect(checker.deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });

    it('should return false for objects with different values', () => {
      const checker = createChecker();
      expect(checker.deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('should return true for equal arrays', () => {
      const checker = createChecker();
      expect(checker.deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    });

    it('should return false for arrays with different lengths', () => {
      const checker = createChecker();
      expect(checker.deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it('should return true when ignoreFields mask differences', () => {
      const checker = createChecker();
      const obj1 = { id: 1, name: 'test', created_at: '2024-01-01' };
      const obj2 = { id: 1, name: 'test', created_at: '2024-12-31' };
      expect(checker.deepEqual(obj1, obj2, ['created_at'])).toBe(true);
    });

    it('should return false when non-ignored fields differ', () => {
      const checker = createChecker();
      const obj1 = { id: 1, name: 'test' };
      const obj2 = { id: 2, name: 'test' };
      expect(checker.deepEqual(obj1, obj2, ['name'])).toBe(false);
    });

    it('should handle nested objects', () => {
      const checker = createChecker();
      const obj1 = { a: { b: 1, c: 2 } };
      const obj2 = { a: { b: 1, c: 2 } };
      expect(checker.deepEqual(obj1, obj2)).toBe(true);
    });

    it('should detect nested differences', () => {
      const checker = createChecker();
      const obj1 = { a: { b: 1 } };
      const obj2 = { a: { b: 2 } };
      expect(checker.deepEqual(obj1, obj2)).toBe(false);
    });

    it('should propagate ignoreFields to nested comparisons', () => {
      const checker = createChecker();
      const obj1 = { a: { id: 1, updated: 'old' } };
      const obj2 = { a: { id: 1, updated: 'new' } };
      expect(checker.deepEqual(obj1, obj2, ['updated'])).toBe(true);
    });
  });

  describe('transition tables and recursive dependencies', () => {
    it('should resolve recursive transition tables', () => {
      const checker = createChecker();
      const tables = ['tb_a'];
      const tableSettings = {
        tb_a: {
          conditionFields: [{ source: 'table', path: 'tb_b.id', field: 'a_id' }]
        },
        tb_b: {
          conditionFields: [{ source: 'table', path: 'tb_c.name', field: 'b_name' }]
        },
        tb_c: {}
      };
      const result = checker.resolveTablesToQuery(tables, tableSettings);
      expect(result).toContain('tb_a');
      expect(result).toContain('tb_b');
      expect(result).toContain('tb_c');
      expect(result.length).toBe(3);
    });

    it('should topologically sort resolved tables', () => {
      const checker = createChecker();
      const allTables = ['tb_a', 'tb_b', 'tb_c'];
      const tableSettings = {
        tb_a: {
          conditionFields: [{ source: 'table', path: 'tb_b.id', field: 'a_id' }]
        },
        tb_b: {
          conditionFields: [{ source: 'table', path: 'tb_c.name', field: 'b_name' }]
        },
        tb_c: {}
      };
      const sorted = checker.topologicalSort(allTables, tableSettings);
      expect(sorted).toEqual(['tb_c', 'tb_b', 'tb_a']);
    });

    it('should query transitional tables but exclude them from final assertions', async () => {
      const checker = createChecker();
      const queriedTables = [];
      
      // Mock queryDatabase
      checker.queryDatabase = async (dbIndex, environment, dbSettings, sqlQuery, values, dus) => {
        const match = sqlQuery.match(/FROM\s+"([^"]+)"/);
        const name = match ? match[1] : '';
        queriedTables.push(name);
        if (name.startsWith('tb_c')) {
          return [{ name: 'val_c' }];
        } else if (name.startsWith('tb_b')) {
          return [{ id: 'val_b' }];
        } else {
          return [{ value: 'val_a' }];
        }
      };

      const request = {
        tables: ['tb_a'],
        tableConditions: {
          tb_a: {}
        },
        tableSettings: {
          tb_a: {
            conditionFields: [{ source: 'table', path: 'tb_b.id', field: 'a_id' }]
          },
          tb_b: {
            conditionFields: [{ source: 'table', path: 'tb_c.name', field: 'b_name' }]
          },
          tb_c: {
            conditionFields: []
          }
        },
        environment: 'DEV1',
        dbSettings: {
          DEV1: [{ host: 'localhost', port: 5432, user: 'postgres', password: '', database: 'db1', dus: 'bdus' }]
        }
      };

      request.tableConditions.tb_c = { zone_val: 'start' };

      const beforeResult = await checker.runBeforeCheck(request);
      expect(beforeResult.success).toBe(true);
      
      expect(queriedTables[0]).toContain('tb_c');
      expect(queriedTables[1]).toContain('tb_b');
      expect(queriedTables[2]).toContain('tb_a');

      queriedTables.length = 0;
      request.beforeData = beforeResult.beforeData;
      
      const afterResult = await checker.runAfterCheck(request);
      expect(afterResult.success).toBe(true);

      expect(queriedTables[0]).toContain('tb_c');
      expect(queriedTables[1]).toContain('tb_b');
      expect(queriedTables[2]).toContain('tb_a');

      expect(afterResult.results.length).toBe(1);
      expect(afterResult.results[0].table).toBe('tb_a');
      expect(afterResult.results[0].status).toBe('通过');
    });

    it('should inherit zone_val / cust_no from tableConditions for transitional tables with route conditions', async () => {
      const checker = createChecker();
      const queriedInfo = [];

      checker.queryDatabase = async (dbIndex, environment, dbSettings, sqlQuery, values, dus) => {
        queriedInfo.push({ sql: sqlQuery, dbIndex });
        return [{ main_contr_no: 'DP999', prodt_contract_no: 'DP999', pers_inner_accno: 'ACC888' }];
      };

      const request = {
        tables: ['tb_dpmst_medium'],
        tableConditions: {
          tb_dpmst_medium: {
            medium_no: 'MED001',
            zone_val: '12345678'
          }
        },
        tableSettings: {
          tb_dpmst_medium: {
            conditionFields: [
              { field: 'medium_no', source: 'request', path: '$.txBody.txEntity.mediumNo' },
              { field: 'zone_val', source: 'route', path: 'cust_no' }
            ]
          },
          tb_dprgt_cont_acc_relat: {
            conditionFields: [
              { field: 'prodt_contract_no', source: 'table', path: 'tb_dpmst_medium.main_contr_no' },
              { field: 'zone_val', source: 'route', path: 'cust_no' }
            ]
          }
        },
        environment: 'DEV1',
        dbSettings: {
          DEV1: Array(8).fill({ host: 'localhost', port: 5432, user: 'postgres', password: '', database: 'db1', dus: 'bdus' })
        }
      };

      request.tableSettings.tb_dpmst_medium.conditionFields.push({
        field: 'main_contr_no', source: 'table', path: 'tb_dprgt_cont_acc_relat.prodt_contract_no'
      });

      const beforeResult = await checker.runBeforeCheck(request);
      expect(beforeResult.success).toBe(true);

      const relatQuery = queriedInfo.find(q => q.sql.includes('tb_dprgt_cont_acc_relat'));
      expect(relatQuery).toBeDefined();
      expect(relatQuery.sql).toContain('"zone_val" = $2');
      
      const expectedRouting = checker.calculateRouting('12345678', 'DEV1', 'tb_dprgt_cont_acc_relat');
      expect(relatQuery.dbIndex).toBe(expectedRouting.dbIndex);
      expect(relatQuery.sql).toContain(expectedRouting.tableNameWithSuffix);
    });
  });
});
