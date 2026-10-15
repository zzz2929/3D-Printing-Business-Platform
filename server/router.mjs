/* 3D打印业务平台 后端核心 · 多用户版 API 路由（Hono）
   存储适配器只需实现：{ get(col) -> any, set(col, val) }
   集合：materials / printers / records / orders / settings / achievements / users
   鉴权：createAuth(store)；已配置用户时，除 auth/* 外的所有 /api/* 都需要有效会话
   用户数据隔离：通过 users/{userId}/ 前缀区分
   宿主约定：createRouter 返回 async (req) => Response|null；非 /api/ 路径返回 null 交由宿主处理静态资源 */

import crypto from "node:crypto";
import { Hono } from "hono";
import { createAuth, tokenCookie, CLEAR_COOKIE } from "./auth.mjs";
import { appVersion } from "./version.mjs";
import { cloudLogin, cloudSendCode, fetchAll } from "./bambu.mjs";
import { log } from "./logger.mjs";
import { traceStore } from "./perf.mjs";

const DATA_COLS = ["materials", "printers", "records", "orders", "settings", "achievements"];

function json(obj, status = 200, headers){
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, headers || {})
  });
}

async function readBody(req){
  try{ return await req.json(); }catch(e){ return null; }
}

/* 仅管理员可访问的端点守卫 */
async function requireAdmin(c, auth, action){
  const user = await auth.verify(c.req.raw);
  if(!user) return json({ error: "请先登录" }, 401);
  if(user.role !== "admin") return json({ error: action }, 403);
  return null; // 通过
}

export function createRouter(store, mailer){
  const auth = createAuth(store, mailer);

  // 追踪器：在 createRouter 闭包内定义，让 serveData / handleAdminData 也能访问
  const tracedStore = {
    get: (col) => traceStore(col).wrap("get", (k) => store.get(k)),
    set: (col) => traceStore(col).wrap("set", (k, v) => store.set(k, v))
  };

  const app = new Hono();

  /* 请求标识中间件：为每个 /api/* 请求生成 reqId 与子日志 */
  app.use("/api/*", async (c, next) => {
    const reqId = c.req.header("x-request-id") || crypto.randomBytes(4).toString("hex");
    c.set("reqId", reqId);
    c.set("reqLog", log.child({ reqId }));
    await next();
  });

  /* 未匹配 /api/* 路由：与旧实现中未知集合的响应一致 */
  app.notFound(c => json({ error: "unknown collection" }, 404));

  /* 未捕获异常兜底：统一 500 JSON */
  app.onError((err, c) => {
    const reqLog = c.get("reqLog") || log;
    reqLog.error("Request handler error", { method: c.req.method, url: c.req.url, error: err.message, stack: err.stack });
    return json({ error: "internal error" }, 500);
  });

  /* ---- 日志查询（仅管理员）---- */
  app.get("/api/logs", async c => {
    const deny = await requireAdmin(c, auth, "只有管理员可以查看日志");
    if(deny) return deny;

    const { queryLogs } = await import("./logger.mjs");
    const params = c.req.query();
    const result = queryLogs({
      level: params.level || undefined,
      keyword: params.keyword || undefined,
      startTime: params.startTime || undefined,
      endTime: params.endTime || undefined,
      limit: Math.min(Number(params.limit) || 100, 500),
      offset: Number(params.offset) || 0
    });
    return json(result);
  });

  /* ---- 性能快照（仅管理员）---- */
  app.get("/api/perf", async c => {
    const deny = await requireAdmin(c, auth, "只有管理员可以查看性能数据");
    if(deny) return deny;

    const { perf } = await import("./perf.mjs");
    return json(perf.getSnapshot());
  });

  /* ---- 版本信息（无需会话） ---- */
  app.get("/api/version", c => {
    const reqLog = c.get("reqLog");
    reqLog.debug("API: version");
    return json(appVersion());
  });

  /* ---- 认证状态（无需会话） ---- */
  app.get("/api/auth", async c => {
    const configured = await auth.configured();
    if(!configured){
      return json({ required:false, ok:false, setup:false, openMode:true });
    }
    const user = await auth.verify(c.req.raw);
    return json({ required:true, ok:!!user, setup:false, openMode:false, user: user || null });
  });

  /* ---- 注册：开放模式首个管理员，或已配置时由管理员创建用户 ---- */
  app.post("/api/register", async c => {
    const body = await readBody(c.req.raw);
    const reqLog = c.get("reqLog");
    reqLog.info("User register attempt", { username: (body || {}).username });
    const { username, password, role } = body || {};
    if(!(await auth.configured())){
      // 开放模式，首个注册的是管理员
      const result = await auth.register(username, password, "admin");
      if(result.error) return json({ error: result.error }, 400);
      const token = await auth.issueTokenForUser(result.user);
      return json(result, 200, { "set-cookie": tokenCookie(token, await auth.sessionDays()) });
    }
    // 已配置，需要管理员权限
    const operator = await auth.verify(c.req.raw);
    if(!operator) return json({ error: "请先登录" }, 401);
    const result = await auth.register(username, password, role || "normal", operator);
    if(result.error) return json({ error: result.error }, 400);
    return json(result);
  });

  /* ---- 登录 ---- */
  app.post("/api/login", async c => {
    const body = await readBody(c.req.raw);
    const { username, password } = body || {};
    const result = await auth.login(username, password);
    if(result.error) return json({ error: result.error }, result.error.includes("未配置") ? 400 : 401);
    const token = await auth.issueTokenForUser(result.user);
    return json(result, 200, { "set-cookie": tokenCookie(token, await auth.sessionDays()) });
  });

  /* ---- 登录安全（仅管理员）：会话有效期 ---- */
  app.get("/api/authcfg", async c => {
    const deny = await requireAdmin(c, auth, "只有管理员可以查看登录安全设置");
    if(deny) return deny;
    return json({ sessionDays: await auth.sessionDays() });
  });

  app.post("/api/authcfg", async c => {
    const deny = await requireAdmin(c, auth, "只有管理员可以修改登录安全设置");
    if(deny) return deny;
    const body = await readBody(c.req.raw) || {};
    const days = Math.round(Number(body.sessionDays));
    if(!(days >= 0 && days <= 365)) return json({ error: "会话有效期需为 0-365 的整数天（0 表示永久）" }, 400);
    const prev = await store.get("authcfg") || {};
    await store.set("authcfg", Object.assign(prev, { sessionDays: days }));
    return json({ ok: true, sessionDays: days });
  });

  /* ---- 登出 ---- */
  app.post("/api/logout", () => json({ ok: true }, 200, { "set-cookie": CLEAR_COOKIE }));

  /* ---- 邮箱绑定与忘记密码 ---- */
  app.post("/api/mail/code", async c => {
    const user = await auth.verify(c.req.raw);
    if(!user) return json({ error: "请先登录" }, 401);
    const body = await readBody(c.req.raw);
    const result = await auth.requestBindCode(user, (body || {}).email);
    return result.error ? json(result, 400) : json(result);
  });

  app.post("/api/mail/bind", async c => {
    const user = await auth.verify(c.req.raw);
    if(!user) return json({ error: "请先登录" }, 401);
    const body = await readBody(c.req.raw);
    const result = await auth.bindEmail(user, (body || {}).email, (body || {}).code);
    return result.error ? json(result, 400) : json(result);
  });

  // 忘记密码：发送重置验证码（无需登录；响应恒为 ok，防枚举）
  app.post("/api/forgot", async c => {
    const body = await readBody(c.req.raw);
    const result = await auth.requestResetCode((body || {}).username);
    return result.error ? json(result, 400) : json(result);
  });

  // 忘记密码：验证码 + 新密码重置（无需登录）
  app.post("/api/forgot/reset", async c => {
    const body = await readBody(c.req.raw);
    const { username, code, newPassword } = body || {};
    const result = await auth.resetWithCode(username, code, newPassword);
    return result.error ? json(result, 400) : json(result);
  });

  /* ---- SMTP 配置（仅管理员；存于 "smtp" 集合，密码不回传前端） ---- */
  app.get("/api/smtp", async c => {
    const deny = await requireAdmin(c, auth, "只有管理员可以查看 SMTP 配置");
    if(deny) return deny;
    const saved = await store.get("smtp") || {};
    const desc = await mailer.describe();
    return json({ configured: desc.configured, debug: desc.debug, host: saved.host || "", port: saved.port || "", secure: !!saved.secure, user: saved.user || "", from: saved.from || "", hasPass: !!saved.pass });
  });

  app.post("/api/smtp", async c => {
    const deny = await requireAdmin(c, auth, "只有管理员可以修改 SMTP 配置");
    if(deny) return deny;
    const body = await readBody(c.req.raw) || {};
    const host = String(body.host || "").trim();
    if(!host) return json({ error: "SMTP 服务器地址不能为空" }, 400);
    const prev = await store.get("smtp") || {};
    await store.set("smtp", {
      host,
      port: Number(body.port) || "",
      secure: !!body.secure,
      user: String(body.user || "").trim(),
      pass: String(body.pass || "").trim() || prev.pass || "", // 留空 = 保留原密码
      from: String(body.from || "").trim()
    });
    return json({ ok: true });
  });

  // 发送测试邮件（可先用未保存的表单配置试发）
  app.post("/api/mail/test", async c => {
    const deny = await requireAdmin(c, auth, "只有管理员可以发送测试邮件");
    if(deny) return deny;
    const body = await readBody(c.req.raw) || {};
    const to = String(body.to || "").trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: "收件邮箱格式不正确" }, 400);
    try{
      const formCfg = (body.host !== undefined) ? body : null; // 传了表单配置就用表单的（含未保存的密码）
      await mailer.sendWith(formCfg || await store.get("smtp") || {}, to, "测试邮件", "这是一封来自 3D打印业务平台 的测试邮件，收到即说明 SMTP 配置成功。");
      return json({ ok: true });
    }catch(e){
      return json({ error: "发送失败：" + e.message }, 400);
    }
  });

  /* ---- 修改密码 ---- */
  app.post("/api/change-password", async c => {
    const user = await auth.verify(c.req.raw);
    if(!user) return json({ error: "请先登录" }, 401);
    const body = await readBody(c.req.raw);
    const { currentPassword, newPassword } = body || {};
    const result = await auth.changePassword(user.id, currentPassword, newPassword, user);
    if(result.error) return json({ error: result.error }, 400);
    return json(result);
  });

  /* ---- 用户管理（仅管理员）---- */
  app.get("/api/users", async c => {
    const operator = await auth.verify(c.req.raw);
    if(!operator) return json({ error: "请先登录" }, 401);
    const result = await auth.listUsers(operator);
    if(result.error) return json({ error: result.error }, 403);
    return json(result);
  });

  app.post("/api/users", async c => {
    const operator = await auth.verify(c.req.raw);
    if(!operator) return json({ error: "请先登录" }, 401);
    const body = await readBody(c.req.raw);
    const { username, password, role } = body || {};
    const result = await auth.register(username, password, role || "normal", operator);
    if(result.error) return json({ error: result.error }, 400);
    return json(result);
  });

  // DELETE /api/users/:id — 删除用户（仅管理员）
  app.delete("/api/users/:id", async c => {
    const operator = await auth.verify(c.req.raw);
    if(!operator) return json({ error: "请先登录" }, 401);
    const userId = c.req.param("id");
    if(!userId) return json({ error: "缺少用户ID" }, 400);
    const result = await auth.deleteUser(userId, operator);
    if(result.error) return json({ error: result.error }, 400);
    return json(result);
  });

  // PATCH /api/users/:id — 修改用户角色（仅管理员）
  app.patch("/api/users/:id", async c => {
    const operator = await auth.verify(c.req.raw);
    if(!operator) return json({ error: "请先登录" }, 401);
    const userId = c.req.param("id");
    if(!userId) return json({ error: "缺少用户ID" }, 400);
    const body = await readBody(c.req.raw);
    const result = await auth.updateUser(userId, body || {}, operator);
    if(result.error) return json({ error: result.error }, 400);
    return json(result);
  });

  /* ---- 拓竹耗材同步：连接配置（密钥只存服务端，不回传前端）+ 云登录 + 立即抓取 ----
     配置存于每用户私有集合 bambucfg（不属 DATA_COLS，不进 /api/data、导出与 /api/all-data）。 */
  const bambuCtx = async c => {
    const user = await auth.verify(c.req.raw);
    const prefix = (await auth.configured()) ? (user ? "u_" + user.id + "_" : null) : "";
    if(prefix === null) return json({ error: "请先登录" }, 401);
    const cfgKey = prefix + "bambucfg";
    const getCfg = async () => await store.get(cfgKey) || { lan: [], cloud: {} };

    /* 规范化保存：密钥字段留空 = 保留原值；LAN 行按 id 对应（新增行要求填访问码）；
       mode = 当前使用的连接方式（lan / cloud 二选一，另一种的配置保留但不使用） */
    function normBambuCfg(body, prev){
      body = body || {};
      const prevLan = Array.isArray(prev.lan) ? prev.lan : [];
      const lan = Array.isArray(body.lan)
        ? body.lan.map((p, i) => {
            const old = prevLan.find(x => x.id && x.id === p.id) || {};
            const code = String((p.code == null ? "" : p.code)).trim() || old.code || "";
            return {
              id: String(p.id || "").trim() || old.id || "bp" + Date.now().toString(36) + i,
              name: String(p.name == null ? "" : p.name).trim().slice(0, 40) || old.name || "",
              host: String(p.host == null ? "" : p.host).trim().slice(0, 120),
              code
            };
          }).filter(p => p.host)
        : prevLan;
      const prevC = prev.cloud || {};
      const c2 = body.cloud || {};
      const keep = (v, old) => (v === undefined || String(v).trim() === "") ? (old || "") : String(v).trim();
      const cloud = {
        region: ["cn", "eu", "us"].includes(c2.region) ? c2.region : (prevC.region || "cn"),
        email: keep(c2.email, prevC.email),
        password: keep(c2.password, prevC.password),
        token: keep(c2.token, prevC.token)
      };
      const mode = ["lan", "cloud"].includes(body.mode) ? body.mode : (["lan", "cloud"].includes(prev.mode) ? prev.mode : "lan");
      return { lan, cloud, mode, last: prev.last }; // 保留上次抓取摘要
    }
    /* 脱敏视图：只回传 has* 布尔，绝不回传访问码 / token / 密码 */
    function maskBambuCfg(cfg, last){
      return {
        mode: cfg.mode === "cloud" ? "cloud" : "lan",
        lan: (cfg.lan || []).map(p => ({ id: p.id, name: p.name || "", host: p.host, hasCode: !!p.code })),
        cloud: {
          region: (cfg.cloud && cfg.cloud.region) || "cn",
          email: (cfg.cloud && cfg.cloud.email) || "",
          hasToken: !!(cfg.cloud && cfg.cloud.token),
          hasPassword: !!(cfg.cloud && cfg.cloud.password)
        },
        last: last || cfg.last || null
      };
    }

    return { cfgKey, getCfg, normBambuCfg, maskBambuCfg };
  };

  app.get("/api/bambu", async c => {
    const ctx = await bambuCtx(c);
    if(ctx.json) return ctx;
    return json(ctx.maskBambuCfg(await ctx.getCfg()));
  });

  app.delete("/api/bambu", async c => { // 清除全部连接配置
    const ctx = await bambuCtx(c);
    if(ctx.json) return ctx;
    await store.set(ctx.cfgKey, { lan: [], cloud: {} });
    return json({ ok: true });
  });

  app.post("/api/bambu", async c => {
    const ctx = await bambuCtx(c);
    if(ctx.json) return ctx;
    const body = await readBody(c.req.raw) || {};
    const { getCfg, normBambuCfg, maskBambuCfg, cfgKey } = ctx;
    if(body.action === "cloudLogin"){ // 拓竹云账号登录（获取并保存 accessToken）
      const { region, email, password, code, tfaKey, sendCode } = body;
      if(sendCode){ // 下发登录验证码：手机号 → 短信，邮箱 → 邮件
        try{
          return json(await cloudSendCode({ region, account: email }));
        }catch(e){
          return json({ error: e.message || "验证码发送失败" }, 400);
        }
      }
      try{
        const r = await cloudLogin({ region, account: email, password, code, tfaKey });
        if(r.needCode) return json({ needCode: true, tfaKey: r.tfaKey || "" });
      const prev = await getCfg();
      const cfg = normBambuCfg({ mode: "cloud", cloud: {
        region, email, password: password || undefined,
        token: r.token
      }}, prev);
      cfg.lan = prev.lan || []; // 登录只动 cloud，不覆盖 lan
        await store.set(cfgKey, cfg);
        return json(Object.assign({ ok: true }, maskBambuCfg(cfg)));
      }catch(e){
        return json({ error: e.message || "登录失败" }, 400);
      }
    }
    if(body.action === "fetch"){ // 立即抓取所有已配置来源的 AMS 快照 + 云端耗材库
      const cfg = await getCfg();
      // 以本次操作实际选择的来源为准：前端会把界面当前的连接方式带上，
      // 避免「界面已切到拓竹云、配置里 mode 仍是 lan」导致云端抓取不启动。
      if(["lan", "cloud"].includes(body.mode)) cfg.mode = body.mode;
      try{
        const r = await fetchAll(cfg);
        const summary = r.sources.map(s => ({ kind: s.kind, name: s.name, ok: s.ok, error: s.error || "",
          devices: s.ok ? s.devices.map(d => ({ devId: d.devId, devName: d.devName, trayCount: d.trays.length })) : [] }));
        if(r.newToken && cfg.cloud){ // 自动重登得到的新 token 持久化，避免每次抓取都重登
          cfg.cloud.token = r.newToken;
          cfg.last = { fetchedAt: r.fetchedAt, sources: summary };
          await store.set(cfgKey, cfg);
        }else{
          await store.set(cfgKey, Object.assign({}, cfg, { last: { fetchedAt: r.fetchedAt, sources: summary } }));
        }
        return json(r);
      }catch(e){
        return json({ error: e.message || "抓取失败" }, 400);
      }
    }
    // 默认：保存连接配置
    const prev = await getCfg();
    const cfg = normBambuCfg(body, prev);
    if(cfg.mode === "cloud"){
      if(!cfg.cloud.email && !cfg.cloud.token && !cfg.cloud.password)
        return json({ error: "请填写拓竹账号（手机号或邮箱，或粘贴 accessToken）" }, 400);
    }else if(!cfg.lan.length){
      return json({ error: "请至少添加一台局域网打印机" }, 400);
    }
    await store.set(cfgKey, cfg);
    return json({ ok: true, config: maskBambuCfg(cfg) });
  });

  /* ---- 数据端点 ---- */
  // 开放模式直接放行（user=null）；已配置时需登录；admin + allUsers 参数 → 管理视图
  async function dataRoute(c){
    const req = c.req.raw;
    if(!(await auth.configured())){
      return handleData(req, null);
    }
    const user = await auth.verify(req);
    if(!user) return json({ error: "未登录或会话已过期" }, 401, { "www-authenticate": "Session" });
    if(user.role === "admin" && c.req.query("allUsers") !== undefined){
      return handleAdminData(req, user);
    }
    return handleData(req, user);
  }
  const methodDenied = () => json({ error: "method not allowed" }, 405);

  app.get("/api/data", dataRoute);
  app.put("/api/data", dataRoute);
  app.get("/api/:col", dataRoute);
  app.put("/api/:col", dataRoute);
  app.all("/api/data", methodDenied);
  app.all("/api/:col", methodDenied);

  /* 处理数据：开放模式用共享集合（无前缀），登录用户用 u_{id}_ 前缀 */
  async function handleData(req, user){
    return serveData(req, user ? "u_" + user.id + "_" : "");
  }

  async function serveData(req, prefix){
    const url = new URL(req.url);
    const col = url.pathname.slice(5);

    // 聚合端点 /api/data：一次读写全部集合
    if(col === "data"){
      if(req.method === "GET"){
        const all = {};
        for(const c of DATA_COLS){
          all[c] = await tracedStore.get(c)(prefix + c);
        }
        return json(all);
      }
      if(req.method === "PUT"){
        const body = await readBody(req);
        if(!body || typeof body !== "object") return json({ error: "bad body" }, 400);
        for(const c of DATA_COLS){
          if(body[c] !== undefined){
            await tracedStore.set(c)(prefix + c, body[c]);
          }
        }
        return json({ ok: true });
      }
      return json({ error: "method not allowed" }, 405);
    }

    if(!DATA_COLS.includes(col)) return json({ error: "unknown collection" }, 404);
    if(req.method === "GET"){
      return json(await tracedStore.get(col)(prefix + col));
    }
    if(req.method === "PUT"){
      const body = await readBody(req);
      if(body === null) return json({ error: "bad body" }, 400);
      await tracedStore.set(col)(prefix + col, body);
      return json({ ok: true });
    }
    return json({ error: "method not allowed" }, 405);
  }

  /* 管理员查看所有用户数据 */
  async function handleAdminData(req, admin){
    const url = new URL(req.url);
    const col = url.pathname.slice(5);

    if(col !== "all-data") return json({ error: "unknown collection" }, 404);
    if(req.method !== "GET") return json({ error: "method not allowed" }, 405);

    const users = await auth.listUsers(admin);
    if(users.error) return json(users, 403);
    const result = {};
    for(const u of users){
      const prefix = "u_" + u.id + "_";
      result[u.id] = { user: u, data: {} };
      for(const c of DATA_COLS){
        result[u.id].data[c] = await tracedStore.get(c)(prefix + c);
      }
    }
    return json(result);
  }

  /* Node/Workers/Vercel/飞牛 通用 fetch 风格入口：
     非 /api/ 路径返回 null，由宿主负责静态资源与未匹配路径 */
  return async function handle(req){
    const url = new URL(req.url);
    if(!url.pathname.startsWith("/api/")) return null;
    return app.fetch(req);
  };
}

export { DATA_COLS };