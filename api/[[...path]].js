/* 3D打印业务平台 Vercel Serverless 宿主（api/[[...path]].js 捕获 /api/*）
   持久存储：默认 ephemeral（重启即失），生产使用请在项目环境变量配置
   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN（Upstash Redis 控制台可免费创建） */
import { createRouter } from "../server/router.mjs";
import { upstashStore, memoryStore } from "../server/stores.mjs";

const router = createRouter(upstashStore(process.env) || memoryStore());

async function readBody(req){
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res){
  const headers = {};
  for(const k of Object.keys(req.headers)){
    const v = req.headers[k];
    headers[k] = Array.isArray(v) ? v.join(", ") : v; // cookie 等头必须透传，否则会话验证失败
  }
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
  const webReq = new Request("https://vercel.local" + req.url, { method: req.method, headers, body });
  const out = await router(webReq);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(out.body ? Buffer.from(await out.arrayBuffer()) : null);
}
