/* 3D打印业务平台 · 性能监控模块
   功能：
   - 请求性能追踪（各阶段耗时）
   - 存储操作耗时统计
   - 内存/CPU 使用监控
   - 慢操作告警
   - 性能指标快照 API */

import os from "node:os";
import { log } from "./logger.mjs";

/* 环形缓冲区：保存最近 N 条记录 */
class RingBuffer {
  constructor(size = 1000) {
    this.size = size;
    this.buffer = [];
    this.index = 0;
  }

  push(entry) {
    if (this.buffer.length < this.size) {
      this.buffer.push(entry);
    } else {
      this.buffer[this.index] = entry;
    }
    this.index = (this.index + 1) % this.size;
  }

  getAll() {
    if (this.buffer.length < this.size) {
      return [...this.buffer];
    }
    return [
      ...this.buffer.slice(this.index),
      ...this.buffer.slice(0, this.index)
    ];
  }

  getRecent(n = 100) {
    const all = this.getAll();
    return all.slice(-n);
  }

  clear() {
    this.buffer = [];
    this.index = 0;
  }
}

/* 性能指标收集器 */
class PerfMonitor {
  constructor() {
    this.requests = new RingBuffer(500);
    this.slowRequests = new RingBuffer(100);
    this.storeOps = new RingBuffer(500);
    this.startMemory = process.memoryUsage();
    this.startTime = Date.now();

    // 聚合统计
    this.stats = {
      requests: { total: 0, success: 0, errors: 0 },
      methods: {},
      paths: {},
      storeOps: { total: 0, reads: 0, writes: 0 },
      errors: []
    };

    // 慢请求阈值（ms）
    this.slowThreshold = Number(process.env.SLOW_REQUEST_THRESHOLD) || 1000;
  }

  /* 记录请求结束 */
  endRequest(reqId, method, path, status, startTime, userId) {
    const duration = Date.now() - startTime;
    const entry = {
      reqId,
      method,
      path,
      status,
      duration,
      userId: userId || null,
      time: new Date().toISOString()
    };

    this.requests.push(entry);
    this.stats.requests.total++;

    if (status >= 200 && status < 400) {
      this.stats.requests.success++;
    } else {
      this.stats.requests.errors++;
    }

    // 方法统计
    this.stats.methods[method] = (this.stats.methods[method] || 0) + 1;

    // 路径统计（前 50 种）
    const pathKey = this._normalizePath(path);
    this.stats.paths[pathKey] = (this.stats.paths[pathKey] || 0) + 1;

    // 慢请求记录
    if (duration > this.slowThreshold) {
      this.slowRequests.push(entry);
      log.warn(`Slow request: ${method} ${path} took ${duration}ms`, { reqId, status, userId });
    }

    return duration;
  }

  /* 规范化路径（去除动态 ID 等）用于统计 */
  _normalizePath(p) {
    return p
      .replace(/\/api\/users\/[^/]+/, "/api/users/:id")
      .replace(/\/api\/[^/]+\/[a-f0-9]{8,}/, "/api/:collection/:id")
      .slice(0, 50);
  }

  /* 记录存储操作 */
  recordStoreOp(col, operation, duration, success = true) {
    this.storeOps.push({
      col,
      operation,
      duration,
      success,
      time: new Date().toISOString()
    });

    this.stats.storeOps.total++;
    if (operation === "get") this.stats.storeOps.reads++;
    if (operation === "set") this.stats.storeOps.writes++;
  }

  /* 记录错误 */
  recordError(type, message, reqId, details) {
    const entry = {
      type,
      message,
      reqId,
      details,
      time: new Date().toISOString()
    };

    // 保留最近 50 个错误
    if (this.stats.errors.length >= 50) {
      this.stats.errors.shift();
    }
    this.stats.errors.push(entry);
  }

  /* 获取当前资源使用情况 */
  getResourceUsage() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    return {
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024), // MB
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024)
      },
      cpu: {
        user: cpu.user,
        system: cpu.system
      },
      uptime: process.uptime(),
      platform: os.platform(),
      nodeVersion: process.version
    };
  }

  /* 获取性能快照 */
  getSnapshot() {
    const resource = this.getResourceUsage();

    // 计算请求成功率
    const total = this.stats.requests.total;
    const successRate = total > 0
      ? ((this.stats.requests.success / total) * 100).toFixed(1) + "%"
      : "N/A";

    // 平均响应时间
    const recentRequests = this.requests.getRecent(100);
    const avgResponseTime = recentRequests.length > 0
      ? Math.round(recentRequests.reduce((a, r) => a + r.duration, 0) / recentRequests.length)
      : 0;

    // 最慢的 10 个请求
    const slowestRequests = [...this.requests.getAll()]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    // 存储操作统计
    const recentStoreOps = this.storeOps.getRecent(200);
    const avgStoreTime = recentStoreOps.length > 0
      ? Math.round(recentStoreOps.reduce((a, op) => a + op.duration, 0) / recentStoreOps.length)
      : 0;

    // 存储操作最慢的 10 个
    const slowestStoreOps = [...recentStoreOps]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    // 热门路径
    const topPaths = Object.entries(this.stats.paths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    return {
      timestamp: new Date().toISOString(),
      uptime: resource.uptime,
      requests: {
        ...this.stats.requests,
        successRate,
        avgResponseTime,
        recentCount: recentRequests.length
      },
      resource,
      storeOps: {
        ...this.stats.storeOps,
        avgTime: avgStoreTime,
        recentCount: recentStoreOps.length
      },
      slowestRequests,
      slowestStoreOps,
      topPaths,
      recentErrors: this.stats.errors.slice(-10),
      slowRequestsCount: this.slowRequests.getAll().length
    };
  }

  /* 重置统计 */
  reset() {
    this.requests.clear();
    this.slowRequests.clear();
    this.storeOps.clear();
    this.stats = {
      requests: { total: 0, success: 0, errors: 0 },
      methods: {},
      paths: {},
      storeOps: { total: 0, reads: 0, writes: 0 },
      errors: []
    };
  }
}

/* 全局实例 */
const perf = new PerfMonitor();

/* 存储操作追踪包装器 */
export function traceStore(col) {
  return {
    start: () => {
      const startTime = Date.now();
      return {
        end: (success = true) => {
          const duration = Date.now() - startTime;
          perf.recordStoreOp(col, "get", duration, success);
          return duration;
        }
      };
    },
    wrap: (operation, fn) => {
      return async (...args) => {
        const startTime = Date.now();
        try {
          const result = await fn(...args);
          perf.recordStoreOp(col, operation, Date.now() - startTime, true);
          return result;
        } catch (e) {
          perf.recordStoreOp(col, operation, Date.now() - startTime, false);
          throw e;
        }
      };
    }
  };
}

export { perf };
