/* 3D打印业务平台 Vercel Serverless 宿主（api/[col].js 捕获 /api/*）
   持久存储：默认 ephemeral（重启即失），生产使用请在项目环境变量配置
   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN（Upstash Redis 控制台可免费创建） */
import { createRouter } from "../server/router.mjs";
import { upstashStore, memoryStore } from "../server/stores.mjs";

const router = createRouter(upstashStore(process.env) || memoryStore(), process.env.APP_PASSWORD);

export default async function handler(req, res){
  const webReq = new Request("https://vercel.local" + req.url, {
    method: req.method,
    headers: { "content-type": req.headers["content-type"] || "" },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req
  });
  const out = await router(webReq);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(out.body ? Buffer.from(await out.arrayBuffer()) : null);
}
