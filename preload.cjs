const { contextBridge, ipcRenderer } = require('electron');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { Buffer } = require('node:buffer');

const CIPHER_KEY = 'AutoTest-CfgKey!';
const keyBuffer = Buffer.from(CIPHER_KEY, 'utf8');

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
  encryptText(plaintext) {
    if (!plaintext) return plaintext;
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-128-cbc', keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64');
  },
  decryptText(encoded) {
    if (!encoded) return encoded;
    const combined = Buffer.from(encoded, 'base64');
    const iv = combined.subarray(0, 16);
    const ciphertext = combined.subarray(16);
    const decipher = createDecipheriv('aes-128-cbc', keyBuffer, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
