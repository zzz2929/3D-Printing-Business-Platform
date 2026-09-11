/* 3D打印业务平台 存储适配器：file（Node/Docker/NAS）· kv（Cloudflare Workers）· upstash（Vercel 可选）· memory（兜底） */
import fs from "node:fs";

/* 文件存储：每集合一个 JSON，原子写入（临时文件 + rename） */
export function fileStore(dir){
  const cache = {};
  const path = col => dir + "/" + col + ".json";
  return {
    async get(col){
      if(col in cache) return cache[col];
      try{ return cache[col] = JSON.parse(fs.readFileSync(path(col), "utf8")); }
      catch(e){ return cache[col] = null; }
    },
    async set(col, val){
      cache[col] = val;
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path(col) + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(val, null, 2));
      fs.renameSync(tmp, path(col));
    }
  };
}

/* Cloudflare Workers KV */
export function kvStore(ns){
  if(!ns) return null;
  return {
    async get(col){
      const v = await ns.get("col:" + col);
      try{ return v == null ? null : JSON.parse(v); }catch(e){ return null; }
    },
    async set(col, val){ await ns.put("col:" + col, JSON.stringify(val)); }
  };
}

/* Upstash Redis REST（Vercel 等 serverless 平台的持久存储，配环境变量即启用） */
export function upstashStore(env){
  const url = env && env.UPSTASH_REDIS_REST_URL, token = env && env.UPSTASH_REDIS_REST_TOKEN;
  if(!url || !token) return null;
  const call = async (cmd, body) => {
    const r = await fetch(url + "/" + cmd.join("/"), {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "text/plain" },
      body: body == null ? "" : body
    });
    if(!r.ok) throw new Error("upstash " + r.status);
    const j = await r.json();
    return j.result;
  };
  return {
    async get(col){
      const v = await call(["get", "pf:" + col]);
      try{ return v == null ? null : JSON.parse(v); }catch(e){ return null; }
    },
    async set(col, val){ await call(["set", "pf:" + col], JSON.stringify(val)); }
  };
}

/* 内存兜底（进程生命周期内有效） */
export function memoryStore(){
  const mem = {};
  return {
    async get(col){ return col in mem ? mem[col] : null; },
    async set(col, val){ mem[col] = val; }
  };
}
