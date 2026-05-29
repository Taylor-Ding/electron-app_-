// ─────────────────────────────────────────────
// utils.mjs — 主进程通用工具函数
// ─────────────────────────────────────────────

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeCheckPayload(requestPayload, cachedTableSettings = {}) {
  let payload = { ...requestPayload };
  if (
    !isPlainObject(payload.tableSettings) ||
    Object.keys(payload.tableSettings).length === 0
  ) {
    if (Object.keys(cachedTableSettings).length > 0) {
      console.log('[main] tableSettings missing in payload, using cached version');
      payload = { ...payload, tableSettings: cachedTableSettings };
    }
  } else {
    // Update the cache (side effect on the passed-in reference)
    Object.assign(cachedTableSettings, payload.tableSettings);
  }
  return payload;
}
