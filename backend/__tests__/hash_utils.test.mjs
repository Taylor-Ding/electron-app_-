import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { HashUtils, CustNoShardingUtil } from '../hash_utils.mjs';

describe('HashUtils', () => {
  describe('hash32', () => {
    it('should produce known hash for "00001129443560"', () => {
      expect(HashUtils.hash32('00001129443560')).toBe(931337745);
    });

    it('should produce known hash for "6222020200007654321"', () => {
      expect(HashUtils.hash32('6222020200007654321')).toBe(1492799872);
    });

    it('should be deterministic (same input = same output)', () => {
      expect(HashUtils.hash32('hello world')).toBe(HashUtils.hash32('hello world'));
    });

    it('should produce different hashes for different inputs', () => {
      expect(HashUtils.hash32('abc')).not.toBe(HashUtils.hash32('abd'));
    });

    it('should accept Buffer input and produce same result as string', () => {
      const str = 'test_buffer';
      expect(HashUtils.hash32(Buffer.from(str, 'utf8'))).toBe(HashUtils.hash32(str));
    });

    it('should handle empty string', () => {
      expect(() => HashUtils.hash32('')).not.toThrow();
      expect(typeof HashUtils.hash32('')).toBe('number');
    });

    it('should handle single character', () => {
      expect(typeof HashUtils.hash32('a')).toBe('number');
    });

    it('should throw for invalid input types', () => {
      expect(() => HashUtils.hash32(123)).toThrow(TypeError);
      expect(() => HashUtils.hash32(null)).toThrow(TypeError);
      expect(() => HashUtils.hash32(undefined)).toThrow(TypeError);
    });
  });

  describe('DEFAULT_SEED', () => {
    it('should be 104729', () => {
      expect(HashUtils.DEFAULT_SEED).toBe(104729);
    });
  });
});

describe('CustNoShardingUtil', () => {
  describe('calculate_hash', () => {
    it('should return shard between 1 and 8 for default', () => {
      for (const cust_no of ['00001129443560', '6222020200007654321', '1234567890']) {
        const result = CustNoShardingUtil.calculate_hash(cust_no);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(8);
      }
    });

    it('should return shard between 1 and 16 for total=16', () => {
      for (const cust_no of ['00001129443560', '6222020200007654321']) {
        const result = CustNoShardingUtil.calculate_hash(cust_no, 16);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(16);
      }
    });

    it('should return known shard for "00001129443560" with 8 shards', () => {
      expect(CustNoShardingUtil.calculate_hash('00001129443560', 8)).toBe(2);
    });

    it('should return known shard for "6222020200007654321" with 8 shards', () => {
      expect(CustNoShardingUtil.calculate_hash('6222020200007654321', 8)).toBe(1);
    });

    it('should be deterministic', () => {
      const a = CustNoShardingUtil.calculate_hash('test123', 8);
      const b = CustNoShardingUtil.calculate_hash('test123', 8);
      expect(a).toBe(b);
    });

    it('should handle negative hash values correctly', () => {
      // Generate multiple hash values and verify all results are in valid range
      for (let i = 0; i < 100; i++) {
        const custNo = `cust_${i}_${Date.now()}`;
        const result = CustNoShardingUtil.calculate_hash(custNo, 8);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(8);
      }
    });
  });
});
