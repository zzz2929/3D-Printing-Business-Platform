/* 3D打印业务平台 — 离线缓存（应用壳）；/api 一律走网络，不缓存
   抓取策略：网络优先（服务器可达时普通刷新即拿到最新前端，无需强制刷新），离线回退缓存；
   发版时：CACHE 版本号与 index.html 里静态资源的 ?v= 保持一致（换 URL 即换缓存） */
const CACHE = "3d-printing-business-v67";
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon.svg",
  "assets/vendor/flatpickr/flatpickr.min.css?v=64",
  "assets/vendor/flatpickr/flatpickr.min.js?v=64",
  "assets/vendor/flatpickr/zh.js?v=64",
  "assets/style.css?v=64",
  "assets/store.js?v=64",
  "assets/app.js?v=67"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    // cache:"reload" 绕过 HTTP 缓存取最新文件——否则旧的 /assets 响应会被原样复制进新版本缓存，导致更新失效
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) =>
      Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/__reload") return; // 数据与刷新通道实时读写，绝不拦截
  // 网络优先：服务器可达时始终拿最新文件；离线或服务不可达时回退缓存（PWA 离线可用），导航失败再回退 index.html
  e.respondWith(
    fetch(req).then((resp) => {
      if (resp && resp.ok) {
        const cp = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
      }
      return resp;
    }).catch(() =>
      caches.match(req).then((m) => m || (req.mode === "navigate" ? caches.match("index.html") : undefined))
    )
  );
});
