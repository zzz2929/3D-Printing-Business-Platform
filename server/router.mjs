/* 3D打印业务平台 后端核心 · 多用户版 API 路由
   存储适配器只需实现：{ get(col) -> any, set(col, val) }
   集合：materials / printers / records / orders / settings / achievements / users
   鉴权：createAuth(store)；已配置用户时，除 auth/* 外的所有 /api/* 都需要有效会话
   用户数据隔离：通过 users/{userId}/ 前缀区分 */

import { createAuth, tokenCookie, CLEAR_COOKIE } from "./auth.mjs";
import { appVersion } from "./version.mjs";

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

export function createRouter(store, mailer){
  const auth = createAuth(store, mailer);

  return async function handle(req){
    const url = new URL(req.url);
    if(!url.pathname.startsWith("/api/")) return null;
    const path = url.pathname.slice(5);

    /* ---- 版本信息（无需会话） ---- */
    if(path === "version" && req.method === "GET"){
      return json(appVersion());
    }

    /* ---- 认证相关端点（无需会话） ---- */
    if(path === "auth" && req.method === "GET"){
      const configured = await auth.configured();
      if(!configured){
        return json({ required:false, ok:false, setup:false, openMode:true });
      }
      const user = await auth.verify(req);
      return json({ required:true, ok:!!user, setup:false, openMode:false, user: user || null });
    }

    // 注册（开放模式或首个管理员）
    if(path === "register" && req.method === "POST"){
      const body = await readBody(req);
      const { username, password, role } = body || {};
      if(!await auth.configured()){
        // 开放模式，首个注册的是管理员
        const result = await auth.register(username, password, "admin");
        if(result.error) return json({ error:result.error }, 400);
        const token = await auth.issueTokenForUser(result.user);
        return json(result, 200, { "set-cookie": tokenCookie(token, await auth.sessionDays()) });
      }else{
        // 已配置，需要管理员权限
        const operator = await auth.verify(req);
        if(!operator) return json({ error:"请先登录" }, 401);
        const result = await auth.register(username, password, role || "normal", operator);
        if(result.error) return json({ error:result.error }, 400);
        return json(result);
      }
    }

    // 登录
    if(path === "login" && req.method === "POST"){
      const body = await readBody(req);
      const { username, password } = body || {};
      const result = await auth.login(username, password);
      if(result.error) return json({ error:result.error }, result.error.includes("未配置") ? 400 : 401);
      const token = await auth.issueTokenForUser(result.user);
      return json(result, 200, { "set-cookie": tokenCookie(token, await auth.sessionDays()) });
    }

    /* ---- 登录安全（仅管理员）：会话有效期 ---- */
    if(path === "authcfg" && req.method === "GET"){
      const user = await auth.verify(req);
      if(!user) return json({ error:"请先登录" }, 401);
      if(user.role !== "admin") return json({ error:"只有管理员可以查看登录安全设置" }, 403);
      return json({ sessionDays: await auth.sessionDays() });
    }
    if(path === "authcfg" && req.method === "POST"){
      const user = await auth.verify(req);
      if(!user) return json({ error:"请先登录" }, 401);
      if(user.role !== "admin") return json({ error:"只有管理员可以修改登录安全设置" }, 403);
      const body = await readBody(req) || {};
      const days = Math.round(Number(body.sessionDays));
      if(!(days >= 1 && days <= 365)) return json({ error:"会话有效期需为 1-365 的整数天" }, 400);
      const prev = await store.get("authcfg") || {};
      await store.set("authcfg", Object.assign(prev, { sessionDays:days }));
      return json({ ok:true, sessionDays:days });
    }

    // 登出
    if(path === "logout" && req.method === "POST"){
      return json({ ok:true }, 200, { "set-cookie": CLEAR_COOKIE });
    }

    /* ---- 邮箱绑定与忘记密码 ---- */
    // 请求绑定邮箱验证码（需登录）
    if(path === "mail/code" && req.method === "POST"){
      const user = await auth.verify(req);
      if(!user) return json({ error:"请先登录" }, 401);
      const body = await readBody(req);
      const result = await auth.requestBindCode(user, (body || {}).email);
      return result.error ? json(result, 400) : json(result);
    }
    // 提交验证码完成绑定（需登录）
    if(path === "mail/bind" && req.method === "POST"){
      const user = await auth.verify(req);
      if(!user) return json({ error:"请先登录" }, 401);
      const body = await readBody(req);
      const result = await auth.bindEmail(user, (body || {}).email, (body || {}).code);
      return result.error ? json(result, 400) : json(result);
    }
    // 忘记密码：发送重置验证码（无需登录；响应恒为 ok，防枚举）
    if(path === "forgot" && req.method === "POST"){
      const body = await readBody(req);
      const result = await auth.requestResetCode((body || {}).username);
      return result.error ? json(result, 400) : json(result);
    }
    // 忘记密码：验证码 + 新密码重置（无需登录）
    if(path === "forgot/reset" && req.method === "POST"){
      const body = await readBody(req);
      const { username, code, newPassword } = body || {};
      const result = await auth.resetWithCode(username, code, newPassword);
      return result.error ? json(result, 400) : json(result);
    }

    /* ---- SMTP 配置（仅管理员；存于 "smtp" 集合，密码不回传前端） ---- */
    if(path === "smtp" && req.method === "GET"){
      const user = await auth.verify(req);
      if(!user) return json({ error:"请先登录" }, 401);
      if(user.role !== "admin") return json({ error:"只有管理员可以查看 SMTP 配置" }, 403);
      const saved = await store.get("smtp") || {};
      const desc = await mailer.describe();
      return json({ configured:desc.configured, debug:desc.debug, host:saved.host || "", port:saved.port || "", secure:!!saved.secure, user:saved.user || "", from:saved.from || "", hasPass:!!saved.pass });
    }
    if(path === "smtp" && req.method === "POST"){
      const user = await auth.verify(req);
      if(!user) return json({ error:"请先登录" }, 401);
      if(user.role !== "admin") return json({ error:"只有管理员可以修改 SMTP 配置" }, 403);
      const body = await readBody(req) || {};
      const host = String(body.host || "").trim();
      if(!host) return json({ error:"SMTP 服务器地址不能为空" }, 400);
      const prev = await store.get("smtp") || {};
      await store.set("smtp", {
        host,
        port: Number(body.port) || "",
        secure: !!body.secure,
        user: String(body.user || "").trim(),
        pass: String(body.pass || "").trim() || prev.pass || "", // 留空 = 保留原密码
        from: String(body.from || "").trim()
      });
      return json({ ok:true });
    }
    // 发送测试邮件（可先用未保存的表单配置试发）
    if(path === "mail/test" && req.method === "POST"){
      const user = await auth.verify(req);
      if(!user) return json({ error:"请先登录" }, 401);
      if(user.role !== "admin") return json({ error:"只有管理员可以发送测试邮件" }, 403);
      const body = await readBody(req) || {};
      const to = String(body.to || "").trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error:"收件邮箱格式不正确" }, 400);
      try{
        const formCfg = (body.host !== undefined) ? body : null; // 传了表单配置就用表单的（含未保存的密码）
        await mailer.sendWith(formCfg || await store.get("smtp") || {}, to, "测试邮件", "这是一封来自 3D打印业务平台 的测试邮件，收到即说明 SMTP 配置成功。");
        return json({ ok:true });
      }catch(e){
        return json({ error:"发送失败：" + e.message }, 400);
      }
    }

    // 修改密码
    if(path === "change-password" && req.method === "POST"){
      const user = await auth.verify(req);
      if(!user) return json({ error:"请先登录" }, 401);
      const body = await readBody(req);
      const { currentPassword, newPassword } = body || {};
      const result = await auth.changePassword(user.id, currentPassword, newPassword, user);
      if(result.error) return json({ error:result.error }, 400);
      return json(result);
    }

    // 用户管理（仅管理员）
    if(path === "users" && req.method === "GET"){
      const operator = await auth.verify(req);
      if(!operator) return json({ error:"请先登录" }, 401);
      const result = await auth.listUsers(operator);
      if(result.error) return json({ error:result.error }, 403);
      return json(result);
    }

    if(path === "users" && req.method === "POST"){
      const operator = await auth.verify(req);
      if(!operator) return json({ error:"请先登录" }, 401);
      const body = await readBody(req);
      const { username, password, role } = body || {};
      const result = await auth.register(username, password, role || "normal", operator);
      if(result.error) return json({ error:result.error }, 400);
      return json(result);
    }

    // DELETE /api/users/:id — 删除用户（仅管理员）
    if(path.startsWith("users/") && req.method === "DELETE"){
      const operator = await auth.verify(req);
      if(!operator) return json({ error:"请先登录" }, 401);
      const userId = decodeURIComponent(path.slice(6));
      if(!userId) return json({ error:"缺少用户ID" }, 400);
      const result = await auth.deleteUser(userId, operator);
      if(result.error) return json({ error:result.error }, 400);
      return json(result);
    }

    // PATCH /api/users/:id — 修改用户角色（仅管理员）
    if(path.startsWith("users/") && req.method === "PATCH"){
      const operator = await auth.verify(req);
      if(!operator) return json({ error:"请先登录" }, 401);
      const userId = decodeURIComponent(path.slice(6));
      if(!userId) return json({ error:"缺少用户ID" }, 400);
      const body = await readBody(req);
      const result = await auth.updateUser(userId, body || {}, operator);
      if(result.error) return json({ error:result.error }, 400);
      return json(result);
    }

    /* ---- 数据端点 ---- */
    // 开放模式：无需登录
    if(!(await auth.configured())){
      return handleData(req, null);
    }

    // 需要登录
    const user = await auth.verify(req);
    if(!user) return json({ error:"未登录或会话已过期" }, 401, { "www-authenticate": "Session" });

    // 管理员可访问所有用户数据
    if(user.role === "admin" && url.searchParams.has("allUsers")){
      return handleAdminData(req, user);
    }

    return handleData(req, user);
  };

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
        for(const c of DATA_COLS) all[c] = await store.get(prefix + c);
        return json(all);
      }
      if(req.method === "PUT"){
        const body = await readBody(req);
        if(!body || typeof body !== "object") return json({ error:"bad body" }, 400);
        for(const c of DATA_COLS) if(body[c] !== undefined) await store.set(prefix + c, body[c]);
        return json({ ok:true });
      }
      return json({ error:"method not allowed" }, 405);
    }

    if(!DATA_COLS.includes(col)) return json({ error:"unknown collection" }, 404);
    if(req.method === "GET") return json(await store.get(prefix + col));
    if(req.method === "PUT"){
      const body = await readBody(req);
      if(body === null) return json({ error:"bad body" }, 400);
      await store.set(prefix + col, body);
      return json({ ok:true });
    }
    return json({ error:"method not allowed" }, 405);
  }

  /* 管理员查看所有用户数据 */
  async function handleAdminData(req, admin){
    const url = new URL(req.url);
    const col = url.pathname.slice(5);

    if(col !== "all-data") return json({ error:"unknown collection" }, 404);
    if(req.method !== "GET") return json({ error:"method not allowed" }, 405);

    const users = await auth.listUsers(admin);
    if(users.error) return json(users, 403);
    const result = {};
    for(const u of users){
      const prefix = "u_" + u.id + "_";
      result[u.id] = { user: u, data: {} };
      for(const c of DATA_COLS){
        result[u.id].data[c] = await store.get(prefix + c);
      }
    }
    return json(result);
  }
}

export { DATA_COLS };
