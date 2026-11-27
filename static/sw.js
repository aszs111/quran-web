// يحفظ ملفات المصحف في المتصفح ليعمل بلا إنترنت بعد أول فتح
const VERSION = '__BUILD__';
const SHELL = `shell-${VERSION}`, DATA = 'data-v1';
const SHELL_FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'fonts/markazi.woff2', 'fonts/bsml.ttf', 'icons/crown.png',
  'data/mushaf.json', 'data/text.json', 'fonts/hafs.woff2', 'data/surahs.json', 'data/ayah_counts.json', 'data/line_widths.json', 'data/page_stroke.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isData = /\/(fonts\/p\d+\.woff2|data\/(saadi|gharib)\/|scan\/\d+\.webp)/.test(url.pathname);
  if (isData) {
    // خطوط الصفحات وصورها والتفسير: من المحفوظ أولًا
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
  } else {
    // واجهة التطبيق: من الشبكة أولًا ليصل التحديث، ومن المحفوظ عند انقطاع الإنترنت
    // الصفحة نفسها تُطلب دائمًا من الخادم متجاوزةً ذاكرة المتصفح (وإلا بقيت النسخة القديمة عشر دقائق بعد النشر)
    const page = e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
    const req = page ? fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request);
    e.respondWith(req.then(r => {
      if (r.ok) caches.open(SHELL).then(c => c.put(e.request, r.clone()));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
