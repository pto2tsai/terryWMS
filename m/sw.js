// Terry WMS 手機版 Service Worker
// 網路優先：有網路一律拿最新版（避免舊版卡在手機上）；沒網路才用快取，讓畫面還能打開
// Firebase 資料不經過這裡（由 Firestore SDK 自己處理）
const CACHE = 'wms-m-v1';

self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(event) {
    event.waitUntil(caches.keys().then(function(keys) {
        return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); }));
});

self.addEventListener('fetch', function(event) {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const cacheable = url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com' ||
        (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0);
    if (!cacheable) return;
    event.respondWith(fetch(req).then(function(res) {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function(c) { c.put(req, copy); }); }
        return res;
    }).catch(function() {
        return caches.match(req).then(function(hit) { return hit || Response.error(); });
    }));
});
