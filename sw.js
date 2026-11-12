// 報修登記 PWA 的 service worker
// - 網頁本身（HTML、CSS、JS、圖示）離線也能打開。
// - 一律「網路優先」：有網路時拿最新版本（例如 config.js 換了 Supabase 專案會立刻生效），
//   沒網路時才用快取。
// - Supabase 的資料請求完全不經過快取，報修資料一定是即時的。
// - 只處理本頁需要的檔案；continuous-beam/ 等其他子資料夾由它們自己處理。

const CACHE_PREFIX = "repair-";
const VERSION = CACHE_PREFIX + "v1"; // 檔案清單或快取方式改變時，把數字加 1
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];
// 固定版本的程式庫，內容不會變，可以「快取優先」
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

const SCOPE_PATH = new URL("./", self.location).pathname;

// 這個請求是否屬於報修頁：根目錄的檔案，或 icons/ 裡的圖示
function isOwnAsset(url) {
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return false;
  const rest = url.pathname.slice(SCOPE_PATH.length);
  return !rest.includes("/") || rest.startsWith("icons/");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    try {
      await cache.add(new Request(SUPABASE_JS, { mode: "cors", credentials: "omit" }));
    } catch (e) {
      // 下載失敗沒關係，第一次正常載入頁面時會再存
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 只刪除報修頁自己的舊快取，不動同網域其他應用程式的快取
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== VERSION) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(fallbackKey || request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(fallbackKey || request, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // 送出報修（POST）直接走網路

  const url = new URL(req.url);

  if (req.url === SUPABASE_JS) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (!isOwnAsset(url)) return; // Supabase 資料、其他網站、其他子資料夾：不處理

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "./index.html"));
    return;
  }

  event.respondWith(networkFirst(req));
});
