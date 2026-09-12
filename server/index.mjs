/* 3D打印业务平台 Node 宿主：静态文件 + REST API + 文件存储
   环境变量：PORT（默认 2929）、DATA_DIR（默认 ./data） */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRouter } from "./router.mjs";
import { fileStore } from "./stores.mjs";
import { createMailer } from "./mailer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 2929;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");

const store = fileStore(DATA_DIR);
const handle = createRouter(store, createMailer(process.env, () => store.get("smtp")));

/* 静态资源白名单：数据目录与源码一律不对外提供 */
const STATIC_FILES = new Set(["/index.html", "/sw.js", "/manifest.webmanifest", "/icon.svg", "/version.json"]);
const STATIC_PREFIXES = ["/assets/"];

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon"
};

async function serveStatic(urlPath){
  let rel;
  try{ rel = decodeURIComponent(urlPath.split("?")[0]); }catch(e){ rel = ""; }
  if(rel === "/" || rel === "") rel = "/index.html";
  const allowed = STATIC_FILES.has(rel) || STATIC_PREFIXES.some(p => rel.startsWith(p));
  if(!allowed) return new Response("Not Found", { status: 404 });
  const file = path.resolve(ROOT, "." + rel);
  if(file !== ROOT && !file.startsWith(ROOT + path.sep)) return new Response("Forbidden", { status: 403 });
  try{
    const data = await readFile(file);
    return new Response(data, {
      headers: {
        "content-type": MIME[path.extname(file)] || "application/octet-stream",
        "cache-control": rel.startsWith("/assets/") ? "public, max-age=604800" : "no-cache"
      }
    });
  }catch(e){
    return new Response("Not Found", { status: 404 });
  }
}

const server = http.createServer(async (req, res) => {
  try{
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readStream(req);
    const headers = {};
    for(const k of Object.keys(req.headers)) headers[k] = req.headers[k];
    const webReq = new Request("http://localhost" + req.url, {
      method: req.method,
      headers,
      body
    });
    const apiRes = await handle(webReq);
    const out = apiRes || await serveStatic(req.url);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    const buf = out.body ? Buffer.from(await out.arrayBuffer()) : null;
    res.end(buf);
  }catch(err){
    console.error("[3d-printing-business]", err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "internal error" }));
  }
});

const MAX_BODY = 10 * 1024 * 1024; // 10MB，防止超大请求体耗尽内存

function readStream(req){
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => {
      size += c.length;
      if(size > MAX_BODY){ req.destroy(); reject(new Error("request body too large")); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

server.on("error", err => {
  if(err.code === "EADDRINUSE"){
    console.error("启动失败：端口 " + PORT + " 已被占用。");
    console.error("可能已有一个 3D打印业务平台 在运行；或换一个端口：PORT=8081 npm start");
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log("3D打印业务平台 服务已启动 → http://localhost:" + PORT + "（数据目录：" + DATA_DIR + "）");
});
