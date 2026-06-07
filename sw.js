/**
 * Service Worker
 * 提供离线缓存支持，让 PWA 可以离线使用
 */

const CACHE_NAME = 'jizhangben-v1';

// 需要缓存的静态资源
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './js/charts.js',
  './js/export.js',
  './manifest.json',
  './icons/icon.svg',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// 安装事件：预缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.log('部分资源缓存失败（CDN 可能需要网络）:', err);
      });
    })
  );
  // 立即激活
  self.skipWaiting();
});

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存优先策略
self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // 命中缓存，直接返回
      if (cached) return cached;

      // 未命中，发起网络请求
      return fetch(event.request).then((response) => {
        // 不缓存非成功的响应
        if (!response || response.status !== 200) return response;

        // 缓存成功的响应（克隆后再缓存，因为响应流只能读一次）
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });

        return response;
      }).catch(() => {
        // 网络不可用时，返回空响应（应用使用 IndexedDB 数据）
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
