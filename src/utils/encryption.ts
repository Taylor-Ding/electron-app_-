// utils/encryption.js — 密码加密/解密
import { ENC_PREFIX } from '../config/constants.js';

/**
 * 获取 electronAPI（兼容渲染进程环境）
 */
function getElectronAPI() {
  return window.electronAPI;
}

/**
 * 加密密码字段 → 返回 "ENC:<base64>"
 * Electron 环境下通过 preload 桥接使用 Node.js crypto（AES-128-CBC + 随机 IV）
 * 浏览器环境 fallback：简单 base64 混淆
 */
export function encryptPassword(plaintext) {
  if (!plaintext) return plaintext;
  try {
    const api = getElectronAPI();
    if (api?.encryptText) {
      return ENC_PREFIX + api.encryptText(plaintext);
    }
    // 浏览器失能 fallback：简单 base64
    return ENC_PREFIX + btoa(unescape(encodeURIComponent(plaintext)));
  } catch (e) {
    console.warn('[encrypt] 失败，使用明文输出:', e.message);
    return plaintext;
  }
}

/**
 * 解密密码字段
 * - 如果是 "ENC:<base64>" 开头则解密
 * - 否则返回原值（兼容明文）
 */
export function decryptPassword(value) {
  if (!value || !String(value).startsWith(ENC_PREFIX)) return value;
  const encoded = String(value).slice(ENC_PREFIX.length);
  try {
    const api = getElectronAPI();
    if (api?.decryptText) {
      const result = api.decryptText(encoded);
      // 如果 decryptText 返回原值，说明数据不是 AES 加密的（可能是浏览器 fallback 生成），
      // 回退到 base64 解码
      if (result !== encoded) {
        return result;
      }
    }
    // 浏览器 fallback：简单 base64 解码
    return decodeURIComponent(escape(atob(encoded)));
  } catch (e) {
    console.warn('[decrypt] 失败，返回原字符串:', e.message);
    return value; // 如果解密失败，原样返回，可能是用户手动输入的明文
  }
}
