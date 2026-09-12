/* 3D打印业务平台 后端核心 · 多用户版 API 路由
   存储适配器只需实现：{ get(col) -> any, set(col, val) }
   集合：materials / printers / records / orders / settings / achievements / users
   鉴权：createAuth(store, envPw)；已配置用户时，除 auth/* 外的所有 /api/* 都需要有效会话
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

export function createRouter(store, envPw){
  const auth = createAuth(store, envPw);

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
        return json(result, 200, { "set-cookie": tokenCookie(token) });
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
      return json(result, 200, { "set-cookie": tokenCookie(token) });
    }

    // 登出
    if(path === "logout" && req.method === "POST"){
      return json({ ok:true }, 200, { "set-cookie": CLEAR_COOKIE });
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

    if(path === "users" && req.method === "DELETE"){
      const operator = await auth.verify(req);
      if(!operator) return json({ error:"请先登录" }, 401);
      const userId = url.searchParams.get("id");
      if(!userId) return json({ error:"缺少用户ID" }, 400);
      const result = await auth.deleteUser(userId, operator);
      if(result.error) return json({ error:result.error }, 400);
      return json(result);
    }

    // DELETE /api/users/:id — path-based（匹配前端 store.js）
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
      return handleData(req, store, null);
    }

    // 需要登录
    const user = await auth.verify(req);
    if(!user) return json({ error:"未登录或会话已过期" }, 401, { "www-authenticate": "Session" });

    // 管理员可访问所有用户数据
    if(user.role === "admin" && url.searchParams.has("allUsers")){
      return handleAdminData(req, store, user);
    }

    return handleData(req, store, user);
  };

  /* 处理用户数据 */
  async function handleData(req, store, user){
    const url = new URL(req.url);
    let col = url.pathname.slice(5);

    // 未登录 -> 开放模式，使用默认数据
    if(!user){
      if(!DATA_COLS.includes(col)) return json({ error:"unknown collection" }, 404);
      if(req.method === "GET") return json(await store.get(col));
      if(req.method === "PUT"){
        const body = await readBody(req);
        if(body === null) return json({ error:"bad body" }, 400);
        await store.set(col, body);
        return json({ ok:true });
      }
      return json({ error:"method not allowed" }, 405);
    }

    // 登录用户 -> 使用用户专属数据
    const userPrefix = "u_" + user.id + "_";
    
    if(col === "data"){
      if(req.method === "GET"){
        const all = {};
        for(const c of DATA_COLS) all[c] = await store.get(userPrefix + c);
        return json(all);
      }
      if(req.method === "PUT"){
        const body = await readBody(req);
        if(!body || typeof body !== "object") return json({ error:"bad body" }, 400);
        for(const c of DATA_COLS) if(body[c] !== undefined) await store.set(userPrefix + c, body[c]);
        return json({ ok:true });
      }
      return json({ error:"method not allowed" }, 405);
    }

    if(!DATA_COLS.includes(col)) return json({ error:"unknown collection" }, 404);
    if(req.method === "GET") return json(await store.get(userPrefix + col));
    if(req.method === "PUT"){
      const body = await readBody(req);
      if(body === null) return json({ error:"bad body" }, 400);
      await store.set(userPrefix + col, body);
      return json({ ok:true });
    }
    return json({ error:"method not allowed" }, 405);
  }

  /* 管理员查看所有用户数据 */
  async function handleAdminData(req, store, admin){
    const url = new URL(req.url);
    const col = url.pathname.slice(5);

    if(col !== "all-data") return json({ error:"unknown collection" }, 404);
    if(req.method !== "GET") return json({ error:"method not allowed" }, 405);

    const users = await auth.listUsers(admin);
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
