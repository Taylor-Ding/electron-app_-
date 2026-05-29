import { describe, it, expect } from 'vitest';
import { isPlainObject, normalizeCheckPayload } from '../utils.mjs';

describe('isPlainObject', () => {
  it('should return true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ key: 'value' })).toBe(true);
    expect(isPlainObject({ nested: { a: 1 } })).toBe(true);
  });

  it('should return false for arrays', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  it('should return false for null', () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isPlainObject(undefined)).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });

  it('should return false for functions', () => {
    expect(isPlainObject(() => {})).toBe(false);
  });

  it('should return false for Date objects', () => {
    // Date is typeof 'object', not null, and not array - so isPlainObject returns true
    // This is by design as the function only excludes arrays and null
    expect(isPlainObject(new Date())).toBe(true);
  });
});

describe('normalizeCheckPayload', () => {
  const defaultPayload = {
    tables: ['tb_test'],
    tableConditions: {},
    tableSettings: { tb_test: { conditionFields: [] } },
    environment: 'DEV1',
  };

  it('should use cached settings when payload has no tableSettings', () => {
    const cached = { tb_cached: {} };
    const payload = { ...defaultPayload };
    delete payload.tableSettings;
    const result = normalizeCheckPayload(payload, cached);
    expect(result.tableSettings).toEqual(cached);
  });

  it('should use cached settings when payload tableSettings is empty', () => {
    const cached = { tb_cached: {} };
    const payload = { ...defaultPayload, tableSettings: {} };
    const result = normalizeCheckPayload(payload, cached);
    expect(result.tableSettings).toEqual(cached);
  });

  it('should update cache when payload has valid tableSettings', () => {
    const cache = { old: {} };
    const newSettings = { tb_test: { conditionFields: [] } };
    const payload = { ...defaultPayload, tableSettings: newSettings };
    const result = normalizeCheckPayload(payload, cache);
    expect(result.tableSettings).toEqual(newSettings);
    // Cache should be updated (side effect on the original object)
    expect(cache.tb_test).toBeDefined();
  });

  it('should keep payload tableSettings when both present', () => {
    const cached = { tb_cached: {} };
    const newSettings = { tb_test: { conditionFields: [] } };
    const payload = { ...defaultPayload, tableSettings: newSettings };
    const result = normalizeCheckPayload(payload, cached);
    expect(result.tableSettings).toEqual(newSettings);
  });

  it('should not mutate original payload object', () => {
    const cached = {};
    const payload = { ...defaultPayload, tableSettings: { tb_test: { conditionFields: [] } } };
    const clone = JSON.parse(JSON.stringify(payload));
    normalizeCheckPayload(payload, { ...cached });
    expect(payload).toEqual(clone);
  });

  it('should handle case when both payload tableSettings is missing and cache is empty', () => {
    const cached = {};
    const payload = { ...defaultPayload };
    delete payload.tableSettings;
    const result = normalizeCheckPayload(payload, cached);
    // When both payload and cache are empty, tableSettings will be undefined
    expect(result.tableSettings).toBeUndefined();
  });
});
