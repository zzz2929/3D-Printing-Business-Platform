/* 3D打印业务平台 · 日志模块
   分级日志：DEBUG / INFO / WARN / ERROR / FATAL
   输出：控制台（彩色）+ 文件（JSON Lines 格式，支持日志轮转）
   支持环境变量：LOG_LEVEL（默认 INFO）、LOG_DIR（默认 ./logs）、LOG_MAX_FILES（默认 7）、LOG_MAX_SIZE（默认 10MB）
   API：log.debug/info/warn/error(msg, data?) / log.child({ reqId, userId }) / log.middleware() */

import fs from "node:fs";
import path from "node:path";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = path.resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, "logs");
const LOG_LEVEL = process.env.LOG_LEVEL || "INFO";
const LOG_MAX_FILES = Number(process.env.LOG_MAX_FILES) || 7;
const LOG_MAX_SIZE = Number(process.env.LOG_MAX_SIZE) || 10 * 1024 * 1024; // 10MB

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };
const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.INFO;

/* ANSI 彩色控制台输出 */
const colors = {
  DEBUG: "\x1b[36m", INFO: "\x1b[32m", WARN: "\x1b[33m", ERROR: "\x1b[31m", FATAL: "\x1b[35m", RESET: "\x1b[0m"
};

function colorLevel(level) {
  return `${colors[level] || ""}[${level}]${colors.RESET || ""}`;
}

/* 日志文件写入器（延迟初始化，支持轮转） */
class FileWriter {
  constructor() {
    this.streams = new Map(); // level -> writeStream
    this.currentFile = { DEBUG: "", INFO: "", WARN: "", ERROR: "", FATAL: "" };
    this.counters = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
    this.lastRotate = { DEBUG: Date.now(), INFO: Date.now(), WARN: Date.now(), ERROR: Date.now(), FATAL: Date.now() };
    this.init();
  }

  init() {
    try {
      if (!existsSync(LOG_DIR)) {
        mkdirSync(LOG_DIR, { recursive: true });
      }
    } catch (e) {
      console.error("[logger] 无法创建日志目录:", e.message);
    }
  }

  getFilePath(level) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(LOG_DIR, `app-${level.toLowerCase()}-${today}.log`);
  }

  shouldRotate(filePath, level) {
    try {
      if (existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return stats.size >= LOG_MAX_SIZE || Date.now() - this.lastRotate[level] > 86400000;
      }
    } catch (e) {}
    return false;
  }

  write(level, entry) {
    if (currentLevel > LEVELS[level]) return;

    const filePath = this.getFilePath(level);

    // 初始化或轮转
    if (this.currentFile[level] !== filePath || this.shouldRotate(filePath, level)) {
      this.rotate(level, filePath);
    }

    let stream = this.streams.get(level);
    if (!stream) {
      try {
        stream = createWriteStream(filePath, { flags: "a", encoding: "utf8" });
        this.streams.set(level, stream);
        this.currentFile[level] = filePath;
        this.lastRotate[level] = Date.now();
      } catch (e) {
        console.error("[logger] 无法写入日志文件:", e.message);
        return;
      }
    }

    stream.write(JSON.stringify(entry) + "\n");
    this.counters[level]++;
  }

  rotate(level, newPath) {
    const old = this.streams.get(level);
    if (old) {
      try { old.end(); } catch (e) {}
      this.streams.delete(level);
    }
    // 清理旧文件
    this.cleanOldFiles(level);
    this.currentFile[level] = "";
    this.counters[level] = 0;
    this.lastRotate[level] = Date.now();
  }

  cleanOldFiles(level) {
    try {
      if (!existsSync(LOG_DIR)) return;
      const prefix = `app-${level.toLowerCase()}-`;
      const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith(".log"))
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // 保留最新的 LOG_MAX_FILES 个
      if (files.length >= LOG_MAX_FILES) {
        for (let i = LOG_MAX_FILES; i < files.length; i++) {
          try {
            fs.unlinkSync(path.join(LOG_DIR, files[i].name));
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  close() {
    for (const [level, stream] of this.streams) {
      try { stream.end(); } catch (e) {}
    }
    this.streams.clear();
  }
}

const writer = new FileWriter();

/* 生成简洁的请求 ID */
function genReqId() {
  return crypto.randomBytes(4).toString("hex");
}

/* 格式化日志条目 */
function formatEntry(level, msg, data, ctx) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message: msg,
    pid: process.pid,
    ...ctx
  };
  if (data !== undefined) {
    if (data instanceof Error) {
      entry.error = {
        message: data.message,
        name: data.name,
        stack: data.stack
      };
    } else if (typeof data === "object") {
      // 过滤敏感字段
      const safe = {};
      const sensitive = /password|passwd|secret|token|key|auth|credential/i;
      for (const [k, v] of Object.entries(data)) {
        if (!sensitive.test(k)) {
          safe[k] = v;
        } else {
          safe[k] = "[FILTERED]";
        }
      }
      entry.data = safe;
    } else {
      entry.data = data;
    }
  }
  return entry;
}

/* 打印到控制台 */
function consolePrint(entry) {
  const ts = entry.time.slice(11, 23); // HH:mm:ss.SSS
  const ctx = entry.reqId ? `[${entry.reqId}]` : "";
  const user = entry.userId ? `<${entry.userId}>` : "";
  const meta = [ctx, user].filter(Boolean).join("");

  const levelPad = entry.level.padEnd(5);
  const prefix = `[${ts}] ${colorLevel(entry.level)} ${levelPad}`;

  if (entry.level === "DEBUG") {
    console.log(`${prefix}${colors.RESET} ${entry.message}${meta}`);
  } else if (entry.level === "INFO") {
    console.log(`${prefix}${colors.RESET} ${entry.message}${meta}`);
  } else if (entry.level === "WARN") {
    console.warn(`${prefix}${colors.RESET} ${entry.message}${meta}`);
  } else if (entry.level === "ERROR" || entry.level === "FATAL") {
    console.error(`${prefix}${colors.RESET} ${entry.message}${meta}`);
    if (entry.error?.stack) {
      console.error(colors.ERROR + entry.error.stack + colors.RESET);
    }
  }
}

class Logger {
  constructor(ctx = {}) {
    this.ctx = ctx;
  }

  _log(level, msg, data) {
    if (LEVELS[level] === undefined || LEVELS[level] < currentLevel) return;
    const entry = formatEntry(level, msg, data, this.ctx);
    consolePrint(entry);
    writer.write(level, entry);
  }

  debug(msg, data) { this._log("DEBUG", msg, data); }
  info(msg, data) { this._log("INFO", msg, data); }
  warn(msg, data) { this._log("WARN", msg, data); }
  error(msg, data) { this._log("ERROR", msg, data); }
  fatal(msg, data) { this._log("FATAL", msg, data); }

  child(extraCtx) {
    return new Logger({ ...this.ctx, ...extraCtx });
  }

  /* Express/Koa 风格的中间件（用于 http.createServer） */
  middleware() {
    return (req, res, next) => {
      const reqId = genReqId();
      const startTime = Date.now();

      // 给 req 对象附加日志上下文
      req._logCtx = { ...this.ctx, reqId, startTime };
      req.id = reqId;

      const log = this.child({ reqId });

      log.info(`--> ${req.method} ${req.url}`);

      // 拦截 res.end 以记录响应
      const origEnd = res.end.bind(res);
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        const status = res.statusCode || 200;

        log.info(`<-- ${req.method} ${req.url} ${status} ${duration}ms`);

        if (duration > 1000) {
          log.warn(`Slow request: ${req.method} ${req.url} took ${duration}ms`);
        }

        return origEnd(...args);
      };

      // 捕获未处理的 Promise 错误
      req.on("error", err => log.error("Request error", err));

      next();
    };
  }
}

/* 全局日志实例 */
const log = new Logger({
  app: "3d-printing-business",
  version: "1.0.3",
  env: process.env.NODE_ENV || "development"
});

/* 日志查询 API（供 /api/logs 端点使用） */
export function queryLogs({ level, keyword, startTime, endTime, limit = 100, offset = 0 }) {
  const results = [];
  const targetLevels = level ? [level.toUpperCase()] : ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
  const start = startTime ? new Date(startTime).getTime() : 0;
  const end = endTime ? new Date(endTime).getTime() : Date.now();

  for (const lvl of targetLevels) {
    try {
      const filePath = path.join(LOG_DIR, `app-${lvl.toLowerCase()}.log`);
      if (!existsSync(filePath)) continue;

      const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const entryTime = new Date(entry.time).getTime();
          if (entryTime < start || entryTime > end) continue;
          if (keyword && !entry.message.toLowerCase().includes(keyword.toLowerCase())) continue;
          results.push(entry);
        } catch (e) {}
      }
    } catch (e) {}
  }

  // 按时间排序
  results.sort((a, b) => new Date(b.time) - new Date(a.time));

  return {
    total: results.length,
    logs: results.slice(offset, offset + limit)
  };
}

export { log };
