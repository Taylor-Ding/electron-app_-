import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react';
import axios from 'axios';
import { JSONPath } from 'jsonpath-plus';
import './App.css';
import LoginScreen from './components/LoginScreen.jsx';
import { ENVIRONMENT_OPTIONS } from './config/constants.js';
import { encryptPassword, decryptPassword } from './utils/encryption.js';
import { serializeToToml, parseToml } from './utils/serialization.js';
import { parseJmxFile, cleanJmxBody } from './utils/jmxParser.js';

const TableNameInput = ({ initialName, onNameChange, placeholder, className, style, defaultTables, onSelectSuggestion }) => {
  const [name, setName] = useState(() => {
    return initialName.startsWith('new_table_') ? '' : initialName;
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);
  
  useEffect(() => {
    setName(initialName.startsWith('new_table_') ? '' : initialName);
  }, [initialName]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleBlur = () => {
    setTimeout(() => {
      const newName = name.trim();
      if (newName && newName !== initialName) {
        onNameChange(initialName, newName);
      } else {
        setName(initialName);
      }
    }, 200);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
      setShowDropdown(false);
    }
  };

  const isNew = initialName.startsWith('new_table_');
  const suggestions = useMemo(() => {
    if (!defaultTables) return [];
    const query = name.trim().toLowerCase();
    if (!query) return []; // 当用户没有输入任何字符（空值）时，不展示匹配的表名列表
    return Object.keys(defaultTables).filter(tName => {
      const chineseName = defaultTables[tName]?.chineseName || '';
      return tName.toLowerCase().includes(query) || chineseName.toLowerCase().includes(query);
    });
  }, [defaultTables, name]);

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: style?.flex || 1, display: 'flex' }}>
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => {
          if (isNew) setShowDropdown(true);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
        placeholder={placeholder}
        style={{ ...style, width: '100%' }}
      />
      {showDropdown && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 9999,
          backgroundColor: '#1e222b',
          border: '1px solid #3e4451',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: '4px'
        }}>
          {suggestions.map(sName => {
            const chinese = defaultTables[sName]?.chineseName ? ` (${defaultTables[sName].chineseName})` : '';
            return (
              <div
                key={sName}
                onMouseDown={() => {
                  setName(sName);
                  setShowDropdown(false);
                  if (onSelectSuggestion) {
                    onSelectSuggestion(initialName, sName, defaultTables[sName]);
                  } else {
                    onNameChange(initialName, sName);
                  }
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#abb2bf',
                  borderBottom: '1px solid #282c34',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#2c313c'; e.target.style.color = '#ffffff'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; e.target.style.color = '#abb2bf'; }}
              >
                <strong style={{ color: '#61afef' }}>{sName}</strong>{chinese}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function App() {
  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;
  const [authUser, setAuthUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    const saved =
      window.sessionStorage.getItem('authSession') || window.sessionStorage.getItem('mockAuthUser');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });
  const [loginError, setLoginError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authApiBaseUrl, setAuthApiBaseUrl] = useState('http://20.12.12.121:8082/api/');
  const [captchaSrc, setCaptchaSrc] = useState('');
  const [captchaUuid, setCaptchaUuid] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaEnabled, setCaptchaEnabled] = useState(true);
  const [loginCaptchaCode, setLoginCaptchaCode] = useState('');
  const [apiUrl, setApiUrl] = useState('http://20.12.12.20:8080/online-service');
  const [requestBody, setRequestBody] = useState(JSON.stringify({
    "txBody": {
      "txEntity": {
        "inputModeCode": "2",
        "coreTxFlag": "00000000000000",
        "mediumNo": "6222020200007654321"
      },
      "txComni": {
        "accountingDate": "20231026"
      },
      "txComn7": {
        "custNo": "00400022300118",
        "teschnlCustNo": "4067745905991"
      },
      "txComn8": {
        "busiSendSysOrCmptNo": "99100060000"
      },
      "txComn1": {
        "curQryReqNum": 10,
        "bgnIndexNo": 1
      },
      "txComn2": {
        "oprTellerNo": "0000000000"
      }
    },
    "txHeader": {
      "msgrptMac": "{{msgrptMac}}",
      "globalBusiTrackNo": "{{globalBusiTrackNo}}",
      "subtxNo": "{{subtxNo}}",
      "txStartTime": "{{txStartTime}}",
      "txSendTime": "{{txSendTime}}",
      "busiSendInstNo": "11005293",
      "reqSysSriNo": "20231026104615991000648028791662",
      "msgAgrType": "1",
      "startSysOrCmptNo": "99100060000",
      "targetSysOrCmptNo": "1022199",
      "resvedInputInfo": "",
      "mainMapElemntInfo": "056222020200007654321",
      "pubMsgHeadLen": "0",
      "servVerNo": "10000",
      "servNo": "10221997100",
      "msgrptTotalLen": "0",
      "dataCenterCode": "H",
      "servTpCd": "1",
      "msgrptFmtVerNo": "10000",
      "embedMsgrptLen": "0",
      "sendSysOrCmptNo": "99700040001",
      "startChnlFgCd": "15",
      "tenantId": "DEV1"
    }
  }, null, 2));
  const [responseBody, setResponseBody] = useState('');
  const [tables, setTables] = useState([]);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('log');
  const [selectedEnvironment, setSelectedEnvironment] = useState('DEV1');
  const [showDataModal, setShowDataModal] = useState(false);
  const [dataModalContent, setDataModalContent] = useState({ title: '', beforeSql: '', afterSql: '', beforeData: [], afterData: [] });
  const [dataModalSearchQuery, setDataModalSearchQuery] = useState('');
  const [selectedFields, setSelectedFields] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [expandedRecords, setExpandedRecords] = useState({});
  const [assertionSelections, setAssertionSelections] = useState({});
  const [showEnvironmentDropdown, setShowEnvironmentDropdown] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showDbSettings, setShowDbSettings] = useState(false);
  const [showSystemSettings, setShowSystemSettings] = useState(false);
  const [showDefaultTableSettings, setShowDefaultTableSettings] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showAssertSqlModal, setShowAssertSqlModal] = useState(false);
  const [assertSqlModalContent, setAssertSqlModalContent] = useState('');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [defaultTableSearchQuery, setDefaultTableSearchQuery] = useState('');
  const [defaultTableSettings, setDefaultTableSettings] = useState({ tables: {} });
  // 弹窗草稿：打开时复制当前配置，点「保存设置」才写入真实 state
  const [draftSystemSettings, setDraftSystemSettings] = useState(null);
  const [draftDefaultTableSettings, setDraftDefaultTableSettings] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showJmxPicker, setShowJmxPicker] = useState(false);
  const [jmxRequests, setJmxRequests] = useState([]);
  const logsRef = useRef(null);
  const envDropdownRef = useRef(null);
  const settingsDropdownRef = useRef(null);
  const importFileRef = useRef(null);
  const jmxFileRef = useRef(null);
  // 用于在异步函数中访问最新 state

  
  // API设置 - 不同环境的请求地址配置
  const [apiSettings, setApiSettings] = useState({
    route_url: 'http://20.12.12.121:8082/api/testtool/routeQuery', // 路由服务器地址，不受环境变化影响
    T1: {
      request_url: 'http://20.201.19.12:8080/online-service',
      mac_url: 'http://20.201.21.125:8083/mac/requestGenMac'
    },
    T2: {
      request_url: 'http://20.204.34.59:8080/online-service',
      mac_url: 'http://20.12.10.119:8083/mac/requestGenMac'
    },
    SITA: {
      request_url: 'http://20.200.84.169:8080/online-service',
      mac_url: 'http://20.12.10.86:8083/mac/requestGenMac'
    },
    DEV1: {
      request_url: 'http://localhost:8080/online-service',
      mac_url: 'http://localhost:8080/mac/requestGenMac'
    },
    TEST: {
      request_url: 'http://20.12.12.146:8080/online-service',
      mac_url: ''
    },
    DEVS: {
      request_url: 'http://20.12.11.202:8080/online-service',
      mac_url: ''
    }
  });

  // 数据库设置 - 不同环境的数据库配置
  const [dbSettings, setDbSettings] = useState({
    T1: [],
    T2: [],
    SITA: [],
    DEV1: [],
    TEST: [],
    DEVS: []
  });

  // 系统级数据库配置
  const [systemDbConfig, setSystemDbConfig] = useState({
    host: '',
    port: 5432,
    database: '',
    user: '',
    password: ''
  });

  // 系统配置 - 表的断言信息和查询条件
  const [systemSettings, setSystemSettings] = useState({
    tables: {
      'tb_dpmst_medium': {
        primaryKey: 'medium_no',
        conditionFields: [
          {
            field: 'medium_no',
            source: 'request',
            path: 'txBody.txEntity.mediumNo',
            required: true
          },
          {
            field: 'cust_no',
            source: 'route',
            path: 'cust_no',
            required: true
          }
        ]
      }
    }
  });

  // 数据库连接测试状态
  const [testConnectionStatus, setTestConnectionStatus] = useState({});

  const currentApiConfig = apiSettings[selectedEnvironment] || {};
  const resultSummary = useMemo(() => {
    return results.reduce((summary, item) => {
      if (item.status === '通过') summary.pass += 1;
      else if (item.status === '跳过') summary.skip += 1;
      else summary.fail += 1;
      return summary;
    }, { total: results.length, pass: 0, fail: 0, skip: 0 });
  }, [results]);
  const sidebarMetrics = useMemo(() => ([
    {
      label: '检查表',
      value: tables.length,
      detail: tables.length > 0 ? '已加入本轮核对' : '等待添加'
    },
    {
      label: '日志',
      value: logs.length,
      detail: logs.length > 0 ? '执行轨迹持续记录' : '尚未开始'
    },
    {
      label: '结果',
      value: resultSummary.total,
      detail: resultSummary.fail > 0 ? `${resultSummary.fail} 项异常` : '暂无失败项'
    }
  ]), [tables.length, logs.length, resultSummary.total, resultSummary.fail]);

  const addTable = () => {
    setTables([...tables, { name: '' }]);
  };

  const removeTable = (index) => {
    const newTables = [...tables];
    newTables.splice(index, 1);
    setTables(newTables);
  };

  const updateTableName = (index, value) => {
    const newTables = [...tables];
    newTables[index].name = value;
    setTables(newTables);
  };

  const moveSystemTable = (tableName, direction) => {
    setDraftSystemSettings(prev => {
      if (!prev || !prev.tables) return prev;
      const keys = Object.keys(prev.tables);
      const index = keys.indexOf(tableName);
      if (index === -1) return prev;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= keys.length) return prev;
      
      const newKeys = [...keys];
      newKeys[index] = keys[newIndex];
      newKeys[newIndex] = keys[index];
      
      const newTables = {};
      newKeys.forEach(k => {
        newTables[k] = prev.tables[k];
      });
      
      return {
        ...prev,
        tables: newTables
      };
    });
  };

  const insertSystemTable = (afterTableName) => {
    const newTableName = `new_table_${Date.now()}`;
    setDraftSystemSettings(prev => {
      if (!prev || !prev.tables) return prev;
      const keys = Object.keys(prev.tables);
      const index = keys.indexOf(afterTableName);
      
      const newKeys = [...keys];
      if (index === -1) {
        newKeys.push(newTableName);
      } else {
        newKeys.splice(index + 1, 0, newTableName);
      }
      
      const newTables = {};
      newKeys.forEach(k => {
        if (k === newTableName) {
          newTables[k] = {
            chineseName: '',
            primaryKey: '',
            conditionFields: []
          };
        } else {
          newTables[k] = prev.tables[k];
        }
      });
      
      return {
        ...prev,
        tables: newTables
      };
    });
  };

  const moveDefaultTable = (tableName, direction) => {
    setDraftDefaultTableSettings(prev => {
      if (!prev || !prev.tables) return prev;
      const keys = Object.keys(prev.tables);
      const index = keys.indexOf(tableName);
      if (index === -1) return prev;
      
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= keys.length) return prev;
      
      const newKeys = [...keys];
      newKeys[index] = keys[newIndex];
      newKeys[newIndex] = keys[index];
      
      const newTables = {};
      newKeys.forEach(k => {
        newTables[k] = prev.tables[k];
      });
      
      return {
        ...prev,
        tables: newTables
      };
    });
  };

  const insertDefaultTable = (afterTableName) => {
    const newTableName = `new_table_${Date.now()}`;
    setDraftDefaultTableSettings(prev => {
      if (!prev || !prev.tables) return prev;
      const keys = Object.keys(prev.tables);
      const index = keys.indexOf(afterTableName);
      
      const newKeys = [...keys];
      if (index === -1) {
        newKeys.push(newTableName);
      } else {
        newKeys.splice(index + 1, 0, newTableName);
      }
      
      const newTables = {};
      newKeys.forEach(k => {
        if (k === newTableName) {
          newTables[k] = {
            chineseName: '',
            primaryKey: '',
            conditionFields: []
          };
        } else {
          newTables[k] = prev.tables[k];
        }
      });
      
      return {
        ...prev,
        tables: newTables
      };
    });
  };

  const isColumnChecked = (tableName, recordIdx, fieldName) => {
    return !!assertionSelections[`${tableName}|${recordIdx}|${fieldName}`];
  };

  const toggleColumnAssertion = (tableName, recordIdx, fieldName) => {
    setAssertionSelections(prev => {
      const key = `${tableName}|${recordIdx}|${fieldName}`;
      return {
        ...prev,
        [key]: !prev[key]
      };
    });
  };

  const generatePostgresAssertSql = (tableName, resultDetails, recordIdx, selectedCols) => {
    if (!resultDetails || !selectedCols || selectedCols.length === 0) return '';
    const afterData = resultDetails.after?.data || [];
    const record = afterData[recordIdx];
    if (!record) return '';

    // 1. 提取物理表名
    const afterSql = resultDetails.after?.sql || '';
    const routedTableName = (() => {
      if (!afterSql) return tableName;
      const match = afterSql.match(/FROM\s+["`]?([A-Za-z0-9_]+)["`]?/i);
      return match ? match[1] : tableName;
    })();

    // 2. 根据配置文件中的查询条件来构建 WHERE 定位子句
    const getConditionFields = (tName) => {
      const defaultTableConfig = defaultTableSettings.tables[tName] || {};
      const systemTableConfig = systemSettings.tables[tName] || {};
      const config = { ...defaultTableConfig, ...systemTableConfig };
      if (config && config.conditionFields) {
        return config.conditionFields.map(c => c.field).filter(Boolean);
      }
      return [];
    };

    let condFields = getConditionFields(tableName);

    // 如果没有配置条件，则降级使用主键
    if (condFields.length === 0) {
      const getPrimaryKeys = (tName) => {
        const defaultTableConfig = defaultTableSettings.tables[tName] || {};
        const systemTableConfig = systemSettings.tables[tName] || {};
        const primaryKeyStr = systemTableConfig.primaryKey || systemTableConfig.primary_key || 
                              defaultTableConfig.primaryKey || defaultTableConfig.primary_key || '';
        return primaryKeyStr.split(/[,，\s]+/).map(k => k.trim()).filter(Boolean);
      };
      condFields = getPrimaryKeys(tableName);
    }

    let whereConditions = [];

    // 根据确定好的条件字段从记录中提取并拼接成 WHERE 条件
    condFields.forEach(field => {
      const matchedKey = Object.keys(record).find(k => k.toLowerCase() === field.toLowerCase()) || field;
      const val = record[matchedKey];
      if (val !== undefined) {
        if (val === null) {
          whereConditions.push(`"${matchedKey}" IS NULL`);
        } else if (typeof val === 'number') {
          whereConditions.push(`"${matchedKey}" = ${val}`);
        } else {
          const escapedVal = String(val).replace(/'/g, "''");
          whereConditions.push(`"${matchedKey}" = '${escapedVal}'`);
        }
      }
    });

    // 如果没能构建出条件，则从 SQL 的 WHERE 中提取作为兜底
    if (whereConditions.length === 0) {
      if (afterSql) {
        const whereIndex = afterSql.toUpperCase().indexOf(' WHERE ');
        if (whereIndex !== -1) {
          const rawWhere = afterSql.substring(whereIndex + 7).trim();
          whereConditions.push(rawWhere);
        }
      }
    }

    // 最后的最后兜底：拿第一个属性
    if (whereConditions.length === 0) {
      const firstKey = Object.keys(record)[0];
      if (firstKey) {
        const val = record[firstKey];
        if (val === null) {
          whereConditions.push(`"${firstKey}" IS NULL`);
        } else if (typeof val === 'number') {
          whereConditions.push(`"${firstKey}" = ${val}`);
        } else {
          whereConditions.push(`"${firstKey}" = '${String(val).replace(/'/g, "''")}'`);
        }
      }
    }

    const whereClause = whereConditions.join(' AND ');

    // 3. 生成断言 SQL（选择勾选字段 + expected 注释）
    const selectedColsList = selectedCols.map(c => `"${c}"`).join(', ');
    const expectedLines = selectedCols.map(col => {
      const val = record[col];
      if (val === null) return `-- expected: ${col}=NULL`;
      const displayVal = typeof val === 'string' ? `'${val}'` : val;
      return `-- expected: ${col}=${displayVal}`;
    }).join('\n');

    return `-- 断言: ${tableName}\n` +
           `SELECT ${selectedColsList} FROM "${routedTableName}" WHERE ${whereClause}\n` +
           `${expectedLines};`;
  };

  const [toast, setToast] = useState({ show: false, message: '' });
  const triggerToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => {
      setToast(prev => prev.message === message ? { show: false, message: '' } : prev);
    }, 2500);
  };

  const compiledAssertions = useMemo(() => {
    const groups = {}; // { [tableName]: { [recordIdx]: [fields...] } }
    Object.entries(assertionSelections).forEach(([key, isChecked]) => {
      if (!isChecked) return;
      const parts = key.split('|');
      if (parts.length < 3) return;
      const tableName = parts[0];
      const recordIdx = parseInt(parts[1], 10);
      const fieldName = parts.slice(2).join('|');
      
      if (!groups[tableName]) {
        groups[tableName] = {};
      }
      if (!groups[tableName][recordIdx]) {
        groups[tableName][recordIdx] = [];
      }
      groups[tableName][recordIdx].push(fieldName);
    });
    return groups;
  }, [assertionSelections]);

  const tableResultsMap = useMemo(() => {
    const map = {};
    results.forEach(res => {
      map[res.table] = res;
    });
    return map;
  }, [results]);

  const handleClearAllAssertions = () => {
    setAssertionSelections({});
    triggerToast('已清空所有勾选的断言列');
  };

  const handleCopyAllAssertions = () => {
    const allSqlParts = [];
    Object.entries(compiledAssertions).forEach(([tableName, recordGroups]) => {
      const result = tableResultsMap[tableName];
      const details = result?.details;
      Object.entries(recordGroups).forEach(([recordIdxStr, cols]) => {
        const recordIdx = parseInt(recordIdxStr, 10);
        const sql = generatePostgresAssertSql(tableName, details, recordIdx, cols);
        if (sql) {
          allSqlParts.push(sql);
        }
      });
    });

    const finalSql = allSqlParts.join('\n\n-- ' + '='.repeat(50) + '\n\n');
    if (!finalSql) {
      triggerToast('暂无可选的断言 SQL');
      return;
    }

    navigator.clipboard.writeText(finalSql)
      .then(() => triggerToast('已复制所有断言 SQL 到剪贴板！'))
      .catch(err => {
        const el = document.createElement('textarea');
        el.value = finalSql;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        triggerToast('已复制所有断言 SQL 到剪贴板！');
      });
  };

  const handleCopySingleTableAssertion = (tableSql) => {
    if (!tableSql) return;
    navigator.clipboard.writeText(tableSql)
      .then(() => triggerToast('已复制该表断言 SQL 到剪贴板！'))
      .catch(err => {
        const el = document.createElement('textarea');
        el.value = tableSql;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        triggerToast('已复制该表断言 SQL 到剪贴板！');
      });
  };

  const logIdRef = useRef(0);
  const addLog = (message, level = 'INFO') => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const id = ++logIdRef.current;
    setLogs(prev => [...prev, { id, timestamp, message, level }]);
    setTimeout(() => {
      if (logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    }, 50);
  };

  const normalizeAuthPayload = (data) => {
    if (!data || typeof data !== 'object') return {};
    const nested = data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : {};
    return { ...data, ...nested };
  };

  const fetchCaptcha = useCallback(async () => {
    const base = authApiBaseUrl.trim().replace(/\/$/, '');
    if (!base) {
      setCaptchaSrc('');
      setCaptchaUuid('');
      return;
    }
    setCaptchaLoading(true);
    setLoginError('');
    setLoginCaptchaCode('');
    try {
      const { data } = await axios.get(`${base}/captchaImage`, { timeout: 20000 });
      const p = normalizeAuthPayload(data);
      const enabled = p.captchaEnabled !== false;
      setCaptchaEnabled(enabled);
      if (!enabled) {
        setCaptchaUuid('');
        setCaptchaSrc('');
        return;
      }
      const uuid = p.uuid;
      const img = p.img;
      if (!uuid || img == null || String(img) === '') {
        throw new Error('验证码接口返回缺少 uuid 或 img');
      }
      const raw = String(img);
      const src = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
      setCaptchaUuid(uuid);
      setCaptchaSrc(src);
    } catch (e) {
      setCaptchaEnabled(true);
      setCaptchaSrc('');
      setCaptchaUuid('');
      const msg = e.response?.data?.msg || e.message || '获取验证码失败';
      setLoginError(String(msg));
    } finally {
      setCaptchaLoading(false);
    }
  }, [authApiBaseUrl]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.setConfig('authApiBaseUrl', authApiBaseUrl);
    }
  }, [authApiBaseUrl]);

  useEffect(() => {
    if (authUser) return;
    const t = window.setTimeout(() => {
      fetchCaptcha();
    }, 2000);
    return () => window.clearTimeout(t);
  }, [authUser, authApiBaseUrl, fetchCaptcha]);

  const handleLogin = async ({ username, password, code, uuid }) => {
    setLoginError('');
    if (!username || !password) {
      setLoginError('请输入用户名和密码');
      return;
    }
    if (captchaEnabled && !code?.trim()) {
      setLoginError('请输入验证码');
      return;
    }
    if (captchaEnabled && !uuid) {
      setLoginError('验证码未就绪，请稍后或点击图片刷新');
      await fetchCaptcha();
      return;
    }

    const base = authApiBaseUrl.trim().replace(/\/$/, '');
    if (!base) {
      setLoginError('请填写认证服务根地址');
      return;
    }

    setIsAuthenticating(true);
    try {
      const { data } = await axios.post(
        `${base}/login`,
        {
          username,
          password,
          code: captchaEnabled ? code : '',
          uuid: captchaEnabled ? uuid : ''
        },
        {
          timeout: 30000,
          headers: { 'Content-Type': 'application/json', 'X-Client-Type': 'DESKTOP' }
        }
      );

      const p = normalizeAuthPayload(data);
      if (p.code !== 200) {
        setLoginError(p.msg || '登录失败');
        await fetchCaptcha();
        return;
      }

      const token = p.token ?? p.access_token;
      const refreshToken = p.refresh_token ?? p.refreshToken;
      if (!token) {
        setLoginError('登录成功但未返回访问令牌');
        await fetchCaptcha();
        return;
      }

      const user = {
        username,
        displayName: username,
        token,
        refreshToken: refreshToken || ''
      };
      setAuthUser(user);
      window.sessionStorage.setItem('authSession', JSON.stringify(user));
      window.sessionStorage.removeItem('mockAuthUser');
      // 登录成功后立即从远端拉取最新配置
      await fetchRemoteConfig(base);
    } catch (e) {
      const body = e.response?.data;
      const p = normalizeAuthPayload(body);
      const msg = p.msg || body?.message || e.message || '登录失败';
      setLoginError(String(msg));
      await fetchCaptcha();
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    setAuthUser(null);
    setLoginError('');
    window.sessionStorage.removeItem('mockAuthUser');
    window.sessionStorage.removeItem('authSession');
    setShowEnvironmentDropdown(false);
    setShowSettingsDropdown(false);
    setShowApiSettings(false);
    setShowDbSettings(false);
    setShowSystemSettings(false);
    setShowDefaultTableSettings(false);
  };

  /** 从远端拉取最新的配置文件 */
  const fetchRemoteConfig = async (base) => {
    try {
      addLog('正在从远端拉取最新配置...', 'INFO');
      const response = await axios.get(`${base}/autotest/config/latest`, {
        timeout: 10000
      });
      const resData = response.data;
      if (resData && resData.code === 200 && resData.data) {
        const rawData = resData.data;

        // ── 格式映射与归一化 ──────────────────────────────────────────
        // 1. apiSettings 映射 (归一化嵌套的 environments 和驼峰/下划线格式)
        let mappedApi = null;
        if (rawData.apiSettings) {
          const rawApi = rawData.apiSettings;
          const envs = rawApi.environments || {};
          mappedApi = {
            route_url: rawApi.route_url || ''
          };
          const envList = ['T1', 'T2', 'SITA', 'DEV1', 'TEST', 'DEVS'];
          for (const env of envList) {
            mappedApi[env] = {
              request_url: envs[env]?.request_url || rawApi[env]?.request_url || '',
              mac_url: envs[env]?.mac_url || rawApi[env]?.mac_url || ''
            };
          }
        }

        // 2. dbSettings 映射与密码解密
        let mappedDb = null;
        if (rawData.dbSettings) {
          mappedDb = {};
          const envList = ['T1', 'T2', 'SITA', 'DEV1', 'TEST', 'DEVS'];
          for (const env of envList) {
            const arr = rawData.dbSettings[env];
            if (Array.isArray(arr)) {
              mappedDb[env] = arr.map(ds => ({
                dus: ds.dus || 'bdus',
                host: ds.host || '',
                port: Number(ds.port) || 5432,
                database: ds.database || '',
                user: ds.user || '',
                password: decryptPassword(ds.password || '')
              }));
            } else {
              mappedDb[env] = [];
            }
          }
        }

        // 3. systemDbConfig 映射与密码解密
        let mappedSysDb = null;
        if (rawData.systemDbConfig) {
          const rawSysDb = rawData.systemDbConfig;
          mappedSysDb = {
            host: rawSysDb.host || '',
            port: Number(rawSysDb.port) || 5432,
            database: rawSysDb.database || '',
            user: rawSysDb.user || '',
            password: decryptPassword(rawSysDb.password || '')
          };
        }

        // 4. defaultTableSettings 映射 (归一化下划线/驼峰格式及 conditions 键名)
        let mappedDefaultTab = null;
        if (rawData.defaultTableSettings && rawData.defaultTableSettings.tables) {
          const sanitizedTables = {};
          for (const [tName, tConfig] of Object.entries(rawData.defaultTableSettings.tables)) {
            if (!tConfig || typeof tConfig !== 'object') continue;

            const rawConds = tConfig.conditions || tConfig.conditionFields || [];
            const conditionFields = Array.isArray(rawConds) ? rawConds.map(c => ({
              field: c.field || '',
              source: c.source || 'request',
              path: c.path || '',
              required: Boolean(c.required),
              customValue: c.customValue !== undefined ? c.customValue : c.custom_value,
              selectedTable: c.selectedTable !== undefined ? c.selectedTable : c.selected_table
            })) : [];

            sanitizedTables[tName] = {
              chineseName: tConfig.chineseName || tConfig.chinese_name || '',
              primaryKey: tConfig.primaryKey || tConfig.primary_key || '',
              dus: tConfig.dus || 'bdus',
              ignoreFields: tConfig.ignoreFields || tConfig.ignore_fields || '',
              conditionFields: conditionFields
            };
          }
          mappedDefaultTab = { tables: sanitizedTables };
        }

        // ── 1. 更新 React State ──────────────────────────────────────
        if (mappedApi) setApiSettings(mappedApi);
        if (mappedDb) setDbSettings(mappedDb);
        if (mappedSysDb) setSystemDbConfig(mappedSysDb);
        if (mappedDefaultTab) setDefaultTableSettings(mappedDefaultTab);

        // 同步更新已打开状态下的配置草稿，防止弹窗不刷新以及保存时覆盖新导入的数据
        if (mappedDefaultTab && draftDefaultTableSettings) {
          setDraftDefaultTableSettings(JSON.parse(JSON.stringify(mappedDefaultTab)));
        }

        // ── 2. 持久化到 Electron App Config ──────────────────────────
        if (window.electronAPI) {
          if (mappedApi) window.electronAPI.setConfig('apiSettings', JSON.stringify(mappedApi));
          if (mappedDb) window.electronAPI.setConfig('dbSettings', JSON.stringify(mappedDb));
          if (mappedSysDb) window.electronAPI.setConfig('systemDbConfig', JSON.stringify(mappedSysDb));
          if (mappedDefaultTab) window.electronAPI.setConfig('defaultTableSettings', JSON.stringify(mappedDefaultTab));
        }

        // ── 3. 将默认表与现有系统表合并后保存到本地 SQLite (或保存表设置) ──────
        if (electronAPI) {
          try {
            const currentSystemTables = systemSettings?.tables || {};
            const mergedTables = { ...(mappedDefaultTab?.tables || {}), ...currentSystemTables };
            await electronAPI.saveTableSettings(mergedTables);
          } catch (err2) {
            console.warn('[renderer] remote config sqlite sync failed:', err2);
          }
        }

        addLog('从远端同步最新配置成功');
      } else {
        addLog(`拉取远端配置失败: ${resData?.msg || '未知错误'}`, 'WARNING');
      }
    } catch (err) {
      console.error('[fetchRemoteConfig] failed:', err);
      addLog(`拉取远端配置失败: ${err.message}`, 'WARNING');
    }
  };

  const parseMainMapElement = (requestData) => {
    addLog('解析mainMapElemntInfo字段...');
    if (!requestData) throw new Error('请求报文不能为空');
    if (typeof requestData !== 'object') throw new Error('请求报文格式错误，必须是JSON对象');

    const txHeader = requestData.txHeader;
    if (!txHeader) throw new Error('请求报文中未找到txHeader字段');

    const mainMapElement = txHeader.mainMapElemntInfo;
    addLog(`mainMapElemntInfo字段值: ${mainMapElement}`);

    if (mainMapElement === null || mainMapElement === undefined || mainMapElement === "") {
      throw new Error('mainMapElemntInfo字段为null或空字符串');
    }

    const mainMapStr = String(mainMapElement);
    if (mainMapStr.startsWith('04')) {
      const custNo = mainMapStr.substring(2);
      if (!custNo) throw new Error('mainMapElemntInfo字段04开头但后续没有客户号');
      addLog(`解析成功: 类型=客户号, 值=${custNo}`);
      return { type: 'cust_no', value: custNo };
    } else if (mainMapStr.startsWith('05')) {
      const mediumNo = mainMapStr.substring(2);
      if (!mediumNo) throw new Error('mainMapElemntInfo字段05开头但后续没有介质号');
      addLog(`解析成功: 类型=介质号, 值=${mediumNo}`);
      return { type: 'medium_no', value: mediumNo };
    }
  };

  const extractValue = (data, path) => {
    if (!data || !path) return null;

    let jsonPathQuery = path.trim();
    if (!jsonPathQuery.startsWith('$')) {
      // 补全前缀，使原有的 "txBody.list[0].id" 自动变成 "$.txBody.list[0].id"
      jsonPathQuery = jsonPathQuery.startsWith('.') ? '$' + jsonPathQuery : '$.' + jsonPathQuery;
    }

    try {
      const results = JSONPath({ path: jsonPathQuery, json: data });
      if (results && results.length > 0) {
        // 若结果有多个（如使用 [*] 命中数组中所有项），默认取第一个具体值作为SQL查询条件
        return results[0];
      }
    } catch (e) {
      console.warn(`[JSONPath] 提取失败，路径: ${path}`, e);
    }
    
    // 降级兜底：如果 JSONPath 未命中或发生异常，尝试使用原有的对象属性逐层读取逻辑（兼容某些包含特殊字符或关键字的路径）
    try {
      const keys = path.split('.');
      let current = data;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return null;
        }
      }
      return current;
    } catch (e) {
      return null;
    }
  };

  const tableConfigs = {
    'tb_dpmst_medium': {
      primaryKey: 'medium_no',
      conditionField: 'medium_no',
      sourcePaths: {
        medium_no: 'txBody.txEntity.mediumNo',
        cust_no: 'txBody.txComn7.custNo'
      }
    }
  };

  const extractConditions = async (requestData, tableName, routingKey, tableResults = {}) => {
    addLog(`提取表 ${tableName} 的查询条件...`);
    const mergedTables = { ...defaultTableSettings.tables, ...systemSettings.tables };
    const config = mergedTables[tableName];
    if (!config) {
      // 未配置表规则 → 跳过该表，继续处理其他表
      addLog(`警告: 表 ${tableName} 没有配置查询条件，也没有默认配置`, 'WARN');
      return {};
    }

    addLog(`  主键: ${config.primaryKey}`);
    const conditions = {};

    // 处理每个条件字段
    for (const condition of config.conditionFields) {
      addLog(`  处理条件: ${condition.field} (来源: ${condition.source})`);
      let value = null;

      switch (condition.source) {
        case 'request':
          value = extractValue(requestData, condition.path);
          if (value) {
            addLog(`  从请求报文提取 ${condition.field}: ${value}`);
          }
          break;
        case 'route':
          if (condition.field === 'cust_no' || condition.field === 'zone_val') {
            let mediumNoToQuery = null;
            if (condition.path) {
              mediumNoToQuery = extractValue(requestData, condition.path);
              if (mediumNoToQuery) {
                addLog(`  从报文路径 ${condition.path} 提取到介质号: ${mediumNoToQuery}`);
              } else {
                addLog(`  警告: 无法从报文路径 ${condition.path} 提取到介质号`, 'WARN');
              }
            }
            
            if (!mediumNoToQuery && routingKey && routingKey.type === 'medium_no') {
              mediumNoToQuery = routingKey.value;
              addLog(`  使用默认路由键提取介质号: ${mediumNoToQuery}`);
            }

            if (mediumNoToQuery) {
              addLog(`  调用路由服务器routeQuery接口获取cust_no`);
              try {
                const routeUrl = apiSettings.route_url;
                if (!routeUrl) {
                  throw new Error('路由服务器地址(route_url)未配置，请在API设置中填写');
                }
                addLog(`  调用路由查询接口: ${routeUrl}`);
                addLog(`  查询参数: mediumNo = ${mediumNoToQuery}`);
                
                const routeResponse = await axios.get(routeUrl, { params: { mediumNo: mediumNoToQuery }, headers: { env: selectedEnvironment, 'X-Client-Type': 'DESKTOP' } });
                
                let respData = routeResponse.data;
                value = null;

                if (respData && respData.code === 200 && respData.data) {
                  try {
                    const parsedData = typeof respData.data === 'string' ? JSON.parse(respData.data) : respData.data;
                    if (condition.field === 'cust_no') {
                      value = parsedData.custNo !== undefined ? parsedData.custNo : parsedData.cust_no;
                    } else if (condition.field === 'zone_val') {
                      value = parsedData.zoneVal !== undefined ? parsedData.zoneVal : (parsedData.zone_val !== undefined ? parsedData.zone_val : (parsedData.custNo !== undefined ? parsedData.custNo : parsedData.cust_no));
                    }
                  } catch (e) {
                    addLog(`  警告: 尝试解析 data 字段为 JSON 失败: ${e.message}`, 'WARN');
                  }
                }

                if (value === undefined || value === null) {
                  if (condition.field === 'cust_no') {
                    value = respData?.custNo !== undefined ? respData?.custNo : respData?.cust_no;
                  } else if (condition.field === 'zone_val') {
                    value = respData?.zoneVal !== undefined ? respData?.zoneVal : (respData?.zone_val !== undefined ? respData?.zone_val : (respData?.custNo !== undefined ? respData?.custNo : respData?.cust_no));
                  }
                }

                if (value !== undefined && value !== null) {
                  value = String(value);
                }

                if (!value || typeof value !== 'string') {
                  throw new Error(`路由查询返回数据异常或无法提取 ${condition.field}: ${JSON.stringify(routeResponse.data)}`);
                }
                addLog(`  从路由查询获取 ${condition.field}: ${value}`);
              } catch (error) {
                addLog(`  错误: 路由查询失败: ${error.message}`, 'ERROR');
              }
            } else {
              addLog(`  错误: 无法获取介质号，跳过路由查询`, 'ERROR');
            }
          } else {
            if (routingKey) {
              value = extractValue(routingKey, condition.path);
              if (value) {
                addLog(`  从路由结果提取 ${condition.field}: ${value}`);
              }
            }
          }
          break;
        case 'table': {
          const [depTable, depField] = condition.path.split('.');
          if (depTable && depField && tableResults[depTable]) {
            value = extractValue(tableResults[depTable], depField);
            if (value) {
              addLog(`  从表 ${depTable} 提取 ${condition.field}: ${value}`);
            } else {
              addLog(`  警告: 从表 ${depTable} 提取 ${depField} 失败，值为 null 或 undefined`, 'WARN');
            }
          } else {
            addLog(`  警告: 依赖表 ${depTable} 不存在或未查询`, 'WARN');
          }
          break;
        }
      }

      if (value !== null && value !== undefined) {
        conditions[condition.field] = value;
      } else if (condition.required) {
        addLog(`  错误: 必填字段 ${condition.field} 无法提取值`, 'ERROR');
      }
    }

    if (Object.keys(conditions).length > 0) {
      addLog(`  最终查询条件: ${JSON.stringify(conditions)}`);
    } else {
      addLog(`  警告: 无法提取到有效的查询条件`, 'WARN');
    }
    return conditions;
  };

  const sendRequest = async () => {
    setIsLoading(true);
    setError('');
    setResponseBody('');
    setResults([]);
    setLogs([]);
    setActiveTab('log');

    // 每次执行前，主动将最新 tableSettings 同步给主进程（兜底机制）
    if (electronAPI) {
      try {
        await electronAPI.saveTableSettings({ ...defaultTableSettings.tables, ...systemSettings.tables });
      } catch (e) {
        console.warn('[renderer] pre-sync tableSettings failed:', e);
      }
    }

    try {
      addLog('开始执行数据一致性检查...');
      addLog(`请求地址: ${apiUrl}`);

      let requestData;
      try {
        addLog('验证请求报文格式...');
        requestData = JSON.parse(requestBody);
        addLog('请求报文格式验证通过');
        // ---- 校验非 txHeader 部分不能含有 {{变量}} 占位符 ----
        const PLACEHOLDER_RE = /\{\{[^}]+\}\}/g;
        const checkForPlaceholders = (obj, path) => {
          if (typeof obj === 'string') {
            const matches = obj.match(PLACEHOLDER_RE);
            if (matches) {
              return matches.map(m => `${path} → ${m}`);
            }
            return [];
          }
          if (Array.isArray(obj)) {
            return obj.flatMap((item, i) => checkForPlaceholders(item, `${path}[${i}]`));
          }
          if (obj && typeof obj === 'object') {
            return Object.entries(obj).flatMap(([k, v]) => checkForPlaceholders(v, `${path}.${k}`));
          }
          return [];
        };
        // 只检查非 txHeader 的顶层键
        const invalidPlaceholders = [];
        for (const [topKey, topVal] of Object.entries(requestData)) {
          if (topKey === 'txHeader') continue; // txHeader 允许有占位符（由系统自动填充）
          const found = checkForPlaceholders(topVal, topKey);
          invalidPlaceholders.push(...found);
        }
        if (invalidPlaceholders.length > 0) {
          const detail = invalidPlaceholders.slice(0, 5).join('\n');
          addLog(`报文校验失败：非 txHeader 区域存在未替换的变量占位符`, 'ERROR');
          invalidPlaceholders.forEach(p => addLog(`  ✗ ${p}`, 'ERROR'));
          throw new Error(
            `请求报文校验失败：txBody 等非 txHeader 字段中存在 {{变量}} 占位符，请替换为实际值后重试。\n涉及字段：\n${detail}`
          );
        }
        addLog('报文占位符校验通过（非 txHeader 区域无未替换变量）');
      } catch (parseOrValidateErr) {
        // JSON 解析失败或占位符校验失败，统一记录并中断
        addLog(parseOrValidateErr.message || '报文校验失败', 'ERROR');
        throw parseOrValidateErr;
      }

      // ---- 辅助：为报文生成并写入动态字段（时间戳、跟踪号、tenantId）----
      const applyDynamicFields = (data) => {
        const d = new Date();
        const ymd =
          d.getFullYear() +
          (d.getMonth() + 1).toString().padStart(2, '0') +
          d.getDate().toString().padStart(2, '0');
        const hms =
          d.getHours().toString().padStart(2, '0') +
          d.getMinutes().toString().padStart(2, '0') +
          d.getSeconds().toString().padStart(2, '0') +
          d.getMilliseconds().toString().padStart(3, '0');
        const ts = ymd + hms;
        const rnd = Math.floor(Math.random() * 10).toString();
        const subtx = '10221990001111000000000' + rnd + ymd;
        const trackNo =
          ts + '1022199CK001' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        if (data.txHeader) {
          data.txHeader.globalBusiTrackNo = trackNo;
          data.txHeader.subtxNo = subtx;
          data.txHeader.txStartTime = ts;
          data.txHeader.txSendTime = ts;
          if (selectedEnvironment === 'TEST') {
            data.txHeader.tenantId = 'QHGD';
          } else if (selectedEnvironment === 'PREPROD') {
            data.txHeader.tenantId = 'PROD';
          } else {
            data.txHeader.tenantId = selectedEnvironment;
          }
        }
        return { trackNo, subtx, ts };
      };

      // ---- 辅助：请求 MAC 并写回 txHeader.msgrptMac ----
      const applyMac = async (data, label) => {
        const macUrl = apiSettings[selectedEnvironment]?.mac_url;
        if (!macUrl) {
          addLog(`[${label}] mac_url未配置或为空，跳过MAC获取步骤`, 'INFO');
          return;
        }
        addLog(`[${label}] 调用mac_url获取msgrptMac值: ${macUrl}`);
        const macResponse = await axios.post(macUrl, data);
        const msgrptMac = macResponse.data;
        if (!msgrptMac || typeof msgrptMac !== 'string') {
          throw new Error(`[${label}] mac_url返回的值不是有效字符串`);
        }
        if (data.txHeader) {
          data.txHeader.msgrptMac = msgrptMac;
          addLog(`[${label}] msgrptMac替换成功: ${msgrptMac}`);
        }
      };

      // ================================================================
      // 【决策】根据用户是否配置检查表，选择预发送或直接流程
      // ================================================================
      const userConfiguredTables = tables.filter(t => t.name).map(t => t.name);
      let effectiveTables = [];

      if (userConfiguredTables.length > 0) {
        // 用户已配置检查表，直接使用，跳过预发送流程
        effectiveTables = userConfiguredTables;
        addLog(`用户已配置 ${effectiveTables.length} 个检查表，跳过预发送流程`);
        addLog(`检查表: ${effectiveTables.join(', ')}`);
      } else {
        // 用户未配置检查表，执行预发送获取目标表名
        addLog('预发送 · 自动发现检查表', 'PHASE');
        const preRequestData = JSON.parse(JSON.stringify(requestData));
        applyDynamicFields(preRequestData);
        preRequestData.txEmb = { afterException: 'YRC000035' };
        addLog(`globalBusiTrackNo: ${preRequestData.txHeader?.globalBusiTrackNo}`);

        try {
          await applyMac(preRequestData, '预发送');
        } catch (macErr) {
          addLog(`MAC获取失败: ${macErr.message}`, 'ERROR');
          throw new Error(`[预发送] MAC请求失败: ${macErr.message}`);
        }

        addLog(`发送预请求 → ${apiUrl}`);
        let preApiResponse = null;
        try {
          const preResp = await axios.post(apiUrl, preRequestData);
          preApiResponse = preResp.data;
          addLog('预请求响应成功');
        } catch (preErr) {
          if (preErr.response) {
            preApiResponse = preErr.response.data;
            addLog(`预请求响应非2xx: ${JSON.stringify(preApiResponse)}`, 'WARN');
          } else {
            addLog(`预请求异常: ${preErr.message}`, 'WARN');
          }
        }

        // 【预发送结果校验】检查 servRespCd 是否符合预期
        const EXPECTED_SERV_RESP_CD = 'Y1022199RC000035';
        const actualServRespCd = preApiResponse?.txHeader?.servRespCd;

        if (actualServRespCd !== EXPECTED_SERV_RESP_CD) {
          addLog(`servRespCd 校验失败 — 预期: ${EXPECTED_SERV_RESP_CD}  实际: ${actualServRespCd ?? '(未返回)'}`, 'ERROR');
          addLog('预发送结果不符合预期，终止后续 SQL 查询与比对', 'ERROR');
          return;
        }
        addLog(`servRespCd 校验通过 ✓ ${actualServRespCd}`);

        // 调用 tranSqlQry 接口，根据预发送流水号查询对应 SQL
        addLog('tranSqlQry · 查询预发送涉及的 SQL', 'PHASE');
        const preGlo = preRequestData.txHeader?.globalBusiTrackNo;
        const routeOrigin = (() => { try { return new URL(apiSettings.route_url).origin; } catch { return ''; } })();
        const tranSqlQryUrl = `${routeOrigin}/testtool/tranSqlQry`;
        addLog(`globalBusiTrackNo: ${preGlo}  →  ${tranSqlQryUrl}`);
        try {
          const tranResp = await axios.post(tranSqlQryUrl, { glo: preGlo }, { headers: { 'Content-Type': 'application/json;charset=UTF-8', 'X-Client-Type': 'DESKTOP' } });
          const tranData = tranResp.data;
          if (tranData?.code === 200 && tranData?.data) {
            let parsedSqlData;
            try {
              parsedSqlData = typeof tranData.data === 'string' ? JSON.parse(tranData.data) : tranData.data;
            } catch {
              addLog('解析响应 data 字段失败', 'WARN');
              parsedSqlData = {};
            }
            const sqlArray = parsedSqlData.sqlList || [];
            const splitIdx = sqlArray.findIndex(sql => sql.includes('COMPENSATION_SPLIT_LINE'));
            const normalSqls = splitIdx !== -1 ? sqlArray.slice(0, splitIdx) : sqlArray;

            const extractTableName = (sql) => {
              const s = sql.trim();
              const insertMatch = s.match(/^\s*INSERT\s+(?:INTO\s+)?([`"[\w.]+[\w`"\]]+)/i);
              if (insertMatch) return insertMatch[1].replace(/[`"[\]]/g, '').split('.').pop();
              const updateMatch = s.match(/^\s*UPDATE\s+([`"[\w.]+[\w`"\]]+)/i);
              if (updateMatch) return updateMatch[1].replace(/[`"[\]]/g, '').split('.').pop();
              const deleteMatch = s.match(/^\s*DELETE\s+FROM\s+([`"[\w.]+[\w`"\]]+)/i);
              if (deleteMatch) return deleteMatch[1].replace(/[`"[\]]/g, '').split('.').pop();
              const mergeMatch = s.match(/^\s*MERGE\s+INTO\s+([`"[\w.]+[\w`"\]]+)/i);
              if (mergeMatch) return mergeMatch[1].replace(/[`"[\]]/g, '').split('.').pop();
              return null;
            };
            // 去除分表号后缀，去重
            const stripShardSuffix = (name) => name.replace(/_\d+$/, '');
            const nonSelectSqls = normalSqls.filter(sql => !/^\s*SELECT\s/i.test(sql.trim()));
            const rawNames = nonSelectSqls.map(extractTableName).filter(Boolean);
            const strippedNames = [...new Set(rawNames.map(stripShardSuffix))];

            const compCount = splitIdx !== -1 ? sqlArray.length - splitIdx - 1 : 0;
            addLog(`正常SQL ${normalSqls.length} 条${compCount > 0 ? `，补偿SQL ${compCount} 条（已忽略）` : ''}`);

            if (strippedNames.length > 0) {
              addLog(`发现检查表（${strippedNames.length} 个）: ${strippedNames.join(', ')}`);
              effectiveTables = strippedNames;
            } else {
              addLog('正常SQL中未找到非SELECT语句', 'WARN');
            }
          } else {
            addLog(`查询失败: ${tranData?.msg || '未知错误'}`, 'WARN');
          }
        } catch (tranErr) {
          addLog(`接口调用失败: ${tranErr.message}`, 'ERROR');
        }

        if (effectiveTables.length === 0) {
          addLog('未能提取到有效检查表，跳过 SQL 比对，仅执行正式发送', 'WARN');
        }
      }

      // ================================================================
      // 【正式发送前】为正式报文重新生成动态字段 + MAC（不含 txEmb）
      // ================================================================
      addLog('正式报文准备 · 生成动态字段 + MAC', 'PHASE');
      applyDynamicFields(requestData);
      addLog(`glo: ${requestData.txHeader?.globalBusiTrackNo}  tenantId: ${requestData.txHeader?.tenantId}`);

      try {
        await applyMac(requestData, '正式发送');
      } catch (macErr) {
        addLog(`mac_url请求失败: ${macErr.message}`, 'ERROR');
        throw new Error(`mac_url请求失败: ${macErr.message}`);
      }

      let routingKey = null;
      try {
        routingKey = parseMainMapElement(requestData);
      } catch (parseError) {
        addLog(`解析mainMapElemntInfo失败: ${parseError.message}`, 'ERROR');
        throw parseError;
      }

      // 如果是介质号 (05开头)，强制优先查询 tb_dpmst_medium
      if (routingKey?.type === 'medium_no') {
        const mediumTable = 'tb_dpmst_medium';
        effectiveTables = effectiveTables.filter(t => t !== mediumTable);
        effectiveTables.unshift(mediumTable);
        addLog(`检测到介质号请求，强制置顶优先查询 [${mediumTable}] 表`, 'INFO');
      }

      addLog('条件提取 · 为各检查表构建查询条件', 'PHASE');
      const tableConditions = {};
      const skippedTables = [];

      // 只提取来源为 request / route 的初始条件（非表依赖条件），
      // 表依赖条件（source=table）由后端在顺序查询时动态填充。
      for (const tableName of effectiveTables) {
        try {
          const mergedTables = { ...defaultTableSettings.tables, ...systemSettings.tables };
          const config = mergedTables[tableName];
          if (!config) {
            // 未配置表规则 → 跳过该表，继续处理其他表
            addLog(`[${tableName}] 未配置查询条件，跳过`, 'WARN');
            skippedTables.push(tableName);
            continue;
          }
          {
            const conditions = {};
            for (const cond of config.conditionFields) {
              if (cond.source === 'table' || cond.source === 'response') {
                // 跳过表依赖条件和响应依赖条件，交由后续阶段处理
                continue;
              }
              let value = null;
              if (cond.source === 'request') {
                value = extractValue(requestData, cond.path);
                if (value) addLog(`[${tableName}] ${cond.field} = ${value}  (来自请求报文)`);
              } else if (cond.source === 'custom') {
                value = cond.customValue;
                if (value !== undefined && value !== null) addLog(`[${tableName}] ${cond.field} = ${value}  (来自用户自定义)`);
              } else if (cond.source === 'route') {
                if (cond.field === 'cust_no' || cond.field === 'zone_val') {
                  let mediumNoToQuery = null;
                  if (cond.path) {
                    mediumNoToQuery = extractValue(requestData, cond.path);
                    if (!mediumNoToQuery) {
                      addLog(`[${tableName}] 警告: 无法从 ${cond.path} 提取介质号`, 'WARN');
                    }
                  }
                  
                  if (!mediumNoToQuery && routingKey && routingKey.type === 'medium_no') {
                    mediumNoToQuery = routingKey.value;
                  }

                  if (mediumNoToQuery) {
                    try {
                      const routeUrl = apiSettings.route_url;
                      if (!routeUrl) throw new Error('route_url 未配置');
                      addLog(`[${tableName}] 路由查询 mediumNo=${mediumNoToQuery}  →  ${routeUrl}`);
                      const routeResponse = await axios.get(routeUrl, { params: { mediumNo: mediumNoToQuery }, headers: { env: selectedEnvironment, 'X-Client-Type': 'DESKTOP' } });
                      let respData = routeResponse.data;
                      if (respData && respData.code === 200 && respData.data) {
                        try {
                          const parsedData = typeof respData.data === 'string' ? JSON.parse(respData.data) : respData.data;
                          if (cond.field === 'cust_no') {
                            value = parsedData.custNo !== undefined ? parsedData.custNo : parsedData.cust_no;
                          } else if (cond.field === 'zone_val') {
                            value = parsedData.zoneVal !== undefined ? parsedData.zoneVal : (parsedData.zone_val !== undefined ? parsedData.zone_val : (parsedData.custNo !== undefined ? parsedData.custNo : parsedData.cust_no));
                          }
                        } catch (e) {
                          addLog(`[${tableName}] 解析路由响应失败: ${e.message}`, 'WARN');
                        }
                      }
                      
                      if (value === undefined || value === null) {
                        if (cond.field === 'cust_no') {
                          value = respData?.custNo !== undefined ? respData?.custNo : respData?.cust_no;
                        } else if (cond.field === 'zone_val') {
                          value = respData?.zoneVal !== undefined ? respData?.zoneVal : (respData?.zone_val !== undefined ? respData?.zone_val : (respData?.custNo !== undefined ? respData?.custNo : respData?.cust_no));
                        }
                      }

                      if (value !== undefined && value !== null) {
                        value = String(value);
                      }

                      if (!value || typeof value !== 'string') throw new Error(`路由响应中无法提取 ${cond.field}: ${JSON.stringify(routeResponse.data)}`);
                      addLog(`[${tableName}] ${cond.field} = ${value}  (来自路由查询)`);
                    } catch (routeErr) {
                      addLog(`[${tableName}] 路由查询失败: ${routeErr.message}`, 'ERROR');
                      // 路由查询失败时，如果该字段是必填，向上抛出中断任务
                      if (cond.required) {
                        throw new Error(`[${tableName}] 必填字段 [${cond.field}] 路由查询失败，任务终止: ${routeErr.message}`);
                      }
                    }
                  } else {
                    addLog(`[${tableName}] 无法获取介质号，跳过路由查询`, 'ERROR');
                    if (cond.required) {
                      throw new Error(`[${tableName}] 必填字段 [${cond.field}] 无法获取介质号，任务终止`);
                    }
                  }
                } else {
                  if (routingKey) {
                    value = extractValue(routingKey, cond.path);
                    if (value) addLog(`[${tableName}] ${cond.field} = ${value}  (来自路由键)`);
                  }
                }
              }
              if (value !== null && value !== undefined) {
                conditions[cond.field] = value;
              } else if (cond.required) {
                // 必填字段无法提取 → 中断任务，不继续执行
                addLog(`[${tableName}] 必填字段 [${cond.field}] 无法提取到值，中断任务`, 'ERROR');
                throw new Error(`[${tableName}] 必填字段 [${cond.field}] 无法提取到值，任务终止。请检查表配置中的条件路径是否正确`);
              }
            }
            tableConditions[tableName] = conditions;
            addLog(`[${tableName}] 查询条件就绪: ${JSON.stringify(conditions)}`);
          }
        } catch (condError) {
          // 向上抛出，由外层 catch 统一处理，保持在日志页不跳转
          addLog(`条件提取阶段中断: ${condError.message}`, 'ERROR');
          throw condError;
        }
      }

      addLog(`环境: ${selectedEnvironment}  检查表: ${effectiveTables.join(', ') || '(无)'}`);


      const tablesToCheck = effectiveTables.filter(t => !skippedTables.includes(t));

      const hasResponseCond = (tableName) => {
        const mergedTables = { ...defaultTableSettings.tables, ...systemSettings.tables };
        const config = mergedTables[tableName];
        return config?.conditionFields?.some(c => c.source === 'response');
      };
      
      const beforeTablesToCheck = tablesToCheck.filter(t => !hasResponseCond(t));
      const afterTablesToCheck = tablesToCheck;

      if (tablesToCheck.length === 0) {
        // 无可检查的表，直接发送正式接口并跳过 SQL 比对
        addLog('无需执行 SQL 比对：所有检查表均已跳过或未获取到有效表名', 'WARN');
        addLog(`调用接口: ${apiUrl}`);
        let apiResponse = null;
        try {
          const apiResponseData = await axios.post(apiUrl, requestData);
          apiResponse = apiResponseData.data;
          addLog('API响应获取成功');
          setResponseBody(JSON.stringify(apiResponse, null, 2));
        } catch (apiError) {
          if (apiError.response) {
            apiResponse = apiError.response.data;
            setResponseBody(JSON.stringify(apiError.response.data, null, 2));
          } else {
            setResponseBody(`{"error": "${apiError.message}"}`);
          }
        }
        const skippedResults = skippedTables.map(tableName => ({
          table: tableName,
          status: '跳过',
          message: '未配置查询条件，已跳过比对检查',
          details: { before: { count: 0, sql: '', data: [] }, after: { count: 0, sql: '', data: [] } }
        }));
        if (skippedResults.length > 0) {
          setResults(skippedResults);
          setTimeout(() => setActiveTab('result'), 800);
        }
      } else {
        try {
          const basePayload = {
            tables: tablesToCheck,
            requestData: requestData,
            routingKey: routingKey,
            tableConditions: tableConditions,
            tableSettings: { ...defaultTableSettings.tables, ...systemSettings.tables },
            environment: selectedEnvironment,
            dbSettings: dbSettings
          };

          // ── Step 1: 接口调用前 SQL 查询 ──────────────────────────────
          addLog('接口请求前 · 前置 SQL 查询', 'PHASE');
          let beforeCheckData = { beforeData: {}, logs: [] };
          if (beforeTablesToCheck.length > 0) {
            if (electronAPI) {
              try {
                beforeCheckData = await electronAPI.runBeforeCheck({ ...basePayload, tables: beforeTablesToCheck });
              } catch (err) {
                addLog(`前置 SQL 查询调用失败: ${err.message}`, 'ERROR');
                throw err;
              }
            } else {
              addLog('纯浏览器环境，回退到后台 HTTP 接口...', 'WARN');
              const res = await axios.post('http://localhost:8000/api/before-check', { ...basePayload, tables: beforeTablesToCheck });
              beforeCheckData = res.data;
            }
            for (const log of (beforeCheckData?.logs || [])) {
              addLog(log.message, log.level || 'INFO');
            }
            if (!beforeCheckData?.success) {
              throw new Error(beforeCheckData?.error || '前置 SQL 查询失败，请查看执行日志');
            }
            addLog('接口请求前 · 前置查询完成 ✓', 'PHASE');
          } else {
            addLog('无可执行前置查询的表（存在响应报文依赖），跳过前置查询', 'INFO');
          }

          // ── Step 2: 正式接口调用 ──────────────────────────────────────
          addLog(`正式发送 · 调用接口`, 'PHASE');
          addLog(`目标: ${apiUrl}`);
          let apiResponse = null;
          try {
            const apiResponseData = await axios.post(apiUrl, requestData);
            apiResponse = apiResponseData.data;
            addLog('API响应获取成功');
            setResponseBody(JSON.stringify(apiResponse, null, 2));
          } catch (apiError) {
            addLog('API调用成功（已请求到地址）', 'INFO');
            if (apiError.response) {
              addLog(`响应数据: ${JSON.stringify(apiError.response.data)}`, 'INFO');
              apiResponse = apiError.response.data;
              setResponseBody(JSON.stringify(apiError.response.data, null, 2));
            } else {
              addLog(`请求信息: ${apiError.message}`, 'INFO');
              setResponseBody(`{"error": "${apiError.message}"}`);
            }
          }

          // ── Step 3: 接口调用后 SQL 查询 + 比对 ───────────────────────
          addLog('提取响应报文查询条件', 'PHASE');
          for (const tableName of afterTablesToCheck) {
            const mergedTables = { ...defaultTableSettings.tables, ...systemSettings.tables };
            const config = mergedTables[tableName];
            if (!config) continue;
            for (const cond of config.conditionFields) {
              if (cond.source === 'response') {
                const value = extractValue(apiResponse, cond.path);
                if (value !== undefined && value !== null) {
                  if (!tableConditions[tableName]) tableConditions[tableName] = {};
                  tableConditions[tableName][cond.field] = String(value);
                  addLog(`[${tableName}] ${cond.field} = ${value} (来自响应报文)`);
                } else if (cond.required) {
                  addLog(`[${tableName}] 必填字段 ${cond.field} 无法从响应报文中提取`, 'ERROR');
                }
              }
            }
          }

          addLog('接口请求后 · 后置 SQL 查询 + 比对', 'PHASE');
          let checkData;
          if (electronAPI) {
            try {
              checkData = await electronAPI.runAfterCheck({
                ...basePayload,
                beforeData: beforeCheckData.beforeData,
                apiResponse: apiResponse
              });
            } catch (err) {
              addLog(`后置 SQL 查询调用失败: ${err.message}`, 'ERROR');
              throw err;
            }
          } else {
            addLog('纯浏览器环境，回退到后台 HTTP 接口...', 'WARN');
            const res = await axios.post('http://localhost:8000/api/after-check', {
              ...basePayload,
              beforeData: beforeCheckData.beforeData,
              apiResponse: apiResponse
            });
            checkData = res.data;
          }
          for (const log of (checkData?.logs || [])) {
            addLog(log.message, log.level || 'INFO');
          }
          if (!checkData?.success) {
            throw new Error(checkData?.error || '后置 SQL 查询失败，请查看执行日志');
          }

          const backendResults = (checkData?.results || []).map(result => ({
            table: result.table,
            status: result.status === '通过' ? '通过' : result.status === '失败' ? '失败' : '错误',
            message: result.message,
            details: {
              before: { count: result.before?.count || 0, sql: result.before?.sql || '', data: result.before?.data || [] },
              after: { count: result.after?.count || 0, sql: result.after?.sql || '', data: result.after?.data || [] }
            }
          }));

          const skippedResults = skippedTables.map(tableName => ({
            table: tableName,
            status: '跳过',
            message: '未配置查询条件，已跳过比对检查',
            details: { before: { count: 0, sql: '', data: [] }, after: { count: 0, sql: '', data: [] } }
          }));

          setResults([...backendResults, ...skippedResults]);
          addLog('断言结果已生成');
          setTimeout(() => setActiveTab('result'), 800);
        } catch (err) {
          addLog(`数据库连接失败: ${err.message}`, 'ERROR');
          throw err;
        }
      }
    } catch (err) {
      addLog(`执行失败: ${err.message}`, 'ERROR');
      setError(err.message || '请求失败');
    } finally {
      setIsLoading(false);
      addLog('执行完成');
    }
  };

  const handleSqlClick = (tableName, details) => {
    if (!details) return;
    setDataModalContent({
      title: tableName,
      beforeSql: details.before?.sql || 'N/A',
      afterSql: details.after?.sql || 'N/A',
      beforeData: details.before?.data || [],
      afterData: details.after?.data || []
    });
    setDataModalSearchQuery('');
    setSelectedFields([]);
    setIsDropdownOpen(false);
    setExpandedRecords({});
    setShowDataModal(true);
  };

  const renderDataComparisonTable = () => {
    const { title: tableName, beforeData, afterData } = dataModalContent;
    const allKeys = new Set();
    const maxLen = Math.max(beforeData.length, afterData.length);
    if (maxLen === 0) return null;

    if (beforeData[0]) Object.keys(beforeData[0]).forEach(k => allKeys.add(k));
    if (afterData[0]) Object.keys(afterData[0]).forEach(k => allKeys.add(k));
    
    const fields = Array.from(allKeys);
    const dropdownOptions = fields.filter(field => field.toLowerCase().includes(dataModalSearchQuery.toLowerCase()));
    const tableFieldsToShow = selectedFields.length > 0 ? fields.filter(f => selectedFields.includes(f)) : fields;

    // 获取当前表的忽略字段配置（解决浅拷贝可能导致的丢失，并支持中英文逗号及大小写忽略）
    const defaultTableConfig = defaultTableSettings.tables[tableName] || {};
    const systemTableConfig = systemSettings.tables[tableName] || {};
    const tableConfig = { ...defaultTableConfig, ...systemTableConfig };

    const ignoreFieldsStr = tableConfig.ignoreFields || '';
    // 使用正则表达式兼容半角逗号和全角逗号，并统一转小写去除空格
    const ignoreFieldsSet = new Set(ignoreFieldsStr.toLowerCase().split(/[,，]/).map(f => f.trim()).filter(Boolean));
    
    const toggleRecord = (idx) => {
      setExpandedRecords(prev => {
        const isCurrentlyExpanded = prev[idx] !== false; // 初始为 undefined 时视作展开
        return {
        ...prev,
        [idx]: !isCurrentlyExpanded
        };
      });
    };

    const toggleFieldSelection = (field) => {
      setSelectedFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
    };
    
    const removeFieldSelection = (field, e) => {
      e.stopPropagation();
      setSelectedFields(prev => prev.filter(f => f !== field));
    };

    return (
      <div className="data-table-container" style={{ overflowX: 'auto', marginTop: '15px' }}>
        <div style={{ marginBottom: '20px', position: 'sticky', top: '-10px', zIndex: 20, background: 'var(--bg-color)', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ position: 'relative' }}>
            <div 
              style={{ 
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
                width: '100%', minHeight: '44px', padding: '6px 42px', borderRadius: '10px', 
                border: '1px solid', borderColor: isDropdownOpen ? '#007aff' : 'var(--border-color)',
                backgroundColor: 'var(--bg-lighter)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isDropdownOpen ? '0 0 0 4px rgba(0, 122, 255, 0.15)' : '0 2px 8px rgba(0,0,0,0.1)',
                cursor: 'text'
              }}
              onClick={() => setIsDropdownOpen(true)}
            >
              <span style={{ position: 'absolute', left: '16px', top: '12px', color: '#888', display: 'flex', pointerEvents: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>

            {selectedFields.map(field => (
                <span key={field} style={{
                  display: 'flex', alignItems: 'center', backgroundColor: 'rgba(0, 122, 255, 0.15)', 
                  color: '#4a90e2', padding: '4px 10px', borderRadius: '8px', fontSize: '13px', 
                  fontWeight: '600', border: '1px solid rgba(0, 122, 255, 0.2)', userSelect: 'none'
                }}>
                  {field}
                  <span 
                    onClick={(e) => removeFieldSelection(field, e)}
                    style={{ marginLeft: '6px', cursor: 'pointer', display: 'flex', opacity: 0.7, padding: '2px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.1)' }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.7}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </span>
                </span>
              ))}

          <input
            type="text"
            placeholder={selectedFields.length === 0 ? "搜索并选择字段名称 (如: cust_no)..." : ""}
            value={dataModalSearchQuery}
            onChange={(e) => {
              setDataModalSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
                onFocus={() => setIsDropdownOpen(true)}
            style={{ 
                flex: 1, minWidth: '150px', border: 'none', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: '15px', outline: 'none', padding: '4px 0'
              }}
              />

              {(selectedFields.length > 0 || dataModalSearchQuery) && (
              <span 
                style={{ position: 'absolute', right: '16px', top: '12px', color: '#aaa', cursor: 'pointer', padding: '4px', display: 'flex' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDataModalSearchQuery('');
                    setSelectedFields([]);
                  }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#aaa'}
                title="清除所有"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </span>
            )}
            
            </div>

            {isDropdownOpen && (
              <>
                <div 
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}
                  onClick={(e) => { e.stopPropagation(); setIsDropdownOpen(false); }}
                />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '10px', zIndex: 30,
                  backgroundColor: isDarkMode ? 'rgba(35, 35, 35, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(12px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  maxHeight: '300px', overflowY: 'auto', padding: '8px'
                }}>
                  {dropdownOptions.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                      未找到相关字段
                    </div>
                  ) : (
                    dropdownOptions.map(field => {
                      const isSelected = selectedFields.includes(field);
                      return (
                        <div 
                          key={field}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFieldSelection(field);
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                          style={{
                            padding: '10px 14px', borderRadius: '8px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            backgroundColor: isSelected ? 'rgba(0, 122, 255, 0.15)' : 'transparent',
                            color: isSelected ? '#4a90e2' : 'var(--text-primary)',
                            fontSize: '14px', fontWeight: isSelected ? '600' : '400',
                            transition: 'background-color 0.2s', marginBottom: '4px'
                          }}
                        >
                          {field}
                          {isSelected && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
              )}
          </div>
        </div>
        {Array.from({ length: maxLen }).map((_, idx) => {
          const isExpanded = expandedRecords[idx] !== false; // 默认展开
          return (
          <div key={idx} style={{ marginBottom: '24px' }}>
            {maxLen > 1 && (
              <div 
                style={{
                  marginBottom: '12px',
                  padding: '12px 18px',
                  backgroundColor: 'var(--bg-lighter)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  userSelect: 'none',
                  transition: 'background-color 0.25s, box-shadow 0.25s',
                }}
                onClick={() => toggleRecord(idx)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-lighter)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                title="点击折叠/展开"
              >
                <div style={{ display: 'flex', alignItems: 'center', fontWeight: '600', color: 'var(--text-primary)', fontSize: '15px' }}>
                  <span style={{ 
                    marginRight: '14px', 
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', 
                    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255,255,255,0.06)'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </span>
                  数据对比组 {idx + 1}
                </div>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', backgroundColor: 'rgba(0,0,0,0.25)', padding: '4px 10px', borderRadius: '12px' }}>
                  {isExpanded ? '点击折叠' : '点击展开'}
                </span>
              </div>
            )}
            {isExpanded && (
              <div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', padding: '0 4px' }}>
                  <button
                    className="btn-secondary"
                    style={{
                      fontSize: '12px',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 122, 255, 0.12)',
                      border: '1px solid rgba(0, 122, 255, 0.25)',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.22s ease-in-out',
                      fontWeight: '600'
                    }}
                    onClick={() => {
                      setAssertionSelections(prev => {
                        const newSelections = { ...prev };
                        tableFieldsToShow.forEach(field => {
                          const hasBeforeRecord = beforeData && beforeData[idx] !== undefined;
                          const bVal = hasBeforeRecord ? beforeData[idx][field] : undefined;
                          const aVal = afterData[idx] ? afterData[idx][field] : undefined;
                          const isIgnored = ignoreFieldsSet.has(field.toLowerCase());
                          const isDiff = !isIgnored && hasBeforeRecord && bVal !== aVal;
                          
                          if (isDiff) {
                            newSelections[`${tableName}|${idx}|${field}`] = true;
                          }
                        });
                        return newSelections;
                      });
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 122, 255, 0.24)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(0, 122, 255, 0.12)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    ⚡ 勾选所有 DIFF 变更列
                  </button>
                  <button
                    className="btn-secondary"
                    style={{
                      fontSize: '12px',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      background: 'rgba(50, 205, 50, 0.12)',
                      border: '1px solid rgba(50, 205, 50, 0.25)',
                      color: '#32cd32',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.22s ease-in-out',
                      fontWeight: '600'
                    }}
                    onClick={() => {
                      setAssertionSelections(prev => {
                        const newSelections = { ...prev };
                        tableFieldsToShow.forEach(field => {
                          newSelections[`${tableName}|${idx}|${field}`] = true;
                        });
                        return newSelections;
                      });
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(50, 205, 50, 0.24)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(50, 205, 50, 0.12)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    ✅ 勾选当前所有列
                  </button>
                  <button
                    className="btn-secondary"
                    style={{
                      fontSize: '12px',
                      padding: '5px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.22s ease-in-out',
                      fontWeight: '500'
                    }}
                    onClick={() => {
                      setAssertionSelections(prev => {
                        const newSelections = { ...prev };
                        tableFieldsToShow.forEach(field => {
                          delete newSelections[`${tableName}|${idx}|${field}`];
                        });
                        return newSelections;
                      });
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    🧹 清空本表勾选
                  </button>
                </div>

                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '10px 12px', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-lighter)', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-secondary)', width: '10%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <input
                            type="checkbox"
                            title="全选 / 取消全选"
                            checked={tableFieldsToShow.length > 0 && tableFieldsToShow.every(field => isColumnChecked(tableName, idx, field))}
                            onChange={(e) => {
                              const shouldCheck = e.target.checked;
                              setAssertionSelections(prev => {
                                const newSelections = { ...prev };
                                tableFieldsToShow.forEach(field => {
                                  const key = `${tableName}|${idx}|${field}`;
                                  if (shouldCheck) {
                                    newSelections[key] = true;
                                  } else {
                                    delete newSelections[key];
                                  }
                                });
                                return newSelections;
                              });
                            }}
                            style={{
                              cursor: 'pointer',
                              width: '14px',
                              height: '14px',
                              accentColor: '#007aff',
                              borderRadius: '3px'
                            }}
                          />
                          <span>断言</span>
                        </div>
                      </th>
                      <th style={{ padding: '10px 12px', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-lighter)', textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--text-secondary)', width: '20%' }}>字段名称</th>
                      <th style={{ padding: '10px 12px', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-lighter)', textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--text-secondary)', width: '36%' }}>执行前数据</th>
                      <th style={{ padding: '10px 12px', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-lighter)', textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--text-secondary)', width: '36%' }}>执行后数据</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableFieldsToShow.map(field => {
                      const hasBeforeRecord = beforeData && beforeData[idx] !== undefined;
                      const bVal = hasBeforeRecord ? beforeData[idx][field] : undefined;
                      const aVal = afterData[idx] ? afterData[idx][field] : undefined;
                      const isIgnored = ignoreFieldsSet.has(field.toLowerCase());
                      const isDiff = !isIgnored && hasBeforeRecord && bVal !== aVal;
                      const isNewDataOnly = !hasBeforeRecord && aVal !== undefined;
                      const isChecked = isColumnChecked(tableName, idx, field);

                      const rowStyle = {
                        borderBottom: isDiff ? '1px solid rgba(255,80,80,0.3)' : '1px solid var(--border-color)',
                        backgroundColor: isChecked
                          ? 'rgba(0, 122, 255, 0.08)'
                          : (isDiff ? 'rgba(255,50,50,0.14)' : 'transparent'),
                        borderLeft: isChecked
                          ? '4px solid #007aff'
                          : (isDiff ? '4px solid #ff4040' : '4px solid transparent'),
                        transition: 'background-color 0.2s, border-left-color 0.2s'
                      };

                      const fmtVal = (v) => v === undefined
                        ? <span style={{ opacity: 0.35 }}>—</span>
                        : v === null
                          ? <span style={{ fontStyle: 'italic', opacity: 0.45 }}>NULL</span>
                          : String(v);
                      return (
                        <tr key={field} style={rowStyle}>
                          {/* 断言勾选框 */}
                          <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleColumnAssertion(tableName, idx, field)}
                              style={{
                                cursor: 'pointer',
                                width: '15px',
                                height: '15px',
                                accentColor: '#007aff',
                                borderRadius: '4px'
                              }}
                            />
                          </td>
                          {/* 字段名 */}
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: isDiff ? 700 : 500, color: isChecked ? 'var(--accent)' : (isDiff ? '#ff5555' : 'var(--text-secondary)') }}>
                            {isDiff && (
                              <span style={{
                                display: 'inline-block', marginRight: 7,
                                padding: '1px 6px', borderRadius: 4,
                                fontSize: 10, fontWeight: 800, lineHeight: 1.6,
                                backgroundColor: '#ff4040', color: '#fff',
                                verticalAlign: 'middle',
                                boxShadow: '0 0 8px rgba(255,64,64,0.55)',
                              }}>DIFF</span>
                            )}
                            {isIgnored && hasBeforeRecord && bVal !== aVal && (
                              <span style={{
                                display: 'inline-block', marginRight: 7,
                                padding: '1px 6px', borderRadius: 4,
                                fontSize: 10, fontWeight: 700, lineHeight: 1.6,
                                backgroundColor: 'var(--info-bg)', color: 'var(--info)',
                                verticalAlign: 'middle', border: '1px solid var(--info)'
                              }}>IGNORED</span>
                            )}
                            {field}
                          </td>
                          {/* 接口前值 — 红色删除线 */}
                          <td style={{
                            padding: '10px 12px', wordBreak: 'break-all',
                            fontFamily: isDiff ? 'monospace' : 'inherit',
                            fontWeight: isDiff ? 600 : 400,
                            color: isDiff ? '#ff7070' : 'var(--text-secondary)',
                            textDecoration: isDiff ? 'line-through' : 'none',
                            opacity: (isIgnored && hasBeforeRecord && bVal !== aVal) ? 0.6 : 1
                          }}>
                            {fmtVal(bVal)}
                          </td>
                          {/* 接口后值 — 绿色/蓝色加粗 */}
                          <td style={{
                            padding: '10px 12px', wordBreak: 'break-all',
                            fontFamily: isDiff || isNewDataOnly ? 'monospace' : 'inherit',
                            fontWeight: isDiff || isNewDataOnly ? 700 : 400,
                            color: isDiff ? '#f5a623' : (isNewDataOnly ? '#4a90e2' : 'var(--text-secondary)'),
                            opacity: (isIgnored && hasBeforeRecord && bVal !== aVal) ? 0.6 : 1
                          }}>
                            {isDiff && <span style={{ marginRight: 5, fontSize: 12, opacity: 0.8 }}>→</span>}
                            {fmtVal(aVal)}
                          </td>
                        </tr>
                      );
                    })}
                    {tableFieldsToShow.length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                          未找到匹配的字段
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
        })}
      </div>
    );
  };

  const getLogClass = (level) => {
    switch (level) {
      case 'ERROR': return 'log-error';
      case 'WARN': return 'log-warn';
      case 'SQL': return 'log-sql';
      case 'PHASE': return 'log-phase';
      case 'TABLE': return 'log-table';
      default: return 'log-info';
    }
  };

  const getStatusIcon = (status) => {
    if (status === '通过') return '✓';
    if (status === '失败') return '✗';
    if (status === '跳过') return '⊘';
    return '!';
  };

  const environmentOptions = ENVIRONMENT_OPTIONS;

  const handleEnvironmentSelect = (env) => {
    setSelectedEnvironment(env);
    if (apiSettings[env]) {
      setApiUrl(apiSettings[env].request_url);
    }
    setShowEnvironmentDropdown(false);
  };

  const handleSettingsClick = () => {
    setShowSettingsDropdown(!showSettingsDropdown);
  };

  const handleApiSettingsClick = () => {
    setShowSettingsDropdown(false);
    setShowApiSettings(true);
  };

  const handleDbSettingsClick = () => {
    setShowSettingsDropdown(false);
    setShowDbSettings(true);
  };

  const handleSystemSettingsClick = async () => {
    setShowSettingsDropdown(false);
    if (window.electronAPI) {
      try {
        const saved = await window.electronAPI.getConfig('systemSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.tables && typeof parsed.tables === 'object') {
            const sanitizedTables = {};
            for (const [tName, tConfig] of Object.entries(parsed.tables)) {
              if (tConfig && typeof tConfig === 'object') {
                sanitizedTables[tName] = {
                  chineseName: tConfig.chineseName || '',
                  primaryKey: tConfig.primaryKey || '',
                  dus: tConfig.dus || 'bdus',
                  ignoreFields: tConfig.ignoreFields || '',
                  conditionFields: Array.isArray(tConfig.conditionFields) ? tConfig.conditionFields : []
                };
              }
            }
            setSystemSettings({ tables: sanitizedTables });
            setDraftSystemSettings({ tables: sanitizedTables });
            setShowSystemSettings(true);
            return;
          }
        }
      } catch (e) {
        console.error('打开系统配置时从数据库同步最新数据失败:', e);
      }
    }
    // 降级：深拷贝当前状态
    setDraftSystemSettings(JSON.parse(JSON.stringify(systemSettings)));
    setShowSystemSettings(true);
  };

  const handleDefaultTableSettingsClick = async () => {
    setShowSettingsDropdown(false);
    if (window.electronAPI) {
      try {
        const saved = await window.electronAPI.getConfig('defaultTableSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.tables && typeof parsed.tables === 'object') {
            const sanitizedTables = {};
            for (const [tName, tConfig] of Object.entries(parsed.tables)) {
              if (tConfig && typeof tConfig === 'object') {
                sanitizedTables[tName] = {
                  chineseName: tConfig.chineseName || '',
                  primaryKey: tConfig.primaryKey || '',
                  dus: tConfig.dus || 'bdus',
                  ignoreFields: tConfig.ignoreFields || '',
                  conditionFields: Array.isArray(tConfig.conditionFields) ? tConfig.conditionFields : []
                };
              }
            }
            setDefaultTableSettings({ tables: sanitizedTables });
            setDraftDefaultTableSettings({ tables: sanitizedTables });
            setShowDefaultTableSettings(true);
            return;
          }
        }
      } catch (e) {
        console.error('打开默认表配置时从数据库同步最新数据失败:', e);
      }
    }
    // 降级：深拷贝当前状态
    setDraftDefaultTableSettings(JSON.parse(JSON.stringify(defaultTableSettings)));
    setShowDefaultTableSettings(true);
  };

  const handleApiSettingChange = (env, field, value) => {
    setApiSettings(prev => ({
      ...prev,
      [env]: {
        ...prev[env],
        [field]: value
      }
    }));
  };

  const handleDbSettingChange = (env, index, field, value) => {
    setDbSettings(prev => {
      const envArray = prev[env] ? [...prev[env]] : [];
      if (envArray[index]) {
        envArray[index] = {
          ...envArray[index],
          [field]: value
        };
      }
      return {
        ...prev,
        [env]: envArray
      };
    });
  };

  const addDataSource = (env) => {
    setDbSettings(prev => {
      const envArray = prev[env] ? [...prev[env]] : [];
      envArray.push({
        dus: 'bdus',
        host: '',
        port: 5432,
        database: '',
        user: '',
        password: ''
      });
      return {
        ...prev,
        [env]: envArray
      };
    });
  };

  const removeDataSource = (env, index) => {
    setDbSettings(prev => {
      const newSettings = { ...prev };
      if (newSettings[env]) {
        newSettings[env] = newSettings[env].filter((_, i) => i !== index);
      }
      return newSettings;
    });
  };

  // 更新系统级数据库配置
  const handleSystemDbConfigChange = (field, value) => {
    setSystemDbConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 测试系统级数据库连接
  const handleTestSystemDbConnection = async (e) => {
    e.preventDefault();

    const { host, port, database, user, password } = systemDbConfig;

    if (!host || !database || !user) {
      alert('错误: 请填写完整的数据库信息');
      return;
    }

    const key = 'system';
    setTestConnectionStatus(prev => ({ ...prev, [key]: 'connecting' }));
    addLog(`开始测试系统级数据库连接: ${host}:${port}/${database}`);

    try {
      if (!window.electronAPI?.querySystemDb) {
        throw new Error('非 Electron 环境，无法测试数据库连接');
      }
      await window.electronAPI.querySystemDb({
        dbConfig: {
          host, port, database, user,
          password: decryptPassword(password || '')
        },
        sql: 'SELECT 1',
        values: []
      });

      setTestConnectionStatus(prev => ({ ...prev, [key]: 'success' }));
      addLog('系统级数据库连接测试成功', 'INFO');
    } catch (error) {
      setTestConnectionStatus(prev => ({ ...prev, [key]: 'error' }));
      addLog(`系统级数据库连接测试失败: ${error.message}`, 'ERROR');
    }

    setTimeout(() => {
      setTestConnectionStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[key];
        return newStatus;
      });
    }, 3000);
  };

  const handleSaveApiSettings = () => {
    if (window.electronAPI) window.electronAPI.setConfig('apiSettings', JSON.stringify(apiSettings));
    setShowApiSettings(false);
    addLog('API设置保存成功');
  };

  const handleSaveDbSettings = () => {
    if (window.electronAPI) {
      window.electronAPI.setConfig('dbSettings', JSON.stringify(dbSettings));
      window.electronAPI.setConfig('systemDbConfig', JSON.stringify(systemDbConfig));
    }
    setShowDbSettings(false);
    addLog('数据库设置保存成功');
  };

  const handleSaveSystemSettings = () => {
    // 将草稿提交为真实 state
    const committed = draftSystemSettings || systemSettings;
    setSystemSettings(committed);
    if (window.electronAPI) window.electronAPI.setConfig('systemSettings', JSON.stringify(committed));
    if (electronAPI) {
      try {
        electronAPI.saveTableSettings(committed.tables)
          .catch(e => console.warn('[renderer] save-table-settings failed:', e));
      } catch (e) {
        console.warn('[renderer] ipc not available:', e);
      }
    }
    setDraftSystemSettings(null);
    setShowSystemSettings(false);
    addLog('系统配置保存成功');
  };

  const handleCancelSystemSettings = () => {
    setDraftSystemSettings(null);
    setShowSystemSettings(false);
  };

  const handleSaveDefaultTableSettings = () => {
    // 将草稿提交为真实 state
    const committed = draftDefaultTableSettings || defaultTableSettings;
    setDefaultTableSettings(committed);
    if (window.electronAPI) window.electronAPI.setConfig('defaultTableSettings', JSON.stringify(committed));
    if (electronAPI) {
      try {
        const mergedTables = { ...committed.tables, ...systemSettings.tables };
        electronAPI.saveTableSettings(mergedTables)
          .catch(e => console.warn('[renderer] save-table-settings failed:', e));
      } catch (e) {
        console.warn('[renderer] ipc not available:', e);
      }
    }
    setDraftDefaultTableSettings(null);
    setShowDefaultTableSettings(false);
    addLog('默认表配置保存成功');
  };

  const handleCancelDefaultTableSettings = () => {
    setDraftDefaultTableSettings(null);
    setShowDefaultTableSettings(false);
  };


  /** 导出当前全部配置为 TOML 文件 */
  const handleExportSettings = async () => {
    try {
      const tomlContent = serializeToToml(systemSettings, defaultTableSettings, apiSettings, dbSettings, systemDbConfig);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      const filename = `autotest_config_${stamp}.toml`;

      if (electronAPI) {
        // Electron 环境：通过主进程弹出原生保存对话框
        const result = await electronAPI.saveFile({ content: tomlContent, filename });
        if (result.success) {
          addLog(`配置已导出: ${result.filePath}`);
        } else if (!result.cancelled) {
          addLog(`导出失败: ${result.error}`, 'ERROR');
          alert(`导出失败: ${result.error}`);
        }
      } else {
        // 浏览器环境 fallback
        const blob = new Blob([tomlContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog(`配置已导出: ${filename}`);
      }
    } catch (err) {
      addLog(`导出失败: ${err.message}`, 'ERROR');
      alert(`导出失败: ${err.message}`);
    }
  };

  /** 触发文件选择对话框（导入） */
  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  /** 读取并解析导入的 TOML 文件，更新各 state */
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 重置 file input，下次可重复选同一文件
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== 'string') {
        alert('读取文件失败，请重试');
        return;
      }
      const parsed = parseToml(text);
      if (!parsed) {
        alert('配置文件解析失败，请检查 TOML 格式是否正确');
        return;
      }
      const { newApiSettings, newDbSettings, newSystemDbConfig, newSystemSettings, newDefaultTableSettings } = parsed;

      setApiSettings(newApiSettings);
      setDbSettings(newDbSettings);
      setSystemDbConfig(newSystemDbConfig);
      setSystemSettings(newSystemSettings);
      if (newDefaultTableSettings) setDefaultTableSettings(newDefaultTableSettings);

      // 同步更新已打开状态下的配置草稿，防止弹窗不刷新以及保存时覆盖新导入的数据
      if (draftSystemSettings) {
        setDraftSystemSettings(JSON.parse(JSON.stringify(newSystemSettings)));
      }
      if (draftDefaultTableSettings && newDefaultTableSettings) {
        setDraftDefaultTableSettings(JSON.parse(JSON.stringify(newDefaultTableSettings)));
      }

      // 持久化
      if (window.electronAPI) {
        window.electronAPI.setConfig('apiSettings', JSON.stringify(newApiSettings));
        window.electronAPI.setConfig('dbSettings', JSON.stringify(newDbSettings));
        window.electronAPI.setConfig('systemDbConfig', JSON.stringify(newSystemDbConfig));
        window.electronAPI.setConfig('systemSettings', JSON.stringify(newSystemSettings));
        if (newDefaultTableSettings) window.electronAPI.setConfig('defaultTableSettings', JSON.stringify(newDefaultTableSettings));
      }

      // 同步给主进程
      if (electronAPI) {
        try {
          const mergedTables = { ...(newDefaultTableSettings?.tables || {}), ...newSystemSettings.tables };
          electronAPI.saveTableSettings(mergedTables)
            .catch(err2 => console.warn('[renderer] import sync failed:', err2));
        } catch (err2) {
          console.warn('[renderer] ipc not available:', err2);
        }
      }

      addLog(`配置导入成功: ${file.name}`);
      alert(`✅ 配置导入成功！\n已更新: API设置、数据库配置、系统表配置、默认表配置`);
    };
    reader.onerror = () => alert('读取文件出错，请重试');
    reader.readAsText(file, 'utf-8');
  };

  const handleTestConnection = async (env, index, e) => {
    e.preventDefault();

    const dataSource = dbSettings[env]?.[index];
    if (!dataSource) {
      alert('错误: 数据源不存在');
      return;
    }

    const { host, port, database, user, password } = dataSource;

    if (!host || !database || !user) {
      alert('错误: 请填写完整的数据库信息');
      return;
    }

    const key = `${env}-${index}`;
    setTestConnectionStatus(prev => ({ ...prev, [key]: 'connecting' }));
    addLog(`开始测试数据库连接: ${host}:${port}/${database}`);

    try {
      if (!window.electronAPI?.querySystemDb) {
        throw new Error('非 Electron 环境，无法测试数据库连接');
      }
      await window.electronAPI.querySystemDb({
        dbConfig: {
          host, port, database, user,
          password: decryptPassword(password || '')
        },
        sql: 'SELECT 1',
        values: []
      });

      setTestConnectionStatus(prev => ({ ...prev, [key]: 'success' }));
      addLog('数据库连接测试成功', 'INFO');
    } catch (error) {
      setTestConnectionStatus(prev => ({ ...prev, [key]: 'error' }));
      addLog(`数据库连接测试失败: ${error.message}`, 'ERROR');
    }

    setTimeout(() => {
      setTestConnectionStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[key];
        return newStatus;
      });
    }, 3000);
  };

  // 处理点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (envDropdownRef.current && !envDropdownRef.current.contains(event.target)) {
        setShowEnvironmentDropdown(false);
      }
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(event.target)) {
        setShowSettingsDropdown(false);
      }
    };

    // 添加点击事件监听器
    document.addEventListener('mousedown', handleClickOutside);
    
    // 清理函数
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 主题切换 effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    if (window.electronAPI) window.electronAPI.setConfig('themeMode', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // parseJmxFile 已移至 src/utils/jmxParser.js

  /** 文件选择后处理 */
  const handleJmxFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // 允许重复选择同一文件
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const requests = parseJmxFile(ev.target.result);
        if (requests.length === 0) {
          alert('未找到含有请求体的 HTTP 请求，请确认 JMX 中展开了「Post Body Data」');
          return;
        }
        if (requests.length === 1) {
          // 单个直接填充
          handleJmxRequestSelect(requests[0]);
        } else {
          // 多个弹出选择器
          setJmxRequests(requests);
          setShowJmxPicker(true);
        }
      } catch (err) {
        alert(`JMX 解析失败：${err.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // cleanJmxBody 已移至 src/utils/jmxParser.js

  /** 选择报文后填充请求区 */
  const handleJmxRequestSelect = (req) => {
    const cleaned = cleanJmxBody(req.body);
    setRequestBody(cleaned);
    setShowJmxPicker(false);
    addLog(`已导入 JMX 报文：${req.testname}`);
  };


  // 从本地数据库加载所有配置
  useEffect(() => {
    async function loadAllSettings() {
      if (!window.electronAPI) return;
      
      try {
        const savedAuthApiBaseUrl = await window.electronAPI.getConfig('authApiBaseUrl');
        if (savedAuthApiBaseUrl) setAuthApiBaseUrl(savedAuthApiBaseUrl);

        const savedThemeMode = await window.electronAPI.getConfig('themeMode');
        if (savedThemeMode !== null) setIsDarkMode(savedThemeMode === 'dark');

        const savedApiSettings = await window.electronAPI.getConfig('apiSettings');
        if (savedApiSettings) {
          try {
            startTransition(() => {
              setApiSettings(JSON.parse(savedApiSettings));
            });
          } catch (e) { console.error('加载API设置失败:', e); }
        }

        const savedDbSettings = await window.electronAPI.getConfig('dbSettings');
        if (savedDbSettings) {
          try {
            const parsed = JSON.parse(savedDbSettings);
            // 解密本地存储中的密码（兼容旧数据或直接保存的密文）
            for (const env of Object.keys(parsed)) {
              if (Array.isArray(parsed[env])) {
                parsed[env] = parsed[env].map(ds => ({
                  ...ds,
                  password: decryptPassword(ds.password || '')
                }));
              }
            }
            startTransition(() => { setDbSettings(parsed); });
          } catch (e) { console.error('加载数据库设置失败:', e); }
        }

        const savedSystemDbConfig = await window.electronAPI.getConfig('systemDbConfig');
        if (savedSystemDbConfig) {
          try {
            const parsed = JSON.parse(savedSystemDbConfig);
            parsed.password = decryptPassword(parsed.password || '');
            startTransition(() => { setSystemDbConfig(parsed); });
          } catch (e) { console.error('加载系统级数据库配置失败:', e); }
        }

        const savedSystemSettings = await window.electronAPI.getConfig('systemSettings');
        if (savedSystemSettings) {
          try {
            const parsed = JSON.parse(savedSystemSettings);
            if (parsed && parsed.tables && typeof parsed.tables === 'object') {
              const sanitizedTables = {};
              for (const [tName, tConfig] of Object.entries(parsed.tables)) {
                if (tConfig && typeof tConfig === 'object') {
                  sanitizedTables[tName] = {
                    chineseName: tConfig.chineseName || '',
                    primaryKey: tConfig.primaryKey || '',
                    dus: tConfig.dus || 'bdus',
                    ignoreFields: tConfig.ignoreFields || '',
                    conditionFields: Array.isArray(tConfig.conditionFields) ? tConfig.conditionFields : []
                  };
                }
              }
              startTransition(() => {
                setSystemSettings({ tables: sanitizedTables });
              });
            }
          } catch (e) { console.error('加载系统配置失败:', e); }
        }

        const savedDefaultTableSettings = await window.electronAPI.getConfig('defaultTableSettings');
        if (savedDefaultTableSettings) {
          try {
            const parsed = JSON.parse(savedDefaultTableSettings);
            if (parsed && parsed.tables && typeof parsed.tables === 'object') {
              const sanitizedTables = {};
              for (const [tName, tConfig] of Object.entries(parsed.tables)) {
                if (tConfig && typeof tConfig === 'object') {
                  sanitizedTables[tName] = {
                    chineseName: tConfig.chineseName || '',
                    primaryKey: tConfig.primaryKey || '',
                    dus: tConfig.dus || 'bdus',
                    ignoreFields: tConfig.ignoreFields || '',
                    conditionFields: Array.isArray(tConfig.conditionFields) ? tConfig.conditionFields : []
                  };
                }
              }
              startTransition(() => {
                setDefaultTableSettings({ tables: sanitizedTables });
              });
            }
          } catch (e) { console.error('加载默认表配置失败:', e); }
        }
      } catch (err) {
        console.error('加载本地数据库配置失败:', err);
      }
    }
    loadAllSettings();
  }, []);

  // 监听 SQLite 数据库配置的外部或全局变更，保持页面配置实时刷新
  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.onConfigChanged) return;
    const unsubscribe = window.electronAPI.onConfigChanged(({ key, value }) => {
      try {
        // 纯字符串类型的配置项，直接使用不需 JSON.parse
        if (key === 'authApiBaseUrl') {
          setAuthApiBaseUrl(value);
          return;
        }
        if (key === 'themeMode') {
          setIsDarkMode(value === 'dark');
          return;
        }
        const parsedValue = JSON.parse(value);
        if (key === 'apiSettings') {
          setApiSettings(parsedValue);
        } else if (key === 'dbSettings') {
          setDbSettings(parsedValue);
        } else if (key === 'systemDbConfig') {
          setSystemDbConfig(parsedValue);
        } else if (key === 'systemSettings') {
          setSystemSettings(parsedValue);
          if (draftSystemSettings) {
            setDraftSystemSettings(JSON.parse(JSON.stringify(parsedValue)));
          }
        } else if (key === 'defaultTableSettings') {
          setDefaultTableSettings(parsedValue);
          if (draftDefaultTableSettings) {
            setDraftDefaultTableSettings(JSON.parse(JSON.stringify(parsedValue)));
          }
        }
      } catch (e) {
        console.error(`解析推送的配置 [${key}] 失败:`, e);
      }
    });
    return unsubscribe;
  }, [draftSystemSettings, draftDefaultTableSettings]);

  if (!authUser) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        isAuthenticating={isAuthenticating}
        errorMessage={loginError}
        authApiBaseUrl={authApiBaseUrl}
        onAuthApiBaseUrlChange={setAuthApiBaseUrl}
        captchaSrc={captchaSrc}
        captchaUuid={captchaUuid}
        captchaLoading={captchaLoading}
        captchaEnabled={captchaEnabled}
        onRefreshCaptcha={fetchCaptcha}
        captchaCode={loginCaptchaCode}
        onCaptchaCodeChange={setLoginCaptchaCode}
      />
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="traffic-lights" aria-hidden="true">
            <span className="traffic-light traffic-light-close"></span>
            <span className="traffic-light traffic-light-minimize"></span>
            <span className="traffic-light traffic-light-expand"></span>
          </div>
          <div className="header-title-block">
            <span className="header-eyebrow">Data Assertion Console</span>
            <div className="logo">
              <img className="logo-icon" src="/icons/logo.png" alt="logo" />
              <span className="logo-text">自动化交易数据断言</span>
              <span className="header-badge">像检查时间轴一样查看请求前后数据的真实变化</span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="toolbar-cluster">
            <div className="user-chip">
              <span className="user-chip-label">当前用户</span>
              <span className="user-chip-name">{authUser.displayName}</span>
            </div>

            <div className="dropdown-container" ref={envDropdownRef}>
              <button
                className="btn-env"
                onClick={() => setShowEnvironmentDropdown(!showEnvironmentDropdown)}
              >
                <span className="toolbar-keyword">环境</span>
                {selectedEnvironment}
                <span className="dropdown-arrow">▼</span>
              </button>
              {showEnvironmentDropdown && (
                <div className="dropdown-menu">
                  {environmentOptions.map((env) => (
                    <button
                      key={env}
                      className={`dropdown-item ${selectedEnvironment === env ? 'selected' : ''}`}
                      onClick={() => handleEnvironmentSelect(env)}
                    >
                      {env}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className={`btn-theme-toggle ${isDarkMode ? 'mode-dark' : 'mode-light'}`}
              onClick={() => setIsDarkMode(prev => !prev)}
              title={isDarkMode ? '切换到浅色主题' : '切换到深色主题'}
            >
              <span className="theme-icon-wrap">
                <span className="theme-icon theme-icon-sun">☀</span>
                <span className="theme-icon theme-icon-moon">☽</span>
              </span>
            </button>

            <div className="dropdown-container" ref={settingsDropdownRef}>
              <button
                className="btn-settings"
                onClick={handleSettingsClick}
                title="打开设置"
              >
                ⚙
              </button>
              {showSettingsDropdown && (
                <div className="dropdown-menu">
                  <button className="dropdown-item" onClick={handleSystemSettingsClick}>系统设置</button>
                  <button className="dropdown-item" onClick={handleDefaultTableSettingsClick}>默认表配置</button>
                  <button className="dropdown-item" onClick={handleDbSettingsClick}>数据库配置</button>
                  <button className="dropdown-item" onClick={handleApiSettingsClick}>API设置</button>
                  <button className="dropdown-item" onClick={() => { setShowAboutModal(true); setShowSettingsDropdown(false); }}>关于</button>
                </div>
              )}
            </div>

            <button className="btn-logout" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <aside className="sidebar">
          <div className="sidebar-body">
            <section className="sidebar-overview">
              <div className="sidebar-glance-strip">
                {sidebarMetrics.map((item) => (
                  <div key={item.label} className="sidebar-glance-pill" title={item.detail}>
                    <span className="sidebar-glance-label">{item.label}</span>
                    <strong className="sidebar-glance-value">{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="card card-grow request-editor-card">
              <div className="card-header">
                <span className="card-icon">📋</span>
                <span className="card-title">请求报文</span>
                <button
                  className="btn-jmx-import"
                  onClick={() => jmxFileRef.current?.click()}
                  title="从 JMeter JMX 脚本导入报文"
                >
                  <span className="btn-jmx-icon">⇣</span>
                  Jmeter
                </button>
                <input
                  ref={jmxFileRef}
                  type="file"
                  accept=".jmx,application/xml,text/xml"
                  style={{ display: 'none' }}
                  onChange={handleJmxFileSelect}
                />
              </div>
              <div className="card-body card-body-grow">
                <textarea
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  placeholder="输入JSON格式的请求报文"
                  className="textarea code"
                  spellCheck={false}
                />
              </div>
            </section>

            <section className="card table-config-card">
              <div className="card-header">
                <span className="card-icon">🗃</span>
                <span className="card-title">检查表</span>
                <button onClick={addTable} className="btn-icon" title="添加表">+</button>
              </div>
              <div className="card-body">
                {tables.map((table, index) => (
                  <div key={index} className="table-row">
                    <span className="table-index">{index + 1}</span>
                    <input
                      type="text"
                      value={table.name}
                      onChange={(e) => updateTableName(index, e.target.value)}
                      placeholder="表名"
                      className="input table-input"
                    />
                    <button onClick={() => removeTable(index)} className="btn-icon btn-danger" title="移除">×</button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="sidebar-submit-bar">
            <button onClick={sendRequest} className="btn-primary sidebar-submit" disabled={isLoading}>
              {isLoading ? (
                <><span className="spinner"></span> 执行中...</>
              ) : (
                '▶ 执行核对'
              )}
            </button>
          </div>
        </aside>

        <div className="content">
          <section className="workspace-overview">
            <div className="workspace-overview-stats">
              <div className="workspace-stat-card">
                <span className="workspace-stat-label">通过</span>
                <strong className="workspace-stat-value">{resultSummary.pass}</strong>
              </div>
              <div className="workspace-stat-card workspace-stat-card-warning">
                <span className="workspace-stat-label">异常</span>
                <strong className="workspace-stat-value">{resultSummary.fail}</strong>
              </div>
              <div className="workspace-stat-card">
                <span className="workspace-stat-label">跳过</span>
                <strong className="workspace-stat-value">{resultSummary.skip}</strong>
              </div>
            </div>
          </section>

          {error && (
            <div className="alert alert-error">
              <span className="alert-icon">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <div className="tabs">
            <div className="tab-group">
              <button
                className={`tab ${activeTab === 'log' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('log')}
              >
                📜 执行日志
                {logs.length > 0 && <span className="badge">{logs.length}</span>}
              </button>
              {logs.length > 0 && (
                <button
                  className="tab-clear"
                  onClick={() => setLogs([])}
                  title="清空日志"
                >
                  🗑
                </button>
              )}
            </div>
            <button
              className={`tab ${activeTab === 'result' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('result')}
            >
              📊 断言结果
              {results.length > 0 && <span className="badge">{results.length}</span>}
            </button>
            <button
              className={`tab ${activeTab === 'response' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('response')}
            >
              📨 响应报文
            </button>
            <button
              className={`tab ${activeTab === 'assertion' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('assertion')}
            >
              🔮 统一断言 SQL
              {Object.values(assertionSelections).filter(Boolean).length > 0 && (
                <span className="badge" style={{ backgroundColor: '#007aff', color: '#fff' }}>
                  {Object.values(assertionSelections).filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'log' && (
            <div className="panel">
              <div className="log-container" ref={logsRef}>
                {logs.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <div className="empty-text">点击"执行核对"开始检查</div>
                  </div>
                ) : (
                  logs.map((log, index) => {
                    const level = log.level || 'INFO';
                    // 阶段分隔条
                    if (level === 'PHASE') {
                      return (
                        <div key={log.id ?? index} className="log-phase-banner" style={{ '--log-i': Math.min(index, 25) }}>
                          <span className="log-phase-icon">▶</span>
                          <span className="log-phase-text">{log.message}</span>
                        </div>
                      );
                    }
                    // 表名标头
                    if (level === 'TABLE') {
                      return (
                        <div key={log.id ?? index} className="log-table-header" style={{ '--log-i': Math.min(index, 25) }}>
                          <span className="log-table-icon">🗂</span>
                          <span className="log-table-name">{log.message}</span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={log.id ?? index}
                        className={`log-line ${getLogClass(level)}`}
                        style={{ '--log-i': Math.min(index, 25) }}
                      >
                        <span className="log-time">{log.timestamp}</span>
                        <span className={`log-level level-${level.toLowerCase()}`}>{level}</span>
                        <span className="log-msg">{log.message}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'result' && (
            <div className="panel">
              {results.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📊</div>
                  <div className="empty-text">暂无断言结果</div>
                </div>
              ) : (
                <div className="result-list">
                  {results.map((result, index) => (
                    <div key={index} className={`result-card ${result.status === '通过' ? 'result-pass' : result.status === '跳过' ? 'result-skip' : 'result-fail'}`}>
                      <div className="result-top">
                        <div className="result-info">
                          <span className={`status-badge ${result.status === '通过' ? 'badge-pass' : result.status === '跳过' ? 'badge-skip' : 'badge-fail'}`}>
                            {getStatusIcon(result.status)} {result.status}
                          </span>
                          <span className="result-table-name">{result.table}</span>
                        </div>
                        <span className="result-msg">{result.message}</span>
                      </div>
                      <div className="result-sql-section">
                        <div className="sql-block clickable-sql" onClick={() => handleSqlClick(result.table, result.details)} style={{ cursor: 'pointer' }} title="点击查看具体数据对比">
                          <div className="sql-label">执行前 SQL</div>
                          <code className="sql-code">{result.details?.before?.sql || 'N/A'}</code>
                          <div className="sql-count">记录数: {result.details?.before?.count || 0}</div>
                        </div>
                        <div className="sql-arrow">→</div>
                        <div className="sql-block clickable-sql" onClick={() => handleSqlClick(result.table, result.details)} style={{ cursor: 'pointer' }} title="点击查看具体数据对比">
                          <div className="sql-label">执行后 SQL</div>
                          <code className="sql-code">{result.details?.after?.sql || 'N/A'}</code>
                          <div className="sql-count">记录数: {result.details?.after?.count || 0}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'response' && (
            <div className="panel">
              {responseBody ? (
                <pre className="response-pre">{responseBody}</pre>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📨</div>
                  <div className="empty-text">暂无响应报文</div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'assertion' && (
            <div className="panel">
              {Object.values(assertionSelections).filter(Boolean).length === 0 ? (
                <div className="empty-state" style={{ padding: '80px 20px', animation: 'fadeIn 0.3s' }}>
                  <div className="empty-icon" style={{ fontSize: '64px', marginBottom: '24px', opacity: 0.85, filter: 'drop-shadow(0 0 15px rgba(0, 122, 255, 0.45))' }}>🔮</div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
                    暂无勾选的断言列
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '460px', textAlign: 'center', lineHeight: '1.6', marginBottom: '24px' }}>
                    请在 <span style={{ color: 'var(--accent)', fontWeight: 600 }}>📊 断言结果</span> 选项卡中，点击任意数据表 SQL 块打开数据对比明细，勾选想要断言的字段。
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => setActiveTab('result')}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '20px',
                      fontWeight: 600,
                      boxShadow: '0 0 20px rgba(0, 122, 255, 0.3)',
                      transition: 'all 0.2s'
                    }}
                  >
                    前往 📊 断言结果
                  </button>
                </div>
              ) : (
                <div className="assertion-container">
                  {/* 顶部工具栏 */}
                  <div className="assertion-toolbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>已选断言表</span>
                      <span className="badge" style={{ backgroundColor: 'var(--accent)', color: '#0d1117', fontSize: '12px', padding: '2px 8px', fontWeight: 700 }}>
                        {Object.keys(compiledAssertions).length} 张表
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button
                        className="btn-secondary"
                        onClick={handleClearAllAssertions}
                        style={{
                          fontSize: '13px',
                          padding: '0 16px',
                          height: '36px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontWeight: '500',
                          transition: 'all 0.2s',
                          width: 'max-content',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                      >
                        🧹 清空所有勾选
                      </button>
                      <button
                        className="btn-primary"
                        onClick={handleCopyAllAssertions}
                        style={{
                          fontSize: '13px',
                          padding: '0 16px',
                          height: '36px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #007aff, #0056b3)',
                          border: 'none',
                          color: '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontWeight: '600',
                          boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
                          transition: 'all 0.2s',
                          width: 'max-content',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                      >
                        📋 一键复制所有 SQL
                      </button>
                    </div>
                  </div>

                  {/* 滚动卡片列表 */}
                  <div className="assertion-content">
                    {Object.entries(compiledAssertions).map(([tableName, recordGroups]) => {
                      const result = tableResultsMap[tableName];
                      const details = result?.details;
                      
                      // 汇总该表所有的 SQL
                      const tableSqls = Object.entries(recordGroups).map(([recordIdxStr, cols]) => {
                        const recordIdx = parseInt(recordIdxStr, 10);
                        return generatePostgresAssertSql(tableName, details, recordIdx, cols);
                      }).join('\n\n');

                      return (
                        <div key={tableName} className="assertion-card">
                          
                          {/* 卡片头部 */}
                          <div className="assertion-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                {tableName}
                              </span>
                              {details?.after?.sql && (() => {
                                const routed = (() => {
                                  const match = details.after.sql.match(/FROM\s+["`]?([A-Za-z0-9_]+)["`]?/i);
                                  return match ? match[1] : tableName;
                                })();
                                if (routed !== tableName) {
                                  return (
                                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(138, 221, 208, 0.12)', color: 'var(--sql)', border: '1px solid rgba(138, 221, 208, 0.25)', fontWeight: 500 }}>
                                      路由分表: {routed}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            <button
                              className="btn-secondary"
                              onClick={() => handleCopySingleTableAssertion(tableSqls)}
                              style={{
                                fontSize: '12px',
                                padding: '5px 12px',
                                borderRadius: '6px',
                                background: 'rgba(0, 122, 255, 0.08)',
                                border: '1px solid rgba(0, 122, 255, 0.2)',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                            >
                              📄 复制此表 SQL
                            </button>
                          </div>

                          {/* SQL 预览 */}
                          <div className="assertion-code-container">
                            <pre style={{ margin: 0, padding: '16px', fontSize: '13px', fontFamily: 'var(--font-mono)', overflowX: 'auto', backgroundColor: '#090d13', color: '#abb2bf', lineHeight: '1.6' }}>
                              <code style={{ whiteSpace: 'pre' }}>{tableSqls}</code>
                            </pre>
                          </div>

                          {/* 已选字段标签组 */}
                          <div className="assertion-tag-section">
                            <div style={{ width: '100%', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                              已勾选的字段 (点击 × 取消勾选)
                            </div>
                            {Object.entries(recordGroups).flatMap(([recordIdxStr, cols]) => {
                              const recordIdx = parseInt(recordIdxStr, 10);
                              const groupLabel = Object.keys(recordGroups).length > 1 ? `[组${recordIdx+1}] ` : '';
                              return cols.map(col => (
                                <span
                                  key={`${recordIdx}-${col}`}
                                  className="assertion-tag"
                                >
                                  <span style={{ opacity: 0.65, fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{groupLabel}</span>
                                  <span style={{ fontWeight: 600 }}>{col}</span>
                                  <span
                                    className="assertion-tag-remove"
                                    onClick={() => toggleColumnAssertion(tableName, recordIdx, col)}
                                  >
                                    ×
                                  </span>
                                </span>
                              ));
                            })}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* API设置模态框 */}
      {showApiSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>API设置</h3>
              <button 
                className="modal-close" 
                onClick={handleCancelSystemSettings}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {/* 全局路由服务器地址 - 不受环境影响 */}
              <div className="api-setting-card api-setting-card--global">
                <div className="api-setting-header">
                  <h4>🌐 路由服务器地址</h4>
                  <span className="api-setting-badge">全局 · 不受环境影响</span>
                </div>
                <div className="api-setting-body">
                  <div className="api-setting-field">
                    <label>路由查询地址 (route_url)</label>
                    <input
                      type="text"
                      value={apiSettings.route_url || ''}
                      onChange={(e) => setApiSettings(prev => ({ ...prev, route_url: e.target.value }))}
                      className="input"
                      placeholder="输入路由服务器地址，例如 http://route-server/testtool/routeQuery"
                    />
                  </div>
                </div>
              </div>
              <div className="api-settings-grid">
                {environmentOptions.map((env) => (
                  <div key={env} className="api-setting-card">
                    <div className="api-setting-header">
                      <h4>{env}</h4>
                    </div>
                    <div className="api-setting-body">
                      <div className="api-setting-field">
                        <label>请求地址 (request_url)</label>
                        <input
                          type="text"
                          value={apiSettings[env]?.request_url || ''}
                          onChange={(e) => handleApiSettingChange(env, 'request_url', e.target.value)}
                          className="input"
                          placeholder="输入请求地址"
                        />
                      </div>
                      <div className="api-setting-field">
                        <label>MAC地址 (mac_url)</label>
                        <input
                          type="text"
                          value={apiSettings[env]?.mac_url || ''}
                          onChange={(e) => handleApiSettingChange(env, 'mac_url', e.target.value)}
                          className="input"
                          placeholder="输入MAC地址"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => setShowApiSettings(false)}
              >
                取消
              </button>
              <button 
                className="btn-primary" 
                onClick={handleSaveApiSettings}
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 数据库设置模态框 */}
      {showDbSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>数据库配置</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowDbSettings(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="db-settings-container">
                {/* 系统级数据库配置 */}
                <div className="db-setting-section">
                  <div className="db-setting-header">
                    <h4>系统级数据库配置</h4>
                  </div>
                  <div className="db-setting-body">
                    <div className="db-data-source-card">
                      <div className="db-data-source-header">
                        <span>系统数据源</span>
                      </div>
                      <div className="db-data-source-body">
                        <div className="db-setting-field">
                          <label>地址 (host)</label>
                          <input
                            type="text"
                            value={systemDbConfig.host || ''}
                            onChange={(e) => handleSystemDbConfigChange('host', e.target.value)}
                            className="input"
                            placeholder="输入数据库地址"
                          />
                        </div>
                        <div className="db-setting-field">
                          <label>端口 (port)</label>
                          <input
                            type="number"
                            value={systemDbConfig.port || 5432}
                            onChange={(e) => handleSystemDbConfigChange('port', parseInt(e.target.value) || 5432)}
                            className="input"
                            placeholder="输入端口"
                          />
                        </div>
                        <div className="db-setting-field">
                          <label>数据库名称 (database)</label>
                          <input
                            type="text"
                            value={systemDbConfig.database || ''}
                            onChange={(e) => handleSystemDbConfigChange('database', e.target.value)}
                            className="input"
                            placeholder="输入数据库名称"
                          />
                        </div>
                        <div className="db-setting-field">
                          <label>账户 (user)</label>
                          <input
                            type="text"
                            value={systemDbConfig.user || ''}
                            onChange={(e) => handleSystemDbConfigChange('user', e.target.value)}
                            className="input"
                            placeholder="输入账户"
                          />
                        </div>
                        <div className="db-setting-field">
                          <label>密码 (password)</label>
                          <input
                            type="password"
                            value={systemDbConfig.password || ''}
                            onChange={(e) => handleSystemDbConfigChange('password', e.target.value)}
                            className="input"
                            placeholder="输入密码"
                          />
                        </div>
                        <div className="db-setting-field">
                          <button 
                            className={`btn-primary test-connection-btn ${testConnectionStatus['system'] || ''}`}
                            onClick={handleTestSystemDbConnection}
                            disabled={testConnectionStatus['system'] === 'connecting'}
                          >
                            {testConnectionStatus['system'] === 'connecting' && (
                              <>
                                <span className="spinner"></span>
                                连接中...
                              </>
                            )}
                            {testConnectionStatus['system'] === 'success' && (
                              <>
                                ✓ 连接成功
                              </>
                            )}
                            {testConnectionStatus['system'] === 'error' && (
                              <>
                                ✗ 连接失败
                              </>
                            )}
                            {!testConnectionStatus['system'] && (
                              '测试连接'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* 环境级数据库配置 */}
                {environmentOptions.map((env) => (
                  <div key={env} className="db-setting-section">
                    <div className="db-setting-header">
                      <h4>{env}</h4>
                    </div>
                    <div className="db-setting-body">
                      {dbSettings[env] && dbSettings[env].length > 0 ? (
                        <>
                          {dbSettings[env].map((ds, index) => (
                            <div key={index} className="db-data-source-card">
                              <div className="db-data-source-header">
                                <div className="db-data-source-header-left">
                                  <span>数据源 {index + 1}</span>
                                  <select
                                    value={ds.dus || 'bdus'}
                                    onChange={(e) => handleDbSettingChange(env, index, 'dus', e.target.value)}
                                    className="select-dus"
                                    title="选择数据源类型（DUS）"
                                  >
                                    <option value="bdus">bdus</option>
                                    <option value="bto">bto</option>
                                    <option value="cdus">cdus</option>
                                  </select>
                                </div>
                                <button 
                                  className="btn-icon btn-danger"
                                  onClick={() => removeDataSource(env, index)}
                                  title="删除数据源"
                                >
                                  ×
                                </button>
                              </div>
                              <div className="db-data-source-body">
                                <div className="db-setting-field">
                                  <label>地址 (host)</label>
                                  <input
                                    type="text"
                                    value={ds.host || ''}
                                    onChange={(e) => handleDbSettingChange(env, index, 'host', e.target.value)}
                                    className="input"
                                    placeholder="输入数据库地址"
                                  />
                                </div>
                                <div className="db-setting-field">
                                  <label>端口 (port)</label>
                                  <input
                                    type="number"
                                    value={ds.port || 5432}
                                    onChange={(e) => handleDbSettingChange(env, index, 'port', parseInt(e.target.value) || 5432)}
                                    className="input"
                                    placeholder="输入端口"
                                  />
                                </div>
                                <div className="db-setting-field">
                                  <label>数据库名称 (database)</label>
                                  <input
                                    type="text"
                                    value={ds.database || ''}
                                    onChange={(e) => handleDbSettingChange(env, index, 'database', e.target.value)}
                                    className="input"
                                    placeholder="输入数据库名称"
                                  />
                                </div>
                                <div className="db-setting-field">
                                  <label>账户 (user)</label>
                                  <input
                                    type="text"
                                    value={ds.user || ''}
                                    onChange={(e) => handleDbSettingChange(env, index, 'user', e.target.value)}
                                    className="input"
                                    placeholder="输入账户"
                                  />
                                </div>
                                <div className="db-setting-field">
                                  <label>密码 (password)</label>
                                  <input
                                    type="password"
                                    value={ds.password || ''}
                                    onChange={(e) => handleDbSettingChange(env, index, 'password', e.target.value)}
                                    className="input"
                                    placeholder="输入密码"
                                  />
                                </div>
                                <div className="db-setting-field">
                                  <button 
                                    className={`btn-primary test-connection-btn ${testConnectionStatus[`${env}-${index}`] || ''}`}
                                    onClick={(e) => handleTestConnection(env, index, e)}
                                    disabled={testConnectionStatus[`${env}-${index}`] === 'connecting'}
                                  >
                                    {testConnectionStatus[`${env}-${index}`] === 'connecting' && (
                                      <>
                                        <span className="spinner"></span>
                                        连接中...
                                      </>
                                    )}
                                    {testConnectionStatus[`${env}-${index}`] === 'success' && (
                                      <>
                                        ✓ 连接成功
                                      </>
                                    )}
                                    {testConnectionStatus[`${env}-${index}`] === 'error' && (
                                      <>
                                        ✗ 连接失败
                                      </>
                                    )}
                                    {!testConnectionStatus[`${env}-${index}`] && (
                                      '测试连接'
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {/* 添加数据源按钮 */}
                          <button 
                            className="btn-icon add-datasource-btn"
                            onClick={() => addDataSource(env)}
                            title="添加数据源"
                          >
                            + 添加数据源
                          </button>
                        </>
                      ) : (
                        <div className="db-empty-state">
                          <button 
                            className="btn-icon add-datasource-btn"
                            onClick={() => addDataSource(env)}
                            title="添加数据源"
                          >
                            + 添加数据源
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => setShowDbSettings(false)}
              >
                取消
              </button>
              <button 
                className="btn-primary" 
                onClick={handleSaveDbSettings}
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 系统配置模态框 */}
      {showSystemSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>系统配置</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowSystemSettings(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="system-settings-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0 }}>表配置</h4>
                  <input
                    type="text"
                    placeholder="模糊搜索表名或中文名..."
                    value={tableSearchQuery}
                    onChange={(e) => setTableSearchQuery(e.target.value)}
                    className="input search-input"
                    style={{ width: '250px' }}
                  />
                </div>
                <div className="table-configs">
                  {(() => {
                    const allKeys = Object.keys((draftSystemSettings || systemSettings).tables);
                    return Object.entries((draftSystemSettings || systemSettings).tables).filter(([tableName, config]) => {
                      if (!config || typeof config !== 'object') return false;
                      const query = tableSearchQuery.toLowerCase();
                      if (!query) return true;
                      const chineseName = config.chineseName || '';
                      return tableName.toLowerCase().includes(query) || chineseName.toLowerCase().includes(query);
                    }).map(([tableName, config]) => {
                      const indexInAll = allKeys.indexOf(tableName);
                      const isFirst = indexInAll === 0;
                      const isLast = indexInAll === allKeys.length - 1;
                      return (
                        <div key={tableName} className="table-config-card">
                          <div className="table-config-header">
                            <TableNameInput
                          initialName={tableName}
                          onNameChange={(oldName, newName) => {
                            setDraftSystemSettings(prev => {
                              const newSettings = { ...prev };
                              const existing = newSettings.tables[oldName];
                              if (existing) {
                                const updatedTables = {};
                                for (const key of Object.keys(newSettings.tables)) {
                                  if (key === oldName) {
                                    updatedTables[newName] = existing;
                                  } else {
                                    updatedTables[key] = newSettings.tables[key];
                                  }
                                }
                                newSettings.tables = updatedTables;
                              }
                              return newSettings;
                            });
                          }}
                          defaultTables={defaultTableSettings.tables}
                          onSelectSuggestion={(oldName, selectedName, selectedConfig) => {
                            setDraftSystemSettings(prev => {
                              const newSettings = { ...prev };
                              const updatedTables = {};
                              for (const key of Object.keys(newSettings.tables)) {
                                if (key === oldName) {
                                  // 将从默认表规则中匹配到的表规则，做深拷贝放在当前添加表的位置
                                  updatedTables[selectedName] = JSON.parse(JSON.stringify(selectedConfig));
                                } else {
                                  updatedTables[key] = newSettings.tables[key];
                                }
                              }
                              newSettings.tables = updatedTables;
                              return newSettings;
                            });
                          }}
                          className="input table-name-input"
                          placeholder="表名"
                          style={{ flex: 1 }}
                        />
                        <input
                          type="text"
                          value={config.chineseName || ''}
                          onChange={(e) => {
                            setDraftSystemSettings(prev => ({
                              ...prev,
                              tables: {
                                ...prev.tables,
                                [tableName]: {
                                  ...prev.tables[tableName],
                                  chineseName: e.target.value
                                }
                              }
                            }));
                          }}
                          className="input table-chinese-input"
                          placeholder="中文名"
                          style={{ marginLeft: '10px', flex: 1 }}
                        />
                        <div style={{ display: 'flex', gap: '6px', marginLeft: '10px', marginRight: '6px' }}>
                          <button
                            className="btn-icon"
                            onClick={() => moveSystemTable(tableName, 'up')}
                            disabled={isFirst}
                            style={{ 
                              opacity: isFirst ? 0.35 : 1, 
                              cursor: isFirst ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              width: '26px',
                              height: '26px',
                              background: isFirst ? 'rgba(255,255,255,0.03)' : undefined
                            }}
                            title="向上移动此表"
                          >
                            ▲
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => moveSystemTable(tableName, 'down')}
                            disabled={isLast}
                            style={{ 
                              opacity: isLast ? 0.35 : 1, 
                              cursor: isLast ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              width: '26px',
                              height: '26px',
                              background: isLast ? 'rgba(255,255,255,0.03)' : undefined
                            }}
                            title="向下移动此表"
                          >
                            ▼
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => insertSystemTable(tableName)}
                            style={{ 
                              fontSize: '14px',
                              color: '#32cd32',
                              width: '26px',
                              height: '26px',
                              background: 'rgba(50, 205, 50, 0.08)',
                              border: '1px solid rgba(50, 205, 50, 0.15)'
                            }}
                            title="在此表下方插入新表"
                          >
                            ＋
                          </button>
                        </div>
                        <button 
                          className="btn-icon btn-danger"
                          onClick={() => {
                            setDraftSystemSettings(prev => {
                              const newSettings = { ...prev };
                              delete newSettings.tables[tableName];
                              return newSettings;
                            });
                          }}
                          title="删除表"
                        >
                          ×
                        </button>
                      </div>
                      <div className="table-config-body">
                        <div className="table-config-field">
                          <div className="pk-dus-row">
                            <div className="pk-field">
                              <label>主键</label>
                              <input
                                type="text"
                                value={config.primaryKey || ''}
                                onChange={(e) => {
                                  setDraftSystemSettings(prev => ({
                                    ...prev,
                                    tables: {
                                      ...prev.tables,
                                      [tableName]: {
                                        ...prev.tables[tableName],
                                        primaryKey: e.target.value
                                      }
                                    }
                                  }));
                                }}
                                className="input"
                                placeholder="输入主键字段"
                              />
                            </div>
                            <div className="dus-field">
                              <label>DUS</label>
                              <select
                                value={config.dus || 'bdus'}
                                onChange={(e) => {
                                  setDraftSystemSettings(prev => ({
                                    ...prev,
                                    tables: {
                                      ...prev.tables,
                                      [tableName]: {
                                        ...prev.tables[tableName],
                                        dus: e.target.value
                                      }
                                    }
                                  }));
                                }}
                                className="select-dus"
                              >
                                <option value="bdus">bdus</option>
                                <option value="bto">bto</option>
                                <option value="cdus">cdus</option>
                              </select>
                            </div>
                          </div>
                          <div className="pk-dus-row" style={{ marginTop: '10px' }}>
                            <div className="pk-field" style={{ width: '100%' }}>
                              <label>忽略比对字段（逗号分隔）</label>
                              <input
                                type="text"
                                value={config.ignoreFields || ''}
                                onChange={(e) => {
                                  setDraftSystemSettings(prev => ({
                                    ...prev,
                                    tables: {
                                      ...prev.tables,
                                      [tableName]: {
                                        ...prev.tables[tableName],
                                        ignoreFields: e.target.value
                                      }
                                    }
                                  }));
                                }}
                                className="input"
                                placeholder="输入配置字段，忽略SQL前后比对，如: create_time,update_time"
                              />
                            </div>
                          </div>
                        </div>
                        
                        <h6>查询条件</h6>
                        <div className="condition-fields">
                          {config.conditionFields.map((condition, index) => (
                            <div key={index} className="condition-field-card">
                              <div className="condition-field-row">
                                <div className="condition-field-item">
                                  <label>字段名</label>
                                  <input
                                    type="text"
                                    value={condition.field || ''}
                                    onChange={(e) => {
                                      setDraftSystemSettings(prev => ({
                                        ...prev,
                                        tables: {
                                          ...prev.tables,
                                          [tableName]: {
                                            ...prev.tables[tableName],
                                            conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                              i === index ? { ...cond, field: e.target.value } : cond
                                            )
                                          }
                                        }
                                      }));
                                    }}
                                    className="input"
                                    placeholder="输入字段名"
                                  />
                                </div>
                                <div className="condition-field-item">
                                  <label>来源</label>
                                  <select
                                    value={condition.source || 'request'}
                                    onChange={(e) => {
                                      setDraftSystemSettings(prev => ({
                                        ...prev,
                                        tables: {
                                          ...prev.tables,
                                          [tableName]: {
                                            ...prev.tables[tableName],
                                            conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                              i === index ? { ...cond, source: e.target.value } : cond
                                            )
                                          }
                                        }
                                      }));
                                    }}
                                    className="input"
                                  >
                                    <option value="request">请求报文</option>
                                    <option value="response">响应报文</option>
                                    <option value="route">路由结果</option>
                                    <option value="table">其他表</option>
                                    <option value="custom">用户自定义值</option>
                                  </select>
                                </div>
                              </div>
                              {condition.source === 'table' ? (
                                <>
                                  <div className="condition-field-row">
                                    <div className="condition-field-item">
                                      <label>选择表</label>
                                      <select
                                        value={condition.selectedTable || ''}
                                        onChange={(e) => {
                                          setDraftSystemSettings(prev => ({
                                            ...prev,
                                            tables: {
                                              ...prev.tables,
                                              [tableName]: {
                                                ...prev.tables[tableName],
                                                conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                                  i === index ? { ...cond, selectedTable: e.target.value, path: e.target.value ? `${e.target.value}.` : '' } : cond
                                                )
                                              }
                                            }
                                          }));
                                        }}
                                        className="input"
                                      >
                                        <option value="">请选择表</option>
                                        {Object.keys((draftSystemSettings || systemSettings).tables).filter(t => t !== tableName).map(t => (
                                          <option key={t} value={t}>{t}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="condition-field-item">
                                      <label>字段名</label>
                                      <input
                                        type="text"
                                        value={condition.path ? condition.path.split('.')[1] || '' : ''}
                                        onChange={(e) => {
                                          setDraftSystemSettings(prev => ({
                                            ...prev,
                                            tables: {
                                              ...prev.tables,
                                              [tableName]: {
                                                ...prev.tables[tableName],
                                                conditionFields: prev.tables[tableName].conditionFields.map((cond, i) => {
                                                  if (i === index && cond.selectedTable) {
                                                    return { ...cond, path: `${cond.selectedTable}.${e.target.value}` };
                                                  }
                                                  return cond;
                                                })
                                              }
                                            }
                                          }));
                                        }}
                                        className="input"
                                        placeholder="输入字段名"
                                      />
                                    </div>
                                  </div>
                                </>
                              ) : condition.source === 'custom' ? (
                                <div className="condition-field-row">
                                  <div className="condition-field-item full-width">
                                    <label>固定值</label>
                                    <input
                                      type="text"
                                      value={condition.customValue || ''}
                                      onChange={(e) => {
                                        setDraftSystemSettings(prev => ({
                                          ...prev,
                                          tables: {
                                            ...prev.tables,
                                            [tableName]: {
                                              ...prev.tables[tableName],
                                              conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                                i === index ? { ...cond, customValue: e.target.value } : cond
                                              )
                                            }
                                          }
                                        }));
                                      }}
                                      className="input"
                                      placeholder="输入固定值"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="condition-field-row">
                                  <div className="condition-field-item full-width">
                                    <label>路径</label>
                                    <input
                                      type="text"
                                      value={condition.path || ''}
                                      onChange={(e) => {
                                        setDraftSystemSettings(prev => ({
                                          ...prev,
                                          tables: {
                                            ...prev.tables,
                                            [tableName]: {
                                              ...prev.tables[tableName],
                                              conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                                i === index ? { ...cond, path: e.target.value } : cond
                                              )
                                            }
                                          }
                                        }));
                                      }}
                                      className="input"
                                      placeholder="支持JSONPath (如: txBody.list[0].id 或 $.txBody.id)"
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="condition-field-row" style={{ justifyContent: 'space-between' }}>
                                <div className="condition-field-item inline">
                                  <label>必填</label>
                                  <input
                                    type="checkbox"
                                    checked={condition.required || false}
                                    onChange={(e) => {
                                      setDraftSystemSettings(prev => ({
                                        ...prev,
                                        tables: {
                                          ...prev.tables,
                                          [tableName]: {
                                            ...prev.tables[tableName],
                                            conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                              i === index ? { ...cond, required: e.target.checked } : cond
                                            )
                                          }
                                        }
                                      }));
                                    }}
                                  />
                                </div>
                                <button 
                                  className="btn-icon btn-danger"
                                  onClick={() => {
                                    setDraftSystemSettings(prev => ({
                                      ...prev,
                                      tables: {
                                        ...prev.tables,
                                        [tableName]: {
                                          ...prev.tables[tableName],
                                          conditionFields: prev.tables[tableName].conditionFields.filter((_, i) => i !== index)
                                        }
                                      }
                                    }));
                                  }}
                                  title="删除条件"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                          <button 
                            className="btn-icon add-condition-btn"
                            onClick={() => {
                              setDraftSystemSettings(prev => ({
                                ...prev,
                                tables: {
                                  ...prev.tables,
                                  [tableName]: {
                                    ...prev.tables[tableName],
                                    conditionFields: [
                                      ...prev.tables[tableName].conditionFields,
                                      {
                                        field: '',
                                        source: 'request',
                                        path: '',
                                        required: false
                                      }
                                    ]
                                  }
                                }
                              }));
                            }}
                            title="添加条件"
                          >
                            + 添加条件
                          </button>
                        </div>
                      </div>
                    </div>
                  ); }); })()}
                  <button 
                    className="btn-icon add-table-btn"
                    onClick={() => {
                      const newTableName = `new_table_${Date.now()}`;
                      setDraftSystemSettings(prev => ({
                        ...prev,
                        tables: {
                          ...prev.tables,
                          [newTableName]: {
                            chineseName: '',
                            primaryKey: '',
                            conditionFields: []
                          }
                        }
                      }));
                    }}
                    title="添加表"
                  >
                    + 添加表
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <div className="modal-footer-left">
                <button
                  className="btn-config-io btn-export"
                  onClick={handleExportSettings}
                  title="导出全部配置为 TOML 文件"
                >
                  <span className="btn-io-icon">↑</span> 导出配置
                </button>
                <button
                  className="btn-config-io btn-import"
                  onClick={handleImportClick}
                  title="从 TOML 文件导入配置"
                >
                  <span className="btn-io-icon">↓</span> 导入配置
                </button>
              </div>
              <div className="modal-footer-right">
                <button 
                  className="btn-secondary" 
                  onClick={handleCancelSystemSettings}
                >
                  取消
                </button>
                <button 
                  className="btn-primary" 
                  onClick={handleSaveSystemSettings}
                >
                  保存设置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 默认表配置模态框 */}
      {showDefaultTableSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, paddingRight: '20px' }}>
                <h3 style={{ whiteSpace: 'nowrap', margin: 0 }}>默认表配置</h3>
                <div className="modal-subtitle" style={{ fontSize: '12px', color: '#888', lineHeight: '1.4', margin: 0 }}>
                  默认表配置为系统默认的表规则配置，不可修改，若不符合您的要求，请在<strong style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>系统配置</strong>中覆盖相应的表规则，系统会优先使用用户自定义规则
                </div>
              </div>
              <button 
                className="modal-close" 
                onClick={handleCancelDefaultTableSettings}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="system-settings-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ margin: 0 }}>表配置</h4>
                  <input
                    type="text"
                    placeholder="模糊搜索表名或中文名..."
                    value={defaultTableSearchQuery}
                    onChange={(e) => setDefaultTableSearchQuery(e.target.value)}
                    className="input search-input"
                    style={{ width: '250px' }}
                  />
                </div>
                <div className="table-configs">
                  {(() => {
                    const allKeys = Object.keys((draftDefaultTableSettings || defaultTableSettings).tables);
                    return Object.entries((draftDefaultTableSettings || defaultTableSettings).tables).filter(([tableName, config]) => {
                      if (!config || typeof config !== 'object') return false;
                      const query = defaultTableSearchQuery.toLowerCase();
                      if (!query) return true;
                      const chineseName = config.chineseName || '';
                      return tableName.toLowerCase().includes(query) || chineseName.toLowerCase().includes(query);
                    }).map(([tableName, config]) => {
                      const indexInAll = allKeys.indexOf(tableName);
                      const isFirst = indexInAll === 0;
                      const isLast = indexInAll === allKeys.length - 1;
                      return (
                        <div key={tableName} className="table-config-card">
                          <div className="table-config-header">
                            <TableNameInput
                          initialName={tableName}
                          onNameChange={(oldName, newName) => {
                            setDraftDefaultTableSettings(prev => {
                              const newSettings = { ...prev };
                              const existing = newSettings.tables[oldName];
                              if (existing) {
                                const updatedTables = {};
                                for (const key of Object.keys(newSettings.tables)) {
                                  if (key === oldName) {
                                    updatedTables[newName] = existing;
                                  } else {
                                    updatedTables[key] = newSettings.tables[key];
                                  }
                                }
                                newSettings.tables = updatedTables;
                              }
                              return newSettings;
                            });
                          }}
                          className="input table-name-input"
                          placeholder="表名"
                          style={{ flex: 1 }}
                        />
                        <input
                          type="text"
                          value={config.chineseName || ''}
                          onChange={(e) => {
                            setDraftDefaultTableSettings(prev => ({
                              ...prev,
                              tables: {
                                ...prev.tables,
                                [tableName]: {
                                  ...prev.tables[tableName],
                                  chineseName: e.target.value
                                }
                              }
                            }));
                          }}
                          className="input table-chinese-input"
                          placeholder="中文名"
                          style={{ marginLeft: '10px', flex: 1 }}
                        />
                        <div style={{ display: 'flex', gap: '6px', marginLeft: '10px', marginRight: '6px' }}>
                          <button
                            className="btn-icon"
                            onClick={() => moveDefaultTable(tableName, 'up')}
                            disabled={isFirst}
                            style={{ 
                              opacity: isFirst ? 0.35 : 1, 
                              cursor: isFirst ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              width: '26px',
                              height: '26px',
                              background: isFirst ? 'rgba(255,255,255,0.03)' : undefined
                            }}
                            title="向上移动此表"
                          >
                            ▲
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => moveDefaultTable(tableName, 'down')}
                            disabled={isLast}
                            style={{ 
                              opacity: isLast ? 0.35 : 1, 
                              cursor: isLast ? 'not-allowed' : 'pointer',
                              fontSize: '11px',
                              width: '26px',
                              height: '26px',
                              background: isLast ? 'rgba(255,255,255,0.03)' : undefined
                            }}
                            title="向下移动此表"
                          >
                            ▼
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => insertDefaultTable(tableName)}
                            style={{ 
                              fontSize: '14px',
                              color: '#32cd32',
                              width: '26px',
                              height: '26px',
                              background: 'rgba(50, 205, 50, 0.08)',
                              border: '1px solid rgba(50, 205, 50, 0.15)'
                            }}
                            title="在此表下方插入新表"
                          >
                            ＋
                          </button>
                        </div>
                        <button 
                          className="btn-icon btn-danger"
                          onClick={() => {
                            setDraftDefaultTableSettings(prev => {
                              const newSettings = { ...prev };
                              delete newSettings.tables[tableName];
                              return newSettings;
                            });
                          }}
                          title="删除表"
                        >
                          ×
                        </button>
                      </div>
                      <div className="table-config-body">
                        <div className="table-config-field">
                          <div className="pk-dus-row">
                            <div className="pk-field">
                              <label>主键</label>
                              <input
                                type="text"
                                value={config.primaryKey || ''}
                                onChange={(e) => {
                                  setDraftDefaultTableSettings(prev => ({
                                    ...prev,
                                    tables: {
                                      ...prev.tables,
                                      [tableName]: {
                                        ...prev.tables[tableName],
                                        primaryKey: e.target.value
                                      }
                                    }
                                  }));
                                }}
                                className="input"
                                placeholder="输入主键字段"
                              />
                            </div>
                            <div className="dus-field">
                              <label>DUS</label>
                              <select
                                value={config.dus || 'bdus'}
                                onChange={(e) => {
                                  setDraftDefaultTableSettings(prev => ({
                                    ...prev,
                                    tables: {
                                      ...prev.tables,
                                      [tableName]: {
                                        ...prev.tables[tableName],
                                        dus: e.target.value
                                      }
                                    }
                                  }));
                                }}
                                className="select-dus"
                              >
                                <option value="bdus">bdus</option>
                                <option value="bto">bto</option>
                                <option value="cdus">cdus</option>
                              </select>
                            </div>
                          </div>
                          <div className="pk-dus-row" style={{ marginTop: '10px' }}>
                            <div className="pk-field" style={{ width: '100%' }}>
                              <label>忽略比对字段（逗号分隔）</label>
                              <input
                                type="text"
                                value={config.ignoreFields || ''}
                                onChange={(e) => {
                                  setDraftDefaultTableSettings(prev => ({
                                    ...prev,
                                    tables: {
                                      ...prev.tables,
                                      [tableName]: {
                                        ...prev.tables[tableName],
                                        ignoreFields: e.target.value
                                      }
                                    }
                                  }));
                                }}
                                className="input"
                                placeholder="输入配置字段，忽略SQL前后比对，如: create_time,update_time"
                              />
                            </div>
                          </div>
                        </div>
                        
                        <h6>查询条件</h6>
                        <div className="condition-fields">
                          {config.conditionFields.map((condition, index) => (
                            <div key={index} className="condition-field-card">
                              <div className="condition-field-row">
                                <div className="condition-field-item">
                                  <label>字段名</label>
                                  <input
                                    type="text"
                                    value={condition.field || ''}
                                    onChange={(e) => {
                                      setDraftDefaultTableSettings(prev => ({
                                        ...prev,
                                        tables: {
                                          ...prev.tables,
                                          [tableName]: {
                                            ...prev.tables[tableName],
                                            conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                              i === index ? { ...cond, field: e.target.value } : cond
                                            )
                                          }
                                        }
                                      }));
                                    }}
                                    className="input"
                                    placeholder="输入字段名"
                                  />
                                </div>
                                <div className="condition-field-item">
                                  <label>来源</label>
                                  <select
                                    value={condition.source || 'request'}
                                    onChange={(e) => {
                                      setDraftDefaultTableSettings(prev => ({
                                        ...prev,
                                        tables: {
                                          ...prev.tables,
                                          [tableName]: {
                                            ...prev.tables[tableName],
                                            conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                              i === index ? { ...cond, source: e.target.value } : cond
                                            )
                                          }
                                        }
                                      }));
                                    }}
                                    className="input"
                                  >
                                    <option value="request">请求报文</option>
                                    <option value="response">响应报文</option>
                                    <option value="route">路由结果</option>
                                    <option value="table">其他表</option>
                                    <option value="custom">用户自定义值</option>
                                  </select>
                                </div>
                              </div>
                              {condition.source === 'table' ? (
                                <>
                                  <div className="condition-field-row">
                                    <div className="condition-field-item">
                                      <label>选择表</label>
                                      <select
                                        value={condition.selectedTable || ''}
                                        onChange={(e) => {
                                          setDraftDefaultTableSettings(prev => ({
                                            ...prev,
                                            tables: {
                                              ...prev.tables,
                                              [tableName]: {
                                                ...prev.tables[tableName],
                                                conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                                  i === index ? { ...cond, selectedTable: e.target.value, path: e.target.value ? `${e.target.value}.` : '' } : cond
                                                )
                                              }
                                            }
                                          }));
                                        }}
                                        className="input"
                                      >
                                        <option value="">请选择表</option>
                                        {Object.keys((draftDefaultTableSettings || defaultTableSettings).tables).filter(t => t !== tableName).map(t => (
                                          <option key={t} value={t}>{t}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="condition-field-item">
                                      <label>字段名</label>
                                      <input
                                        type="text"
                                        value={condition.path ? condition.path.split('.')[1] || '' : ''}
                                        onChange={(e) => {
                                          setDraftDefaultTableSettings(prev => ({
                                            ...prev,
                                            tables: {
                                              ...prev.tables,
                                              [tableName]: {
                                                ...prev.tables[tableName],
                                                conditionFields: prev.tables[tableName].conditionFields.map((cond, i) => {
                                                  if (i === index && cond.selectedTable) {
                                                    return { ...cond, path: `${cond.selectedTable}.${e.target.value}` };
                                                  }
                                                  return cond;
                                                })
                                              }
                                            }
                                          }));
                                        }}
                                        className="input"
                                        placeholder="输入字段名"
                                      />
                                    </div>
                                  </div>
                                </>
                              ) : condition.source === 'custom' ? (
                                <div className="condition-field-row">
                                  <div className="condition-field-item full-width">
                                    <label>固定值</label>
                                    <input
                                      type="text"
                                      value={condition.customValue || ''}
                                      onChange={(e) => {
                                        setDraftDefaultTableSettings(prev => ({
                                          ...prev,
                                          tables: {
                                            ...prev.tables,
                                            [tableName]: {
                                              ...prev.tables[tableName],
                                              conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                                i === index ? { ...cond, customValue: e.target.value } : cond
                                              )
                                            }
                                          }
                                        }));
                                      }}
                                      className="input"
                                      placeholder="输入固定值"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="condition-field-row">
                                  <div className="condition-field-item full-width">
                                    <label>路径</label>
                                    <input
                                      type="text"
                                      value={condition.path || ''}
                                      onChange={(e) => {
                                        setDraftDefaultTableSettings(prev => ({
                                          ...prev,
                                          tables: {
                                            ...prev.tables,
                                            [tableName]: {
                                              ...prev.tables[tableName],
                                              conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                                i === index ? { ...cond, path: e.target.value } : cond
                                              )
                                            }
                                          }
                                        }));
                                      }}
                                      className="input"
                                      placeholder="支持JSONPath (如: txBody.list[0].id 或 $.txBody.id)"
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="condition-field-row" style={{ justifyContent: 'space-between' }}>
                                <div className="condition-field-item inline">
                                  <label>必填</label>
                                  <input
                                    type="checkbox"
                                    checked={condition.required || false}
                                    onChange={(e) => {
                                      setDraftDefaultTableSettings(prev => ({
                                        ...prev,
                                        tables: {
                                          ...prev.tables,
                                          [tableName]: {
                                            ...prev.tables[tableName],
                                            conditionFields: prev.tables[tableName].conditionFields.map((cond, i) =>
                                              i === index ? { ...cond, required: e.target.checked } : cond
                                            )
                                          }
                                        }
                                      }));
                                    }}
                                  />
                                </div>
                                <button 
                                  className="btn-icon btn-danger"
                                  onClick={() => {
                                    setDraftDefaultTableSettings(prev => ({
                                      ...prev,
                                      tables: {
                                        ...prev.tables,
                                        [tableName]: {
                                          ...prev.tables[tableName],
                                          conditionFields: prev.tables[tableName].conditionFields.filter((_, i) => i !== index)
                                        }
                                      }
                                    }));
                                  }}
                                  title="删除条件"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                          <button 
                            className="btn-icon add-condition-btn"
                            onClick={() => {
                              setDraftDefaultTableSettings(prev => ({
                                ...prev,
                                tables: {
                                  ...prev.tables,
                                  [tableName]: {
                                    ...prev.tables[tableName],
                                    conditionFields: [
                                      ...prev.tables[tableName].conditionFields,
                                      {
                                        field: '',
                                        source: 'request',
                                        path: '',
                                        required: false
                                      }
                                    ]
                                  }
                                }
                              }));
                            }}
                            title="添加条件"
                          >
                            + 添加条件
                          </button>
                        </div>
                      </div>
                    </div>
                  ); }); })()}
                  <button 
                    className="btn-icon add-table-btn"
                    onClick={() => {
                      const newTableName = `new_table_${Date.now()}`;
                      setDraftDefaultTableSettings(prev => ({
                        ...prev,
                        tables: {
                          ...prev.tables,
                          [newTableName]: {
                            chineseName: '',
                            primaryKey: '',
                            conditionFields: []
                          }
                        }
                      }));
                    }}
                    title="添加表"
                  >
                    + 添加表
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <div className="modal-footer-left">
                <button
                  className="btn-config-io btn-export"
                  onClick={handleExportSettings}
                  title="导出全部配置为 TOML 文件"
                >
                  <span className="btn-io-icon">↑</span> 导出配置
                </button>
                <button
                  className="btn-config-io btn-import"
                  onClick={handleImportClick}
                  title="从 TOML 文件导入配置"
                >
                  <span className="btn-io-icon">↓</span> 导入配置
                </button>
              </div>
              <div className="modal-footer-right">
                <button 
                  className="btn-secondary" 
                  onClick={handleCancelDefaultTableSettings}
                >
                  取消
                </button>
                <button 
                  className="btn-primary" 
                  onClick={handleSaveDefaultTableSettings}
                >
                  保存设置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* JMX 多报文选择器 Modal */}
      {showJmxPicker && (
        <div className="modal-overlay" onClick={() => setShowJmxPicker(false)}>
          <div className="modal-content jmx-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-icon">📄</span>
              <span className="modal-title">选择 JMX 报文</span>
              <span className="modal-subtitle">检测到 {jmxRequests.length} 个 HTTP 请求，请选择要导入的报文</span>
              <button className="modal-close" onClick={() => setShowJmxPicker(false)}>×</button>
            </div>
            <div className="jmx-list">
              {jmxRequests.map((req, idx) => (
                <button
                  key={idx}
                  className="jmx-item"
                  onClick={() => handleJmxRequestSelect(req)}
                >
                  <div className="jmx-item-header">
                    <span className={`jmx-method-badge method-${req.method.toLowerCase()}`}>
                      {req.method}
                    </span>
                    <span className="jmx-item-name">{req.testname}</span>
                    <span className="jmx-item-index">#{idx + 1}</span>
                  </div>
                  {req.url && (
                    <div className="jmx-item-url">{req.url}</div>
                  )}
                  <div className="jmx-item-preview">
                    {req.body.slice(0, 120)}{req.body.length > 120 ? '...' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <input
        ref={importFileRef}
        type="file"
        accept=".toml,text/plain"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
      {/* SQL 数据对比模态框 */}
      {showDataModal && (
        <div className="modal-overlay">
          <div className="modal-content sql-data-modal" style={{ maxWidth: '85%', width: '1200px' }}>
            <div className="modal-header">
              <h3>{dataModalContent.title} - 数据对比明细</h3>
              <button className="btn-close" onClick={() => { setShowDataModal(false); setDataModalSearchQuery(''); }}>×</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '10px 20px' }}>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                <div className="sql-statement" style={{ flex: 1, padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
                  <div style={{ color: '#858585', marginBottom: '10px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>执行前 SQL 语句</div>
                  <code style={{ display: 'block', wordBreak: 'break-all', color: '#ce9178', fontFamily: '"Fira Code", "Consolas", monospace', fontSize: '14px', lineHeight: '1.6' }}>{dataModalContent.beforeSql}</code>
                </div>
                <div className="sql-statement" style={{ flex: 1, padding: '16px', backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
                  <div style={{ color: '#858585', marginBottom: '10px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>执行后 SQL 语句</div>
                  <code style={{ display: 'block', wordBreak: 'break-all', color: '#ce9178', fontFamily: '"Fira Code", "Consolas", monospace', fontSize: '14px', lineHeight: '1.6' }}>{dataModalContent.afterSql}</code>
                </div>
              </div>
              
              {dataModalContent.beforeData.length === 0 && dataModalContent.afterData.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-lighter)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', marginBottom: '10px' }}>📭</div>
                  暂无查询数据
                </div>
              ) : (
                renderDataComparisonTable()
              )}
            </div>
            <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', paddingTop: '15px', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn-secondary" onClick={() => { setShowDataModal(false); setDataModalSearchQuery(''); }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 断言 SQL 查看模态框 */}
      {showAssertSqlModal && (
        <div className="modal-overlay" onClick={() => setShowAssertSqlModal(false)}>
          <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📋</span> 断言 SQL
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(assertSqlModalContent)
                      .then(() => triggerToast('SQL 已复制到剪贴板！'))
                      .catch(() => alert('复制失败，请手动复制'));
                  }}
                  style={{
                    fontSize: '12px', padding: '5px 12px', borderRadius: '6px',
                    background: 'rgba(0, 122, 255, 0.08)', border: '1px solid rgba(0, 122, 255, 0.2)',
                    color: 'var(--accent)', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  📋 复制 SQL
                </button>
                <button className="btn-close" onClick={() => setShowAssertSqlModal(false)}>×</button>
              </div>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <pre style={{
                margin: 0, padding: '20px', fontSize: '13px',
                fontFamily: 'var(--font-mono)', overflowX: 'auto',
                backgroundColor: '#090d13', color: '#abb2bf',
                lineHeight: '1.7', borderRadius: '8px',
                border: '1px solid var(--border)',
                whiteSpace: 'pre', wordBreak: 'normal'
              }}>
                <code>{assertSqlModalContent}</code>
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* 关于弹窗 */}
      {showAboutModal && (
        <div className="modal-overlay" onClick={() => setShowAboutModal(false)}>
          <div className="modal-content about-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><span className="modal-icon">ℹ️</span> 关于</h3>
              <button className="btn-close" onClick={() => setShowAboutModal(false)}>×</button>
            </div>
            <div className="modal-body about-body">
              <div className="about-hero">
                <img className="about-logo" src="/icons/logo.png" alt="logo" />
                <h2>自动化交易数据断言</h2>
                <div className="about-version">版本: v1.0.33</div>
                <div className="about-author">By <span>Taylor Zhu</span></div>
              </div>
              <div className="about-desc">
                <p>这是一款为研发与测试团队量身打造的<strong>自动化交易数据一致性断言工具</strong>。</p>
                <p>在传统接口测试中，校验数据落库是否正确往往需要手动连接各套数据库、手写各种复杂的查询 SQL，繁琐且极易出错。本项目致力于将“黑盒测试”透明化，打造一站式闭环数据核对体验。</p>
                <p>只需在发起业务接口调用前后，工具会自动为您解析交易链路中涉及的所有数据表，并智能提取请求或响应报文中的关键业务主键（如客户号、介质号等），无缝进行前置与后置的数据快照对比！</p>
              </div>
              <div className="about-features">
                <h4>✨ 核心能力与架构优势</h4>
                <ul>
                  <li>
                    <strong><span>🔄</span> 智能路由与多库协同</strong>
                    无论是分布式核心的 bdus 路由，还是管理组件的 bto/cdus 路由，系统均能自动解析请求主键，一键直达真实的物理分库分表。
                  </li>
                  <li>
                    <strong><span>🗃️</span> 多环境一键穿透</strong>
                    内置跨环境隔离机制，只需维护一套表配置，即可无缝穿梭不同测试环境的数据库体系，进行深度差异比对。
                  </li>
                  <li>
                    <strong><span>🛡️</span> 双向条件推导引擎</strong>
                    支持提取发送前“请求报文”的关键字段推导 SQL，也支持针对 Insert 场景从回调的“响应报文”中逆向提取自增主键等条件。
                  </li>
                  <li>
                    <strong><span>📝</span> JMeter 压测无缝衔接</strong>
                    支持一键导入 .jmx 自动化脚本，原生剥离 XML 节点内的 JSON Body 数据，完美衔接自测到专业压测的闭环流程。
                  </li>
                  <li>
                    <strong><span>⚡</span> 极致本地性能</strong>
                    采用 Local First 架构，配置基于 SQLite 持久存储。渲染进程与 Node.js 宿主进程分离，多进程并发处理查询。
                  </li>
                  <li>
                    <strong><span>🎯</span> 灵活比对与容错</strong>
                    支持精确到单个字段级别的比对规则配置。可随时配置“忽略比对字段”（如时间戳），精准保障核心业务级一致性断言。
                  </li>
                </ul>
              </div>
              <div className="about-footer-info">
                基于 Electron / React / SQLite / Node.js 构建
              </div>
            </div>
          </div>
        </div>
      )}
      {toast.show && (
        <div
          className="floating-toast"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 122, 255, 0.95)',
            color: '#ffffff',
            padding: '10px 20px',
            borderRadius: '24px',
            boxShadow: '0 8px 24px rgba(0, 122, 255, 0.35), 0 0 1px rgba(0, 122, 255, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: '600',
            backdropFilter: 'blur(8px)'
          }}
        >
          <span style={{ fontSize: '16px' }}>✨</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
