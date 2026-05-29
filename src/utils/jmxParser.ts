// utils/jmxParser.js — JMeter JMX 文件解析工具

/**
 * 解析 JMeter .jmx 文件（XML），提取所有 HTTP 请求的报文
 * 支持 postBodyRaw=true 的 JSON 请求体
 */
export function parseJmxFile(xmlText) {
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
}

/**
 * 清洗并格式化 JMX 提取到的 body 文本
 */
export function cleanJmxBody(raw) {
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
}
