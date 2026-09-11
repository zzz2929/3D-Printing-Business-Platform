/* PrintForge 后端核心 · 与运行时无关的 API 路由
   存储适配器只需实现：{ get(col) -> any, set(col, val) }
   集合：materials / printers / records / orders / settings / achievements
   特殊集合：data（读写全部）、auth（密码记录，仅服务端内部使用，不对外暴露）
   鉴权：createAuth(store, envPw)（server/auth.mjs）；已配置密码时，除
   auth/login/logout/setup 外的所有 /api/* 都需要有效会话 Cookie */

import { createAuth, verifyToken, issueToken, tokenCookie, CLEAR_COOKIE } from "./auth.mjs";
import { appVersion } from "./version.mjs";

const COLS = ["materials", "printers", "records", "orders", "settings", "achievements"];

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
    const col = url.pathname.slice(5);

    /* ---- 版本信息（无需会话） ---- */
    if(col === "version" && req.method === "GET"){
      return json(appVersion());
    }

    /* ---- 鉴权相关端点（无需会话） ---- */
    if(col === "auth" && req.method === "GET"){
      const configured = await auth.configured();
      const ok = configured ? await verifyToken(auth, req) : true;
      return json({ required:configured, ok, setup:!configured });
    }
    if(col === "login" && req.method === "POST"){
      const body = await readBody(req);
      if(!(await auth.configured())) return json({ error:"未配置密码，请先完成初始设置" }, 400);
      if(!(await auth.verify(body && body.password))) return json({ error:"密码错误" }, 401);
      return json({ ok:true }, 200, { "set-cookie": tokenCookie(await issueToken(auth)) });
    }
    if(col === "logout" && req.method === "POST"){
      return json({ ok:true }, 200, { "set-cookie": CLEAR_COOKIE });
    }
    if(col === "setup" && req.method === "POST"){
      if(await auth.configured()) return json({ error:"密码已配置，无法重复设置" }, 403);
      const body = await readBody(req);
      try{ await auth.setup(body && body.password); }
      catch(e){ return json({ error:e.message }, 400); }
      return json({ ok:true }, 200, { "set-cookie": tokenCookie(await issueToken(auth)) });
    }

    /* ---- 会话守卫：已配置密码时拦截全部数据端点 ---- */
    if((await auth.configured()) && !(await verifyToken(auth, req))){
      return json({ error:"未登录或会话已过期" }, 401, { "www-authenticate": "Session" });
    }

    /* ---- 全量读写 ---- */
    if(col === "data"){
      if(req.method === "GET"){
        const all = {};
        for(const c of COLS) all[c] = await store.get(c);
        return json(all);
      }
      if(req.method === "PUT"){
        const body = await readBody(req);
        if(!body || typeof body !== "object") return json({ error:"bad body" }, 400);
        for(const c of COLS) if(body[c] !== undefined) await store.set(c, body[c]);
        return json({ ok:true });
      }
      return json({ error:"method not allowed" }, 405);
    }

    if(!COLS.includes(col)) return json({ error:"unknown collection" }, 404);

    if(req.method === "GET") return json(await store.get(col));
    if(req.method === "PUT"){
      const body = await readBody(req);
      if(body === null) return json({ error:"bad body" }, 400);
      await store.set(col, body);
      return json({ ok:true });
    }
    return json({ error:"method not allowed" }, 405);
  };
}

export { COLS };
