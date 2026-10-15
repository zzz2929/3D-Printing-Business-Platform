/* 3D打印业务平台 · 日志模块（pino 驱动）
   分级日志：DEBUG / INFO / WARN / ERROR / FATAL
   输出：控制台（彩色）+ 文件（JSON Lines 格式，按级别按天分文件，支持轮转）
   支持环境变量：LOG_LEVEL（默认 INFO）、LOG_DIR（默认 ./logs）、LOG_MAX_FILES（默认 7）、LOG_MAX_SIZE（默认 10MB）
   API（保持不变）：log.debug/info/warn/error/fatal(msg, data?) / log.child({ reqId, userId }) / log.middleware()
   说明：核心序列化交给 pino（多宿主兼容、child 上下文、级别过滤），文件落盘保留旧实现语义 */

import fs from "node:fs";
import path from "node:path";
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import pino from "pino";

const ROOT = path.resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, "logs");
const LOG_LEVEL = (process.env.LOG_LEVEL || "INFO").toLowerCase();
const LOG_MAX_FILES = Number(process.env.LOG_MAX_FILES) || 7;
const LOG_MAX_SIZE = Number(process.env.LOG_MAX_SIZE) || 10 * 1024 * 1024; // 10MB

/* ANSI 彩色控制台输出 */
const colors = {
  DEBUG: "\x1b[36m", INFO: "\x1b[32m", WARN: "\x1b[33m", ERROR: "\x1b[31m", FATAL: "\x1b[35m", RESET: "\x1b[0m"
};
function colorLevel(level) {
  return `${colors[level] || ""}[${level}]${colors.RESET || ""}`;
}

/* 敏感字段过滤（与旧实现一致）：password/passwd/secret/token/key/auth/credential */
const SENSITIVE = /password|passwd|secret|token|key|auth|credential/i;
function sanitize(data){
  if(data instanceof Error){
    return { error: { message: data.message, name: data.name, stack: data.stack } };
  }
  if(data !== null && typeof data === "object"){
    const safe = {};
    for(const [k, v] of Object.entries(data)){
      if(SENSITIVE.test(k)) safe[k] = "[FILTERED]";
      else safe[k] = sanitize(v);
    }
    return safe;
  }
  return data;
}

/* 日志文件写入器（延迟初始化，按级别按天分文件，支持大小/日期轮转 + 旧文件清理） */
class FileWriter {
  constructor() {
    this.streams = new Map(); // level -> writeStream
    this.currentFile = new Map(); // level -> 当前文件名
    this.init();
  }

  init() {
    try {
      if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
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
        const stats = statSync(filePath);
        return stats.size >= LOG_MAX_SIZE;
      }
    } catch (e) {}
    return false;
  }

  write(entry) {
    const level = (entry.level || "INFO").toUpperCase();
    const filePath = this.getFilePath(level);

    // 跨天或超限时轮转
    if (this.currentFile.get(level) !== filePath || this.shouldRotate(filePath, level)) {
      this.rotate(level, filePath);
    }

    let stream = this.streams.get(level);
    if (!stream) {
      try {
        stream = createWriteStream(filePath, { flags: "a", encoding: "utf8" });
        this.streams.set(level, stream);
        this.currentFile.set(level, filePath);
      } catch (e) {
        console.error("[logger] 无法写入日志文件:", e.message);
        return;
      }
    }

    stream.write(JSON.stringify(entry) + "\n");
  }

  rotate(level, newPath) {
    const old = this.streams.get(level);
    if (old) {
      try { old.end(); } catch (e) {}
      this.streams.delete(level);
    }
    this.cleanOldFiles(level);
    this.currentFile.delete(level);
  }

  cleanOldFiles(level) {
    try {
      if (!existsSync(LOG_DIR)) return;
      const prefix = `app-${level.toLowerCase()}-`;
      const files = readdirSync(LOG_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith(".log"))
        .map(f => ({ name: f, time: statSync(path.join(LOG_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length >= LOG_MAX_FILES) {
        for (let i = LOG_MAX_FILES; i < files.length; i++) {
          try { unlinkSync(path.join(LOG_DIR, files[i].name)); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  close() {
    for (const stream of this.streams.values()) {
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

/* 控制台/文件 sink：把 pino 序列化的 JSON 行解析后按旧语义呈现 */
function parseChunk(chunk){
  try { return JSON.parse(String(chunk).trim()); } catch (e) { return null; }
}

const consoleSink = {
  write(chunk){
    const entry = parseChunk(chunk);
    if(!entry) return true;
    const ts = String(entry.time || "").slice(11, 23);
    const ctx = entry.reqId ? `[${entry.reqId}]` : "";
    const user = entry.userId ? `<${entry.userId}>` : "";
    const meta = [ctx, user].filter(Boolean).join("");
    const level = String(entry.level || "INFO").toUpperCase();
    const msg = entry.msg || "";
    const prefix = `[${ts}] ${colorLevel(level)} ${level.padEnd(5)}`;

    if (level === "WARN") {
      console.warn(`${prefix}${colors.RESET} ${msg}${meta}`);
    } else if (level === "ERROR" || level === "FATAL") {
      console.error(`${prefix}${colors.RESET} ${msg}${meta}`);
      const stack = entry.err?.stack || (entry.error && entry.error.stack);
      if (stack) console.error(colors.ERROR + stack + colors.RESET);
    } else {
      console.log(`${prefix}${colors.RESET} ${msg}${meta}`);
    }
    return true;
  }
};

const fileSink = {
  write(chunk){
    const entry = parseChunk(chunk);
    if(!entry) return true;
    writer.write(entry);
    return true;
  }
};

const PLATFORM = typeof process !== "undefined" && process.platform ? process.platform : "web";
const APP_NAME = "3d-printing-business";
const APP_VERSION = "1.0.3";

/* pino 核心实例：自定义 base（含 pid）、ISO 时间、level 转大写字符串，双流输出 */
const core = pino({
  level: LOG_LEVEL,
  base: { app: APP_NAME, version: APP_VERSION, env: process.env.NODE_ENV || "development", platform: PLATFORM, pid: typeof process !== "undefined" ? process.pid : undefined },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label){ return { level: label.toUpperCase() }; },
    bindings(bindings){
      const out = { ...bindings };
      if(out.pid === undefined) delete out.pid;
      return out;
    }
  }
}, pino.multistream([
  { stream: consoleSink },
  { stream: fileSink }
]));

/* 对外 Logger：保持旧签名 log.info(msg, data?) */
class Logger {
  constructor(inst = core) {
    this.inst = inst;
  }

  _log(level, msg, data) {
    if (data === undefined) {
      this.inst[level](msg);
    } else if (data instanceof Error) {
      // 交给 pino 标准 err 序列化器：{type, message, stack}
      this.inst[level]({ err: data }, msg);
    } else if (data !== null && typeof data === "object" && !Array.isArray(data)) {
      // 递归敏感字段过滤后作为 data 字段落盘（保持旧 entry.data 语义）
      this.inst[level]({ data: sanitize(data) }, msg);
    } else {
      this.inst[level]({ data }, msg);
    }
  }

  debug(msg, data) { this._log("debug", msg, data); }
  info(msg, data) { this._log("info", msg, data); }
  warn(msg, data) { this._log("warn", msg, data); }
  error(msg, data) { this._log("error", msg, data); }
  fatal(msg, data) { this._log("fatal", msg, data); }

  child(extraCtx) {
    return new Logger(this.inst.child(extraCtx));
  }

  /* 兼容中间件（http.createServer），与旧实现等价 */
  middleware() {
    return (req, res, next) => {
      const reqId = genReqId();
      const startTime = Date.now();
      req._logCtx = { reqId, startTime };
      req.id = reqId;

      const log = this.child({ reqId });
      log.info(`--> ${req.method} ${req.url}`);

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

      req.on("error", err => log.error("Request error", err));
      next();
    };
  }
}

/* 全局日志实例 */
const log = new Logger();

/* 日志查询 API（供 /api/logs 端点使用）：扫描按天分文件，兼容 pino 字段 */
export function queryLogs({ level, keyword, startTime, endTime, limit = 100, offset = 0 }) {
  const results = [];
  const targetLevels = level ? [String(level).toUpperCase()] : ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
  const start = startTime ? new Date(startTime).getTime() : 0;
  const end = endTime ? new Date(endTime).getTime() : Date.now();

  for (const lvl of targetLevels) {
    try {
      if (!existsSync(LOG_DIR)) continue;
      const files = readdirSync(LOG_DIR)
        .filter(f => f.startsWith(`app-${lvl.toLowerCase()}-`) && f.endsWith(".log"))
        .sort();

      for (const fileName of files) {
        const lines = fs.readFileSync(path.join(LOG_DIR, fileName), "utf8").split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const entryTime = new Date(entry.time).getTime();
            if (entryTime < start || entryTime > end) continue;
            const message = entry.msg || entry.message || "";
            if (keyword && !message.toLowerCase().includes(keyword.toLowerCase())) continue;
            results.push({
              time: entry.time,
              level: (entry.level || "INFO").toString().toUpperCase(),
              message,
              pid: entry.pid,
              reqId: entry.reqId,
              userId: entry.userId,
              data: entry.data,
              err: entry.err
            });
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  results.sort((a, b) => new Date(b.time) - new Date(a.time));

  return {
    total: results.length,
    logs: results.slice(offset, offset + limit)
  };
}

export { log };