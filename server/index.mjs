/* 3D打印业务平台 Node 宿主：静态文件 + REST API + 文件存储
   环境变量：PORT（默认 2929）、DATA_DIR（默认 ./data）、NO_WATCH=1 关闭「保存即刷新」 */
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { watch } from "node:fs";
import crypto from "node:crypto";
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
        // 静态资源统一协商缓存：每次加载都向服务器校验，文件一改普通刷新即生效（无需 Ctrl+F5）
        "cache-control": "no-cache"
      }
    });
  }catch(e){
    return new Response("Not Found", { status: 404 });
  }
}

/* ---------- 保存即刷新：监听前端文件变更，经 SSE 通知浏览器自动 reload ----------
   内容哈希去重（编辑器临时文件/重复事件不触发），600ms 防抖；NO_WATCH=1 可关闭。 */
function createReloadHub(){
  const clients = new Set();
  let lastSig = "", timer = null, scanning = false;
  const ROOT_FILES = ["index.html", "sw.js", "manifest.webmanifest", "icon.svg"];
  const fileHash = async f => {
    try{ return crypto.createHash("md5").update(await readFile(f)).digest("hex"); }
    catch(e){ return "gone"; }
  };
  const listFiles = async () => {
    const out = [];
    const walk = async dir => {
      for(const name of await readdir(dir, { withFileTypes: true })){
        const p = path.join(dir, name.name);
        if(name.isDirectory()) await walk(p); else out.push(p);
      }
    };
    try{ await walk(path.join(ROOT, "assets")); }catch(e){}
    for(const f of ROOT_FILES) out.push(path.join(ROOT, f));
    return out;
  };
  const scan = async () => {
    const files = await listFiles();
    const parts = await Promise.all(files.map(async f => path.relative(ROOT, f) + ":" + await fileHash(f)));
    return parts.sort().join("|");
  };
  const broadcast = () => {
    const msg = "data: " + JSON.stringify({ reload: true, at: Date.now() }) + "\n\n";
    for(const res of clients){ try{ res.write(msg); }catch(e){ clients.delete(res); } }
    console.log("[3d-printing-business] 前端文件变更，已通知 " + clients.size + " 个页面自动刷新");
  };
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if(scanning) return;
      scanning = true;
      try{
        const sig = await scan();
        if(sig !== lastSig){ lastSig = sig; broadcast(); }
      }catch(e){}
      scanning = false;
    }, 600);
  };
  scan().then(sig => { lastSig = sig; }).catch(() => {});
  try{
    watch(path.join(ROOT, "assets"), { recursive: true }, onChange);
    for(const f of ROOT_FILES) watch(path.join(ROOT, f), onChange);
  }catch(e){ console.log("[3d-printing-business] 文件监听不可用，自动刷新停用（" + e.message + "）"); }
  return (req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "connection": "keep-alive"
    });
    res.write("retry: 5000\n\n");
    clients.add(res);
    const keep = setInterval(() => { try{ res.write(": ping\n\n"); }catch(e){} }, 25000);
    req.on("close", () => { clearInterval(keep); clients.delete(res); });
  };
}

const reloadHub = process.env.NO_WATCH === "1" ? null : createReloadHub();

const server = http.createServer(async (req, res) => {
  try{
    if(reloadHub && req.url.split("?")[0] === "/__reload") return reloadHub(req, res);
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
