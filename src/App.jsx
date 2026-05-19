import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react';
import axios from 'axios';
import { JSONPath } from 'jsonpath-plus';
import './App.css';
import LoginScreen from './components/LoginScreen.jsx';

const TableNameInput = ({ initialName, onNameChange, placeholder, className, style }) => {
  const [name, setName] = useState(initialName);
  
  useEffect(() => {
    setName(initialName);
  }, [initialName]);
  
  const handleBlur = () => {
    const newName = name.trim();
    if (newName && newName !== initialName) {
      onNameChange(initialName, newName);
    } else {
      setName(initialName);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <input
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
      placeholder={placeholder}
      style={style}
    />
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
  const [showEnvironmentDropdown, setShowEnvironmentDropdown] = useState(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showDbSettings, setShowDbSettings] = useState(false);
  const [showSystemSettings, setShowSystemSettings] = useState(false);
  const [showDefaultTableSettings, setShowDefaultTableSettings] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [defaultTableSearchQuery, setDefaultTableSearchQuery] = useState('');
  const [defaultTableSettings, setDefaultTableSettings] = useState({ tables: {} });
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showJmxPicker, setShowJmxPicker] = useState(false);
  const [jmxRequests, setJmxRequests] = useState([]);
  const logsRef = useRef(null);
  const envDropdownRef = useRef(null);
  const settingsDropdownRef = useRef(null);
  const importFileRef = useRef(null);
  const jmxFileRef = useRef(null);
  // 用于在异步函数中访问最新 state
  const systemDbConfigRef = useRef(null);
  const apiSettingsRef = useRef(null);
  
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

  // API 状态指示器: 'idle' | 'loading' | 'success' | 'error'
  const [apiStatus, setApiStatus] = useState('idle');
  const [apiStatusMsg, setApiStatusMsg] = useState('就绪');
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
    }, 0);
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
      // 登录成功后立即从系统数据库拉取 API 地址配置
      fetchApiSettingsFromDb();
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
    setApiStatus('idle');
    setApiStatusMsg('就绪');
    window.sessionStorage.removeItem('mockAuthUser');
    window.sessionStorage.removeItem('authSession');
    setShowEnvironmentDropdown(false);
    setShowSettingsDropdown(false);
    setShowApiSettings(false);
    setShowDbSettings(false);
    setShowSystemSettings(false);
    setShowDefaultTableSettings(false);
  };

  /** 登录后从系统数据库自动拉取 API 地址配置 */
  const fetchApiSettingsFromDb = async () => {
    const latestDbConfig = systemDbConfigRef.current;
    if (!latestDbConfig?.host) {
      setApiStatus('error');
      setApiStatusMsg('未配置系统数据源，请先在「数据库配置」中添加系统数据源');
      return;
    }
    setApiStatus('loading');
    setApiStatusMsg('正在加载 API 地址...');
    try {
      const sql = 'SELECT tenant_id, gate_address, mac_address FROM tb_ts_request_gate';
      let rows;
      if (electronAPI?.querySystemDb) {
        const result = await electronAPI.querySystemDb({
          dbConfig: latestDbConfig,
          sql,
          values: []
        });
        rows = result.rows;
      } else {
        setApiStatus('error');
        setApiStatusMsg('非 Electron 环境，无法查询数据库');
        return;
      }

      if (!rows || rows.length === 0) {
        setApiStatus('error');
        setApiStatusMsg('获取 API 地址失败：表中无数据，请检查数据库配置');
        return;
      }

      const patch = {};
      for (const row of rows) {
        const env = String(row.tenant_id || '').trim();
        if (!env) continue;
        patch[env] = {
          request_url: row.gate_address || '',
          mac_url: row.mac_address || ''
        };
      }
      const merged = { ...(apiSettingsRef.current || {}), ...patch };
      setApiSettings(merged);
      if (window.electronAPI) window.electronAPI.setConfig('apiSettings', JSON.stringify(merged));

      setApiStatus('success');
      setApiStatusMsg('就绪');
    } catch (err) {
      console.error('[fetchApiSettingsFromDb] error:', err);
      setApiStatus('error');
      setApiStatusMsg(`获取 API 地址失败：${err.message}`);
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
      } catch {
        addLog('请求报文格式错误', 'ERROR');
        throw new Error('请求报文格式错误，请检查JSON格式');
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
            addLog(`[${tableName}] 未配置查询条件，跳过`, 'WARN');
            skippedTables.push(tableName);
            continue;
          }
          {
            const table = { name: tableName };
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
                    } catch (error) {
                      addLog(`[${tableName}] 路由查询失败: ${error.message}`, 'ERROR');
                    }
                  } else {
                    addLog(`[${tableName}] 无法获取介质号，跳过路由查询`, 'ERROR');
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
                addLog(`[${tableName}] 必填字段 ${cond.field} 无法提取`, 'ERROR');
              }
            }
            tableConditions[tableName] = conditions;
            addLog(`[${tableName}] 查询条件就绪: ${JSON.stringify(conditions)}`);
          }
        } catch (condError) {
          addLog(`[${tableName}] 条件提取失败: ${condError.message}`, 'ERROR');
          tableConditions[tableName] = {};
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
              onChange={(e) => setDataModalSearchQuery(e.target.value)}
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
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-lighter)', textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--text-secondary)', width: '20%' }}>字段名称</th>
                  <th style={{ padding: '10px 12px', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-lighter)', textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--text-secondary)', width: '40%' }}>执行前数据</th>
                  <th style={{ padding: '10px 12px', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-lighter)', textAlign: 'left', whiteSpace: 'nowrap', color: 'var(--text-secondary)', width: '40%' }}>执行后数据</th>
                </tr>
              </thead>
              <tbody>
                {tableFieldsToShow.map(field => {
                  const bVal = beforeData[idx] ? beforeData[idx][field] : undefined;
                  const aVal = afterData[idx] ? afterData[idx][field] : undefined;
                  const isIgnored = ignoreFieldsSet.has(field.toLowerCase());
                  const isDiff = !isIgnored && bVal !== aVal;
                  const fmtVal = (v) => v === undefined
                    ? <span style={{ opacity: 0.35 }}>—</span>
                    : v === null
                      ? <span style={{ fontStyle: 'italic', opacity: 0.45 }}>NULL</span>
                      : String(v);
                  return (
                    <tr key={field} style={{
                      borderBottom: isDiff ? '1px solid rgba(255,80,80,0.3)' : '1px solid var(--border-color)',
                      backgroundColor: isDiff ? 'rgba(255,50,50,0.14)' : 'transparent',
                      borderLeft: isDiff ? '4px solid #ff4040' : '4px solid transparent',
                    }}>
                      {/* 字段名 */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: isDiff ? 700 : 500, color: isDiff ? '#ff5555' : 'var(--text-secondary)' }}>
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
                        {isIgnored && bVal !== aVal && (
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
                        opacity: (isIgnored && bVal !== aVal) ? 0.6 : 1
                      }}>
                        {fmtVal(bVal)}
                      </td>
                      {/* 接口后值 — 绿色加粗 */}
                      <td style={{
                        padding: '10px 12px', wordBreak: 'break-all',
                        fontFamily: isDiff ? 'monospace' : 'inherit',
                        fontWeight: isDiff ? 700 : 400,
                        color: isDiff ? '#f5a623' : 'var(--text-secondary)',
                        opacity: (isIgnored && bVal !== aVal) ? 0.6 : 1
                      }}>
                        {isDiff && <span style={{ marginRight: 5, fontSize: 12, opacity: 0.8 }}>→</span>}
                        {fmtVal(aVal)}
                      </td>
                    </tr>
                  );
                })}
                {tableFieldsToShow.length === 0 && (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                      未找到匹配的字段
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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

  const environmentOptions = ['T1', 'T2', 'SITA', 'DEV1', 'TEST', 'DEVS'];

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

  const handleSystemSettingsClick = () => {
    setShowSettingsDropdown(false);
    setShowSystemSettings(true);
  };

  const handleDefaultTableSettingsClick = () => {
    setShowSettingsDropdown(false);
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

    // 设置连接中状态
    setTestConnectionStatus(prev => ({
      ...prev,
      'system': 'connecting'
    }));

    addLog(`开始测试系统级数据库连接: ${host}:${port}/${database}`);
    
    try {
      // 模拟连接测试
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 设置连接成功状态
      setTestConnectionStatus(prev => ({
        ...prev,
        'system': 'success'
      }));
      
      addLog('系统级数据库连接测试成功', 'INFO');
      
      // 3秒后重置状态
      setTimeout(() => {
        setTestConnectionStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus['system'];
          return newStatus;
        });
      }, 3000);
    } catch (error) {
      // 设置连接失败状态
      setTestConnectionStatus(prev => ({
        ...prev,
        'system': 'error'
      }));
      
      addLog(`系统级数据库连接测试失败: ${error.message}`, 'ERROR');
      
      // 3秒后重置状态
      setTimeout(() => {
        setTestConnectionStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus['system'];
          return newStatus;
        });
      }, 3000);
    }
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
    if (window.electronAPI) window.electronAPI.setConfig('systemSettings', JSON.stringify(systemSettings));
    if (electronAPI) {
      try {
        electronAPI.saveTableSettings(systemSettings.tables)
          .catch(e => console.warn('[renderer] save-table-settings failed:', e));
      } catch (e) {
        console.warn('[renderer] ipc not available:', e);
      }
    }
    setShowSystemSettings(false);
    addLog('系统配置保存成功');
  };

  const handleSaveDefaultTableSettings = () => {
    if (window.electronAPI) window.electronAPI.setConfig('defaultTableSettings', JSON.stringify(defaultTableSettings));
    if (electronAPI) {
      try {
        const mergedTables = { ...defaultTableSettings.tables, ...systemSettings.tables };
        electronAPI.saveTableSettings(mergedTables)
          .catch(e => console.warn('[renderer] save-table-settings failed:', e));
      } catch (e) {
        console.warn('[renderer] ipc not available:', e);
      }
    }
    setShowDefaultTableSettings(false);
    addLog('默认表配置保存成功');
  };

  // ===== TOML 序列化/反序列化工具 =====

  const ENC_PREFIX = 'ENC:';

  /**
   * 加密密码字段 → 返回 "ENC:<base64>"
   * Electron 环境下通过 preload 桥接使用 Node.js crypto（AES-128-CBC + 随机 IV）
   * 浏览器环境 fallback：简单 base64 混淆
   */
  const encryptPassword = (plaintext) => {
    if (!plaintext) return plaintext;
    try {
      if (electronAPI?.encryptText) {
        return ENC_PREFIX + electronAPI.encryptText(plaintext);
      }
      // 浏览器失能 fallback：简单 base64
      return ENC_PREFIX + btoa(unescape(encodeURIComponent(plaintext)));
    } catch (e) {
      console.warn('[encrypt] 失败，使用明文输出:', e.message);
      return plaintext;
    }
  };

  /**
   * 解密密码字段
   * - 如果是 "ENC:<base64>" 开头则解密
   * - 否则返回原值（兼容明文）
   */
  const decryptPassword = (value) => {
    if (!value || !String(value).startsWith(ENC_PREFIX)) return value;
    const encoded = String(value).slice(ENC_PREFIX.length);
    try {
      if (electronAPI?.decryptText) {
        return electronAPI.decryptText(encoded);
      }
      // 浏览器 fallback
      return decodeURIComponent(escape(atob(encoded)));
    } catch (e) {
      console.warn('[decrypt] 失败，返回原字符串:', e.message);
      return value; // 如果解密失败，原样返回，可能是用户手动输入的明文
    }
  };

  /**
   * 将配置对象序列化为 TOML 字符串（带注释）
   * 覆盖：systemSettings、apiSettings、dbSettings、systemDbConfig
   */
  const serializeToToml = (sysSettings, defaultTabSettings, apiCfg, dbCfg, sysDbCfg) => {
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
  };

  /**
   * 从 TOML 字符串解析配置（手写解析，覆盖本工具导出的结构）
   * 返回 { apiSettings, dbSettings, systemDbConfig, systemSettings } 或 null（解析失败）
   */
  const parseToml = (text) => {
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
  };

  /** 导出当前全部配置为 TOML 文件 */
  const handleExportSettings = async (isDefault = false) => {
    try {
      const tomlContent = serializeToToml(systemSettings, defaultTableSettings, apiSettings, dbSettings, systemDbConfig);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      const prefix = isDefault === true ? 'autotest_default_config' : 'autotest_config';
      const filename = `${prefix}_${stamp}.toml`;

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

    // 设置连接中状态
    setTestConnectionStatus(prev => ({
      ...prev,
      [`${env}-${index}`]: 'connecting'
    }));

    addLog(`开始测试数据库连接: ${host}:${port}/${database}`);
    
    try {
      // 这里可以使用axios或其他方式测试连接
      // 由于是前端环境，我们可以模拟连接测试
      // 实际项目中可能需要通过后端API来测试
      
      // 模拟连接测试
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 设置连接成功状态
      setTestConnectionStatus(prev => ({
        ...prev,
        [`${env}-${index}`]: 'success'
      }));
      
      addLog('数据库连接测试成功', 'INFO');
      
      // 3秒后重置状态
      setTimeout(() => {
        setTestConnectionStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[`${env}-${index}`];
          return newStatus;
        });
      }, 3000);
    } catch (error) {
      // 设置连接失败状态
      setTestConnectionStatus(prev => ({
        ...prev,
        [`${env}-${index}`]: 'error'
      }));
      
      addLog(`数据库连接测试失败: ${error.message}`, 'ERROR');
      
      // 3秒后重置状态
      setTimeout(() => {
        setTestConnectionStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[`${env}-${index}`];
          return newStatus;
        });
      }, 3000);
    }
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

  // ===== JMX 导入功能 =====

  /**
   * 解析 JMeter .jmx 文件（XML），提取所有 HTTP 请求的报文
   * 支持 postBodyRaw=true 的 JSON 请求体
   */
  const parseJmxFile = (xmlText) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error('文件不是有效的 XML/JMX 格式');

    const samplers = Array.from(doc.querySelectorAll('HTTPSamplerProxy'));
    if (samplers.length === 0) throw new Error('文件中未找到 HTTP 请求样本，请检查 JMX 文件');

    return samplers.map((sampler, idx) => {
      const getProp = (name, tag = 'stringProp') => {
        const el = sampler.querySelector(`${tag}[name="${name}"]`);
        return el ? el.textContent.trim() : '';
      };

      const testname = sampler.getAttribute('testname') || `请求 ${idx + 1}`;
      const protocol  = getProp('HTTPSampler.protocol') || 'http';
      const domain    = getProp('HTTPSampler.domain');
      const port      = getProp('HTTPSampler.port');
      const path      = getProp('HTTPSampler.path');
      const method    = getProp('HTTPSampler.method') || 'POST';
      const isRawBody = getProp('HTTPSampler.postBodyRaw', 'boolProp') === 'true';

      let body = '';
      if (isRawBody) {
        // Raw body 存放在 Arguments.arguments 下的第一个 elementProp 的 Argument.value 中
        const argValue = sampler.querySelector(
          'collectionProp[name="Arguments.arguments"] > elementProp > stringProp[name="Argument.value"]'
        );
        // 提取后先做基础清洗：去 BOM、统一换行、去首尾空白
        const raw = argValue ? argValue.textContent : '';
        body = raw
          .replace(/^\uFEFF/, '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .trim();
      } else {
        // 键对形式的参数，尝试拼成 JSON
        const params = {};
        const argItems = sampler.querySelectorAll(
          'collectionProp[name="Arguments.arguments"] > elementProp'
        );
        argItems.forEach(item => {
          const nameEl  = item.querySelector('stringProp[name="Argument.name"]');
          const valueEl = item.querySelector('stringProp[name="Argument.value"]');
          if (nameEl && valueEl && nameEl.textContent.trim()) {
            params[nameEl.textContent.trim()] = valueEl.textContent.trim();
          }
        });
        if (Object.keys(params).length > 0) {
          try { body = JSON.stringify(params, null, 2); } catch { body = ''; }
        }
      }

      // 拼接 URL
      let url = '';
      if (domain) {
        const portPart = (port && port !== '80' && port !== '443') ? `:${port}` : '';
        url = `${protocol}://${domain}${portPart}${path}`;
      }

      return { testname, url, method, body };
    }).filter(r => r.body); // 过滤掉没有报文的请求
  };

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

  /** 选择报文后填充请求区 */
  /** 清洗并格式化 JMX 提取到的 body 文本 */
  const cleanJmxBody = (raw) => {
    if (!raw) return '';
    let s = String(raw);
    
    // 1. 去除 BOM 和统一换行
    s = s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s = s.trim();

    // 2. 尝试容错处理：去除导致 JSON.parse 失败的常见数组/对象末尾逗号
    const fixedForJson = s.replace(/,\s*([}\]])/g, '$1');

    try {
      // 3. 优先尝试标准 JSON 格式化（能完美解决同一属性换行的问题）
      return JSON.stringify(JSON.parse(fixedForJson), null, 2);
    } catch {
      // 4. 解析失败（存在 JMeter 变量等）：使用降级的伪 JSON 格式化器
      const lines = s.split('\n')
        .map(l => l.trim()) // 强制去除首尾空白（避免隐藏空白符导致空行存留）
        .filter(l => l !== ''); // 彻底干掉空行
        
      let indentLevel = 0;
      const formatted = [];
      
      for (const line of lines) {
        // 如果这行以关闭括号开头，先减少缩进
        if (line.match(/^[}\]]/)) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
        
        formatted.push('  '.repeat(indentLevel) + line);
        
        // 计算行内大括号、方括号带来的缩进变化
        const openCount = (line.match(/[{[]/g) || []).length;
        const closeCount = (line.match(/[}\]]/g) || []).length;
        indentLevel += (openCount - closeCount);
        indentLevel = Math.max(0, indentLevel);
      }
      
      return formatted.join('\n');
    }
  };

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
            startTransition(() => {
              setDbSettings(JSON.parse(savedDbSettings));
            });
          } catch (e) { console.error('加载数据库设置失败:', e); }
        }

        const savedSystemDbConfig = await window.electronAPI.getConfig('systemDbConfig');
        if (savedSystemDbConfig) {
          try {
            startTransition(() => {
              setSystemDbConfig(JSON.parse(savedSystemDbConfig));
            });
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

  // 保持 ref 与最新 state 同步（供异步函数使用）
  useEffect(() => { systemDbConfigRef.current = systemDbConfig; }, [systemDbConfig]);
  useEffect(() => { apiSettingsRef.current = apiSettings; }, [apiSettings]);

  // 应用启动时若已有登录态（sessionStorage 中有 authSession），自动加载 API 地址
  useEffect(() => {
    if (authUser && apiStatus === 'idle') {
      // 延迟一帧，确保 systemDbConfigRef 已同步
      const t = setTimeout(() => { fetchApiSettingsFromDb(); }, 200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

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
                onClick={() => setShowApiSettings(false)}
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
                  {Object.entries(systemSettings.tables).filter(([tableName, config]) => {
                    if (!config || typeof config !== 'object') return false;
                    const query = tableSearchQuery.toLowerCase();
                    if (!query) return true;
                    const chineseName = config.chineseName || '';
                    return tableName.toLowerCase().includes(query) || chineseName.toLowerCase().includes(query);
                  }).map(([tableName, config]) => (
                    <div key={tableName} className="table-config-card">
                      <div className="table-config-header">
                        <TableNameInput
                          initialName={tableName}
                          onNameChange={(oldName, newName) => {
                            setSystemSettings(prev => {
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
                            setSystemSettings(prev => ({
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
                        <button 
                          className="btn-icon btn-danger"
                          onClick={() => {
                            setSystemSettings(prev => {
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
                                  setSystemSettings(prev => ({
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
                                  setSystemSettings(prev => ({
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
                                  setSystemSettings(prev => ({
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
                                      setSystemSettings(prev => {
                                        const newSettings = { ...prev };
                                        newSettings.tables[tableName].conditionFields[index].field = e.target.value;
                                        return newSettings;
                                      });
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
                                      setSystemSettings(prev => {
                                        const newSettings = { ...prev };
                                        newSettings.tables[tableName].conditionFields[index].source = e.target.value;
                                        return newSettings;
                                      });
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
                                          setSystemSettings(prev => {
                                            const newSettings = { ...prev };
                                            newSettings.tables[tableName].conditionFields[index].selectedTable = e.target.value;
                                            newSettings.tables[tableName].conditionFields[index].path = e.target.value ? `${e.target.value}.` : '';
                                            return newSettings;
                                          });
                                        }}
                                        className="input"
                                      >
                                        <option value="">请选择表</option>
                                        {Object.keys(systemSettings.tables).filter(t => t !== tableName).map(t => (
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
                                          setSystemSettings(prev => {
                                            const newSettings = { ...prev };
                                            if (condition.selectedTable) {
                                              newSettings.tables[tableName].conditionFields[index].path = `${condition.selectedTable}.${e.target.value}`;
                                            }
                                            return newSettings;
                                          });
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
                                        setSystemSettings(prev => {
                                          const newSettings = { ...prev };
                                          newSettings.tables[tableName].conditionFields[index].customValue = e.target.value;
                                          return newSettings;
                                        });
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
                                        setSystemSettings(prev => {
                                          const newSettings = { ...prev };
                                          newSettings.tables[tableName].conditionFields[index].path = e.target.value;
                                          return newSettings;
                                        });
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
                                      setSystemSettings(prev => {
                                        const newSettings = { ...prev };
                                        newSettings.tables[tableName].conditionFields[index].required = e.target.checked;
                                        return newSettings;
                                      });
                                    }}
                                  />
                                </div>
                                <button 
                                  className="btn-icon btn-danger"
                                  onClick={() => {
                                    setSystemSettings(prev => {
                                      const newSettings = { ...prev };
                                      newSettings.tables[tableName].conditionFields = newSettings.tables[tableName].conditionFields.filter((_, i) => i !== index);
                                      return newSettings;
                                    });
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
                              setSystemSettings(prev => {
                                const newSettings = { ...prev };
                                newSettings.tables[tableName].conditionFields.push({
                                  field: '',
                                  source: 'request',
                                  path: '',
                                  required: false
                                });
                                return newSettings;
                              });
                            }}
                            title="添加条件"
                          >
                            + 添加条件
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    className="btn-icon add-table-btn"
                    onClick={() => {
                      const newTableName = `new_table_${Date.now()}`;
                      setSystemSettings(prev => ({
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
                  onClick={() => handleExportSettings(false)}
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
                  onClick={() => setShowSystemSettings(false)}
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
                onClick={() => setShowDefaultTableSettings(false)}
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
                  {Object.entries(defaultTableSettings.tables).filter(([tableName, config]) => {
                    if (!config || typeof config !== 'object') return false;
                    const query = defaultTableSearchQuery.toLowerCase();
                    if (!query) return true;
                    const chineseName = config.chineseName || '';
                    return tableName.toLowerCase().includes(query) || chineseName.toLowerCase().includes(query);
                  }).map(([tableName, config]) => (
                    <div key={tableName} className="table-config-card">
                      <div className="table-config-header">
                        <TableNameInput
                          initialName={tableName}
                          onNameChange={(oldName, newName) => {
                            setDefaultTableSettings(prev => {
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
                            setDefaultTableSettings(prev => ({
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
                        <button 
                          className="btn-icon btn-danger"
                          onClick={() => {
                            setDefaultTableSettings(prev => {
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
                                  setDefaultTableSettings(prev => ({
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
                                  setDefaultTableSettings(prev => ({
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
                                  setDefaultTableSettings(prev => ({
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
                                      setDefaultTableSettings(prev => {
                                        const newSettings = { ...prev };
                                        newSettings.tables[tableName].conditionFields[index].field = e.target.value;
                                        return newSettings;
                                      });
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
                                      setDefaultTableSettings(prev => {
                                        const newSettings = { ...prev };
                                        newSettings.tables[tableName].conditionFields[index].source = e.target.value;
                                        return newSettings;
                                      });
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
                                          setDefaultTableSettings(prev => {
                                            const newSettings = { ...prev };
                                            newSettings.tables[tableName].conditionFields[index].selectedTable = e.target.value;
                                            newSettings.tables[tableName].conditionFields[index].path = e.target.value ? `${e.target.value}.` : '';
                                            return newSettings;
                                          });
                                        }}
                                        className="input"
                                      >
                                        <option value="">请选择表</option>
                                        {Object.keys(defaultTableSettings.tables).filter(t => t !== tableName).map(t => (
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
                                          setDefaultTableSettings(prev => {
                                            const newSettings = { ...prev };
                                            if (condition.selectedTable) {
                                              newSettings.tables[tableName].conditionFields[index].path = `${condition.selectedTable}.${e.target.value}`;
                                            }
                                            return newSettings;
                                          });
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
                                        setDefaultTableSettings(prev => {
                                          const newSettings = { ...prev };
                                          newSettings.tables[tableName].conditionFields[index].customValue = e.target.value;
                                          return newSettings;
                                        });
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
                                        setDefaultTableSettings(prev => {
                                          const newSettings = { ...prev };
                                          newSettings.tables[tableName].conditionFields[index].path = e.target.value;
                                          return newSettings;
                                        });
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
                                      setDefaultTableSettings(prev => {
                                        const newSettings = { ...prev };
                                        newSettings.tables[tableName].conditionFields[index].required = e.target.checked;
                                        return newSettings;
                                      });
                                    }}
                                  />
                                </div>
                                <button 
                                  className="btn-icon btn-danger"
                                  onClick={() => {
                                    setDefaultTableSettings(prev => {
                                      const newSettings = { ...prev };
                                      newSettings.tables[tableName].conditionFields = newSettings.tables[tableName].conditionFields.filter((_, i) => i !== index);
                                      return newSettings;
                                    });
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
                              setDefaultTableSettings(prev => {
                                const newSettings = { ...prev };
                                newSettings.tables[tableName].conditionFields.push({
                                  field: '',
                                  source: 'request',
                                  path: '',
                                  required: false
                                });
                                return newSettings;
                              });
                            }}
                            title="添加条件"
                          >
                            + 添加条件
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    className="btn-icon add-table-btn"
                    onClick={() => {
                      const newTableName = `new_table_${Date.now()}`;
                      setDefaultTableSettings(prev => ({
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
                  onClick={() => handleExportSettings(true)}
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
                  onClick={() => setShowDefaultTableSettings(false)}
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
                <div className="about-version">版本: v1.0.31</div>
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
    </div>
  );
}

export default App;
