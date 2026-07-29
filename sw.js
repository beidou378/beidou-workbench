// 北斗星工作台 Service Worker v5 — 完整 PWA 离线支持
const CACHE = "beidou-v10";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

// 安装：预缓存应用外壳
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

// 激活：清理旧缓存，立即接管
self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      ),
    ])
  );
});

// 拦截请求
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 跨域资源（行情API/视频CDN/图表库）：网络优先，失败不缓存
  if (url.origin !== self.location.origin) {
    // 对 Chart.js CDN 做一次缓存（长期不变）
    if (url.hostname === "cdn.jsdelivr.net") {
      e.respondWith(
        caches.match(req).then((cached) => {
          return cached || fetch(req).then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }).catch(() => cached);
        })
      );
      return;
    }
    e.respondWith(fetch(req).catch(() => new Response("", { status: 504 })));
    return;
  }

  // 页面导航（HTML）：网络优先，保证更新即时可见；离线时回退缓存
  if (req.mode === "navigate" || req.destination === "document") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // 其他同源资源：Cache-First（离线可用），后台静默更新
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
