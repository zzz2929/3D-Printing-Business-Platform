/* 3D打印业务平台 — 离线缓存（应用壳）；/api 一律走网络，不缓存
   发版时：CACHE 版本号与 index.html 里静态资源的 ?v= 保持一致（换 URL 即换缓存） */
const CACHE = "3d-printing-business-v24";
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon.svg",
  "assets/style.css?v=24",
  "assets/store.js?v=24",
  "assets/app.js?v=24"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    // cache:"reload" 绕过 HTTP 缓存取最新文件——否则长 max-age 的 /assets 会被原样复制进新版本缓存，导致更新失效
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
  if (url.pathname.startsWith("/api/")) return; // 数据实时读写，绝不缓存
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        const cp = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, cp).catch(() => {}));
        return resp;
      }).catch(() => caches.match("index.html"));
    })
  );
});
