const { contextBridge, ipcRenderer, safeStorage } = require('electron');
const { createCipheriv, createDecipheriv, randomBytes, createHash } = require('node:crypto');
const { Buffer } = require('node:buffer');

const OLD_KEY = 'AutoTest-CfgKey!';
const OLD_KEY_BUFFER = Buffer.from(OLD_KEY, 'utf8').subarray(0, 16);

/**
 * 从 safeStorage 派生 16 字节密钥（hardware-bound + app-specific）
 * 如果 safeStorage 不可用，则 fallback 到基于 hostname 的确定性密钥
 */
function deriveKeyBuffer() {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const testStr = 'autotest_solo_v1.0_key_v2';
      const encrypted = safeStorage.encryptString(testStr);
      return createHash('sha256').update(encrypted).digest().subarray(0, 16);
    }
  } catch (e) {
    console.warn('[preload] safeStorage key derivation failed, using fallback:', e.message);
  }
  // Fallback: 基于 hostname 的确定性密钥（不如 safeStorage 安全，但比硬编码好）
  const { hostname } = require('node:os');
  return createHash('sha256').update(`${hostname}_autotest_solo_v2`).digest().subarray(0, 16);
}

let _keyBuffer = null;
function getKeyBuffer() {
  if (!_keyBuffer) {
    _keyBuffer = deriveKeyBuffer();
  }
  return _keyBuffer;
}

function encryptText(plaintext) {
  if (!plaintext) return plaintext;
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-128-cbc', getKeyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

function decryptText(encoded) {
  if (!encoded) return encoded;
  let combined;
  try {
    combined = Buffer.from(encoded, 'base64');
  } catch {
    return encoded;
  }
  if (combined.length < 16) return encoded;
  const iv = combined.subarray(0, 16);
  const ciphertext = combined.subarray(16);

  // 尝试新密钥解密
  try {
    const decipher = createDecipheriv('aes-128-cbc', getKeyBuffer(), iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // 新密钥失败，尝试旧密钥（向后兼容迁移）
    try {
      const decipher = createDecipheriv('aes-128-cbc', OLD_KEY_BUFFER, iv);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      return encoded;
    }
  }
}

const electronAPI = {
  saveTableSettings(tableSettings) {
    return ipcRenderer.invoke('save-table-settings', tableSettings);
  },
  runBeforeCheck(requestPayload) {
    return ipcRenderer.invoke('run-before-check', requestPayload);
  },
  runAfterCheck(requestPayload) {
    return ipcRenderer.invoke('run-after-check', requestPayload);
  },
  querySystemDb(payload) {
    return ipcRenderer.invoke('query-system-db', payload);
  },
  saveFile(payload) {
    return ipcRenderer.invoke('save-file', payload);
  },
  getConfig(key) {
    return ipcRenderer.invoke('get-config', key);
  },
  setConfig(key, value) {
    return ipcRenderer.invoke('set-config', key, value);
  },
  onConfigChanged(callback) {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('config-changed', subscription);
    return () => ipcRenderer.removeListener('config-changed', subscription);
  },
  encryptText,
  decryptText
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
