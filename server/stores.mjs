/* 3D打印业务平台 存储适配器：file（Node/Docker/NAS）· kv（Cloudflare Workers）· upstash（Vercel 可选）· memory（兜底）
   优化：内存缓存 · 原子写入 · 批量操作 · 写合并防抖 */
import fs from "node:fs";
import { existsSync, mkdirSync } from "node:fs";

/* ---------- 内存缓存层（TTL + LRU） ---------- */
class CacheEntry {
  constructor(value, ttl = 0) {
    this.value = value;
    this.expires = ttl > 0 ? Date.now() + ttl : 0;
    this.hits = 0;
  }

  isExpired() {
    return this.expires > 0 && Date.now() > this.expires;
  }
}

class LRUCache {
  constructor(maxSize = 100, defaultTtl = 30000) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.isExpired()) {
      this.cache.delete(key);
      return null;
    }
    entry.hits++;
    return entry.value;
  }

  set(key, value, ttl) {
    if (this.cache.size >= this.maxSize) {
      // 删除最少使用的条目
      let minHits = Infinity;
      let minKey = null;
      for (const [k, v] of this.cache) {
        if (v.hits < minHits) {
          minHits = v.hits;
          minKey = k;
        }
      }
      if (minKey !== null) this.cache.delete(minKey);
    }
    this.cache.set(key, new CacheEntry(value, ttl ?? this.defaultTtl));
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    let hits = 0, expired = 0;
    for (const entry of this.cache.values()) {
      hits += entry.hits;
      if (entry.isExpired()) expired++;
    }
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalHits: hits,
      expired
    };
  }
}

/* ---------- 文件存储优化版 ---------- */
export function fileStore(dir, opts = {}) {
  const cache = new LRUCache(opts.cacheSize || 100, opts.cacheTtl || 30000);
  const pendingWrites = new Map(); // 写合并队列
  const writeQueue = new Map();    // 待写入集合
  const flushInterval = opts.flushInterval || 100; // 批量写入间隔 ms
  let flushTimer = null;

  const path = col => dir + "/" + col + ".json";

  // 延迟批量写入
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flushAll();
    }, flushInterval);
  };

  const flushAll = async () => {
    if (writeQueue.size === 0) return;
    const pending = new Map(writeQueue);
    writeQueue.clear();

    for (const [col, val] of pending) {
      try {
        mkdirSync(dir, { recursive: true });
        const tmp = path(col) + ".tmp";
        const data = JSON.stringify(val, null, 2);
        fs.writeFileSync(tmp, data, "utf8");
        fs.renameSync(tmp, path(col));
      } catch (e) {
        // 写入失败，保留到下一轮
        writeQueue.set(col, val);
      }
    }
  };

  return {
    async get(col) {
      // 优先从缓存取
      const cached = cache.get(col);
      if (cached !== null) return cached;

      try {
        const data = existsSync(path(col))
          ? JSON.parse(fs.readFileSync(path(col), "utf8"))
          : null;
        cache.set(col, data);
        return data;
      } catch (e) {
        return null;
      }
    },

    async set(col, val) {
      // 立即更新缓存
      cache.set(col, val);

      // 加入批量写队列（合并同一集合的多次写入）
      writeQueue.set(col, val);
      scheduleFlush();
    },

    // 强制刷新（等待所有待写入完成）
    async flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flushAll();
    },

    // 清除单个集合缓存
    invalidate(col) {
      cache.delete(col);
    },

    // 清除所有缓存
    clearCache() {
      cache.clear();
    },

    // 获取缓存状态
    getCacheStats() {
      return cache.getStats();
    },

    // 关闭前刷新
    async close() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flushAll();
    }
  };
}

/* ---------- 带 TTL 的文件存储（适合频繁读取少量变化的场景） ---------- */
export function fileStoreWithTTL(dir, opts = {}) {
  const store = fileStore(dir, opts);
  const ttl = opts.ttl || 5000; // 默认 5 秒 TTL

  const origGet = store.get.bind(store);
  store.get = async function(col) {
    const cached = cache.get(col);
    if (cached !== null) return cached;
    const val = await origGet(col);
    if (val !== null) cache.set(col, val);
    return val;
  };

  // 热数据缓存（更短的 TTL）
  const hotCache = new LRUCache(20, ttl);

  return {
    ...store,
    get: async (col) => {
      // 热数据优先
      const hot = hotCache.get(col);
      if (hot !== null) return hot;

      const val = await origGet(col);
      if (val !== null) {
        hotCache.set(col, val);
      }
      return val;
    },
    set: async (col, val) => {
      hotCache.delete(col);
      return store.set(col, val);
    }
  };
}

/* ---------- Cloudflare Workers KV（原始版 + 性能包装） ---------- */
export function kvStore(ns) {
  if (!ns) return null;

  const cache = new LRUCache(100, 10000); // 10s TTL

  return {
    async get(col) {
      const cached = cache.get(col);
      if (cached !== null) return cached;

      try {
        const v = await ns.get("col:" + col);
        const val = v == null ? null : JSON.parse(v);
        if (val !== null) cache.set(col, val);
        return val;
      } catch (e) {
        return null;
      }
    },

    async set(col, val) {
      cache.set(col, val);
      await ns.put("col:" + col, JSON.stringify(val));
    }
  };
}

/* ---------- Upstash Redis REST 优化版 ---------- */
export function upstashStore(env) {
  const url = env && env.UPSTASH_REDIS_REST_URL;
  const token = env && env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const cache = new LRUCache(100, 5000); // 5s TTL
  let pendingWrites = new Map();
  let flushTimer = null;
  const FLUSH_INTERVAL = 50; // 50ms 批量写入

  const call = async (cmd, body, skipCache = false) => {
    const r = await fetch(url + "/" + cmd.join("/"), {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "text/plain"
      },
      body: body == null ? "" : body
    });
    if (!r.ok) throw new Error("upstash " + r.status);
    const j = await r.json();
    return j.result;
  };

  const flushPending = async () => {
    if (pendingWrites.size === 0) return;
    const pending = new Map(pendingWrites);
    pendingWrites.clear();

    for (const [col, val] of pending) {
      try {
        await call(["set", "pf:" + col], JSON.stringify(val));
      } catch (e) {
        // 写失败，保留到下一轮
        pendingWrites.set(col, val);
      }
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flushPending();
    }, FLUSH_INTERVAL);
  };

  return {
    async get(col) {
      const cached = cache.get(col);
      if (cached !== null) return cached;

      try {
        const v = await call(["get", "pf:" + col]);
        const val = v == null ? null : JSON.parse(v);
        if (val !== null) cache.set(col, val);
        return val;
      } catch (e) {
        return null;
      }
    },

    async set(col, val) {
      cache.set(col, val);
      pendingWrites.set(col, val);
      scheduleFlush();
    },

    async flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flushPending();
    },

    clearCache() {
      cache.clear();
    },

    getCacheStats() {
      return cache.getStats();
    }
  };
}

/* ---------- 内存兜底（进程生命周期内有效） ---------- */
export function memoryStore() {
  const mem = {};
  const cache = new LRUCache(200, 60000); // 1min TTL

  return {
    async get(col) {
      const cached = cache.get(col);
      if (cached !== null) return cached;

      const val = col in mem ? mem[col] : null;
      if (val !== null) cache.set(col, val);
      return val;
    },

    async set(col, val) {
      mem[col] = val;
      cache.set(col, val);
    }
  };
}

/* ---------- 多存储组合：优先高速，后备持久 ---------- */
export function compositeStore(primary, fallback) {
  return {
    async get(col) {
      try {
        const val = await primary.get(col);
        if (val !== null) return val;
      } catch (e) {}

      // 降级到后备存储
      if (fallback) {
        try {
          const val = await fallback.get(col);
          // 回填主存储
          if (val !== null) await primary.set(col, val).catch(() => {});
          return val;
        } catch (e) {}
      }
      return null;
    },

    async set(col, val) {
      // 同时写入主存储和后备存储
      await Promise.all([
        primary.set(col, val).catch(e => console.error("Primary store write failed:", e)),
        fallback ? fallback.set(col, val).catch(e => console.error("Fallback store write failed:", e)) : Promise.resolve()
      ]);
    },

    async flush() {
      if (primary.flush) await primary.flush();
    },

    async close() {
      if (primary.close) await primary.close();
      if (fallback?.close) await fallback.close();
    }
  };
}
