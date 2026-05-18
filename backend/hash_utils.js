export class HashUtils {
    static C1_32 = -862048943;
    static C2_32 = 461845907;
    static R1_32 = 15;
    static R2_32 = 13;
    static M_32 = 5;
    static N_32 = -430675100;
    static DEFAULT_SEED = 104729;

    static hash32(data) {
        let buffer;
        if (typeof data === 'string') {
            buffer = Buffer.from(data, 'utf8');
        } else if (Buffer.isBuffer(data)) {
            buffer = data;
        } else {
            throw new TypeError("data must be string or Buffer");
        }
        return HashUtils._hash32(buffer, 0, buffer.length, HashUtils.DEFAULT_SEED);
    }

    static _hash32(data, offset, length, seed) {
        let hash_val = seed | 0;
        const nblocks = length >> 2;
        let idx = 0;

        for (idx = 0; idx < nblocks; idx++) {
            const i = idx << 2;
            let k = (data[offset + i] & 0xFF) |
                    ((data[offset + i + 1] & 0xFF) << 8) |
                    ((data[offset + i + 2] & 0xFF) << 16) |
                    ((data[offset + i + 3] & 0xFF) << 24);
            hash_val = HashUtils._mix32(k, hash_val);
        }

        idx = nblocks << 2;
        let k1 = 0;

        if (length - idx === 3) {
            k1 ^= (data[offset + idx + 2] << 16);
            k1 ^= (data[offset + idx + 1] << 8);
            hash_val = HashUtils._get_hash(data, offset, hash_val, idx, k1);
        } else if (length - idx === 2) {
            k1 ^= (data[offset + idx + 1] << 8);
            hash_val = HashUtils._get_hash(data, offset, hash_val, idx, k1);
        } else if (length - idx === 1) {
            hash_val = HashUtils._get_hash(data, offset, hash_val, idx, k1);
        }

        return HashUtils._fmix32(length, hash_val);
    }

    static _get_hash(data, offset, hash_val, idx, k1) {
        k1 ^= data[offset + idx];
        k1 = Math.imul(k1, HashUtils.C1_32);
        k1 = HashUtils._rotate_left(k1, HashUtils.R1_32);
        k1 = Math.imul(k1, HashUtils.C2_32);
        hash_val ^= k1;
        return hash_val | 0;
    }

    static _mix32(k, hash_val) {
        k = Math.imul(k, HashUtils.C1_32);
        k = HashUtils._rotate_left(k, HashUtils.R1_32);
        k = Math.imul(k, HashUtils.C2_32);
        hash_val ^= k;
        let result = Math.imul(HashUtils._rotate_left(hash_val, HashUtils.R2_32), HashUtils.M_32) + HashUtils.N_32;
        return result | 0;
    }

    static _fmix32(length, hash_val) {
        hash_val ^= length;
        hash_val ^= (hash_val >>> 16); 
        hash_val = Math.imul(hash_val, -2048144789);
        hash_val ^= (hash_val >>> 13);
        hash_val = Math.imul(hash_val, -1028477387);
        hash_val ^= (hash_val >>> 16);
        return hash_val | 0;
    }

    static _rotate_left(x, n) {
        return (x << n) | (x >>> (32 - n));
    }
}

export class CustNoShardingUtil {
    static calculate_hash(cust_no, total_sharding_table_number = 8) {
        let hash_key = HashUtils.hash32(cust_no);
        if (hash_key < 0) {
            hash_key = Math.abs(hash_key);
        }
        return (hash_key % total_sharding_table_number) + 1;
    }
}
