/* 3D打印业务平台 Cloudflare Workers 宿主
   部署前创建 KV 并绑定（见 README）：
     npx wrangler kv namespace create DATA
   然后把输出的 id 填入 wrangler.jsonc 的 kv_namespaces */
import { createRouter } from "./server/router.mjs";
import { kvStore, memoryStore } from "./server/stores.mjs";

const handle = createRouter(null); // 在 fetch 内按环境装配 store

export default {
  async fetch(req, env){
    if(new URL(req.url).pathname.startsWith("/api/")){
      const store = env.DATA ? kvStore(env.DATA) : memoryStore();
      const res = await createRouter(store, env.APP_PASSWORD)(req);
      if(!env.DATA && new URL(req.url).pathname.startsWith("/api/")){
        const warn = new Response(res.body, res);
        warn.headers.set("x-storage-warning", "KV binding DATA missing - data is memory-only");
        return warn;
      }
      return res;
    }
    return env.ASSETS.fetch(req);
  }
};
