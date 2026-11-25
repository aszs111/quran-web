'use strict';
/* مثاني — نسخة المتصفح من المصحف
   عرض متصل لصفحات مصحف المدينة بخطوط مجمع الملك فهد (QPC V1)، مع التمرير التلقائي،
   والتلاوة، وتفسير السعدي، ومعاني الكلمات، وعلامة الوقوف. */

const $ = s => document.querySelector(s);
const scroller = $('#scroller'), pagesEl = $('#pages');
const tscroller = $('#tscroller'), tpagesEl = $('#tpages');
const cur = () => mode === 'text' ? tscroller : scroller;
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let mode = store.get('mode', 'pages'); // pages | text
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad3 = n => String(n).padStart(3, '0');

const JUZ = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],
  [18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
const JUZ_NAMES = ['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع','العاشر','الحادي عشر',
  'الثاني عشر','الثالث عشر','الرابع عشر','الخامس عشر','السادس عشر','السابع عشر','الثامن عشر','التاسع عشر','العشرون',
  'الحادي والعشرون','الثاني والعشرون','الثالث والعشرون','الرابع والعشرون','الخامس والعشرون','السادس والعشرون',
  'السابع والعشرون','الثامن والعشرون','التاسع والعشرون','الثلاثون'];
const juzOf = (s, a) => { let j = 1; JUZ.forEach(([js, ja], i) => { if (s > js || (s === js && a >= ja)) j = i + 1; }); return j; };

const RECITERS = [
  ['مشاري راشد العفاسي', 'Alafasy_128kbps'], ['عبد الرحمن السديس', 'Abdurrahmaan_As-Sudais_192kbps'],
  ['سعود الشريم', 'Saood_ash-Shuraym_128kbps'], ['ماهر المعيقلي', 'Maher_AlMuaiqly_64kbps'],
  ['ياسر الدوسري', 'Yasser_Ad-Dussary_128kbps'], ['محمود خليل الحصري', 'Husary_64kbps'],
  ['محمد صديق المنشاوي (مرتل)', 'Minshawy_Murattal_128kbps'], ['عبد الباسط عبد الصمد (مرتل)', 'Abdul_Basit_Murattal_64kbps'],
  ['سعد الغامدي', 'Ghamadi_40kbps'], ['أبو بكر الشاطري', 'Abu_Bakr_Ash-Shaatree_128kbps'],
  ['هاني الرفاعي', 'Hani_Rifai_192kbps'], ['محمد الطبلاوي', 'Mohammad_al_Tablaway_128kbps'],
];

const BASE_STROKE = 0.004; // حدّة أساسية تضاف لكل الصفحات (em)

let D = null;            // البيانات
let L = null;            // مقاسات العرض
let bookmark = store.get('bookmark', null); // [s, a]
let selected = null;     // [s, a]

// ======================= التحميل =======================
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }

async function boot() {
  const [m, surahs, counts, widths, stroke] = await Promise.all([
    getJSON('data/mushaf.json'), getJSON('data/surahs.json'), getJSON('data/ayah_counts.json'),
    getJSON('data/line_widths.json'), getJSON('data/page_stroke.json'),
  ]);
  D = { pages: m.pages, surahs, counts, widths, stroke, ayahPage: new Map(), surahPage: new Array(115).fill(0) };
  D.pages.forEach((lines, i) => lines.forEach(l => {
    if (l[0] === 'h' && !D.surahPage[l[1]]) D.surahPage[l[1]] = i + 1;
    if (l[0] === 't') l[1].forEach(w => { const k = w[0] + ':' + w[1]; if (!D.ayahPage.has(k)) D.ayahPage.set(k, i + 1); });
  }));
  D.surahPage[1] = 1;
  layout();
  const pos = store.get('pos', 0);
  goToPos(pos);
  $('#loading').remove();
  onScroll();
  if (mode === 'text') {
    mode = 'pages'; await setMode('text');
    const tp = store.get('tpos', null); if (tp) goToAyah(tp[0], tp[1]);
    // نعيد حساب الشريط العلوي بعد استقرار الصفحة
    lastHeader = ''; requestAnimationFrame(() => requestAnimationFrame(updateTextHeader));
    setTimeout(() => { lastHeader = ''; updateTextHeader(); }, 2200);
  }
  if (bookmark || W.plan) showStartCards(); else if (!store.get('hideTips', false)) showTips();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ======================= المقاسات =======================
function layout() {
  const vw = Math.min(document.documentElement.clientWidth, 760);
  const hpad = 10, avail = vw - hpad * 2;
  const lh = avail * 0.112;
  const fonts = [], tops = [], heights = [];
  const fit = p => avail / Math.max(...D.widths[p - 1], 1);
  let y = 0;
  for (let p = 1; p <= 604; p++) {
    let f = fit(p);
    if (p <= 2) f = Math.min(f, fit(3)); // صفحتا الفاتحة وأول البقرة بحجم بقية المصحف
    fonts.push(f);
    const h = 6 + D.pages[p - 1].length * lh + 8;
    tops.push(y); heights.push(h); y += h;
  }
  L = { vw, hpad, avail, lh, fonts, tops, heights, total: y };
  pagesEl.style.width = vw + 'px';
  pagesEl.style.height = y + 'px';
  pagesEl.style.setProperty('--hpad', hpad + 'px');
  pagesEl.style.setProperty('--lh', lh + 'px');
  pagesEl.innerHTML = '';
  rendered.clear();
}

function pageAt(y) { // بحث ثنائي
  let lo = 0, hi = 603;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L.tops[mid] <= y) lo = mid; else hi = mid - 1; }
  return lo;
}
function currentPos() {
  const c = scroller.scrollTop + scroller.clientHeight / 2, i = pageAt(c);
  return i + Math.min(0.999, Math.max(0, (c - L.tops[i]) / L.heights[i]));
}
function goToPos(pos) {
  const i = Math.floor(pos), f = pos - i;
  scroller.scrollTop = L.tops[i] + f * L.heights[i] - scroller.clientHeight / 2;
}
function goToPage(p) { scroller.scrollTop = L.tops[p - 1]; }
function goToAyah(s, a, center = false) {
  if (mode !== 'text') { goToPage(D.ayahPage.get(s + ':' + a)); return; }
  const el = tpagesEl.querySelector(`.ta[data-a="${s}:${a}"]`) || tpagesEl.querySelector(`.tp[data-p="${TX.ayahPage.get(s + ':' + a)}"]`);
  if (el) el.scrollIntoView({ block: center ? 'center' : 'start' });
}
function goToPageAny(p) {
  if (mode !== 'text') return goToPage(p);
  const el = tpagesEl.querySelector(`.tp[data-p="${p}"]`); if (el) el.scrollIntoView({ block: 'start' });
}

// ======================= رسم الصفحات =======================
const rendered = new Map();
const fontState = new Map(); // p -> Promise

function loadPageFont(p) {
  if (!fontState.has(p)) {
    const ff = new FontFace('p' + p, `url(fonts/p${pad3(p)}.woff2) format("woff2")`, { display: 'block' });
    fontState.set(p, ff.load().then(f => { document.fonts.add(f); }).catch(() => fontState.delete(p)));
  }
  return fontState.get(p);
}

const isBm = (s, a) => bookmark && bookmark[0] === s && bookmark[1] === a;
const isSel = (s, a) => selected && selected[0] === s && selected[1] === a;

function pageHTML(p) {
  const lines = D.pages[p - 1], widths = D.widths[p - 1], max = Math.max(...widths, 1);
  let ti = 0, h = '';
  for (const l of lines) {
    if (l[0] === 'h') { h += `<div class="ln"><div class="sh">سورة ${D.surahs[l[1] - 1]}</div></div>`; continue; }
    if (l[0] === 'b') { h += `<div class="ln"><div class="bsml">${esc(l[1])}</div></div>`; continue; }
    const just = p > 2 && widths[ti++] >= max * 0.8;
    h += `<div class="ln ${just ? 'j' : 'c'}">`;
    for (const [s, a, wi, raw] of l[1]) {
      const sp = raw.lastIndexOf(' ');
      const g = sp < 0 ? raw : raw.slice(0, sp), mk = sp < 0 ? null : raw.slice(sp + 1);
      const cls = isBm(s, a) ? ' bm' : isSel(s, a) ? ' sel' : '';
      h += `<span class="w${cls}" data-a="${s}:${a}" data-w="${wi}">${esc(g)}</span>`;
      if (mk) h += `<span class="m${isBm(s, a) ? ' bm' : ''}" data-a="${s}:${a}">${esc(mk)}</span>`;
    }
    h += '</div>';
  }
  return h;
}

function renderPage(p) {
  if (rendered.has(p)) return;
  const el = document.createElement('div');
  el.className = 'page';
  el.dataset.p = p;
  const fpx = L.fonts[p - 1];
  el.style.cssText = `top:${L.tops[p - 1]}px;height:${L.heights[p - 1]}px;font-family:p${p},bsml;font-size:${fpx}px;` +
    `--st:${((D.stroke[p - 1] + BASE_STROKE) * fpx).toFixed(3)}px;visibility:hidden`;
  el.innerHTML = pageHTML(p);
  pagesEl.appendChild(el);
  rendered.set(p, el);
  loadPageFont(p).then(() => { el.style.visibility = ''; });
}

function updateVisible() {
  const top = scroller.scrollTop, bottom = top + scroller.clientHeight;
  const a = Math.max(1, pageAt(top) + 1 - 2), b = Math.min(604, pageAt(bottom) + 1 + 2);
  for (let p = a; p <= b; p++) renderPage(p);
  for (const [p, el] of rendered) if (p < a - 2 || p > b + 2) { el.remove(); rendered.delete(p); }
  for (let p = b + 1; p <= Math.min(604, b + 4); p++) loadPageFont(p); // تحميل مسبق
}

function lineRef(p, idx) {
  const lines = D.pages[p - 1];
  for (let k = idx; k >= 0; k--) {
    const l = lines[k];
    if (l[0] === 't') { const w = l[1][l[1].length - 1]; return [w[0], w[1]]; }
    if (l[0] === 'h') return [l[1], 1];
  }
  for (let k = idx; k < lines.length; k++) {
    const l = lines[k];
    if (l[0] === 't') return [l[1][0][0], l[1][0][1]];
    if (l[0] === 'h') return [l[1], 1];
  }
  return [1, 1];
}

let lastHeader = '';
function updateHeader() {
  if (mode === 'text') return updateTextHeader();
  const pos = currentPos(), i = Math.floor(pos), p = i + 1;
  const [s, a] = lineRef(p, Math.floor((pos - i) * D.pages[i].length));
  const key = s + '|' + p + '|' + juzOf(s, a);
  if (key === lastHeader) return;
  lastHeader = key;
  $('#hSurah').textContent = D.surahs[s - 1];
  $('#hPage').textContent = String(p); // أرقام لاتينية
  $('#hJuz').textContent = 'الجزء ' + juzOf(s, a); // رقم لاتيني قصير لا ينقطع
}

let scrollQueued = false, saveTimer = 0;
function onScroll() {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    updateVisible(); updateHeader();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set('pos', currentPos()), 400);
  });
}
scroller.addEventListener('scroll', onScroll, { passive: true });
let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!D) return; const pos = currentPos(); layout(); goToPos(pos); onScroll(); }, 150);
});

// ======================= وضع النص (الرسم العثماني بخط حفص من مجمع الملك فهد) =======================
const TX = { built: false, ayahPage: new Map(), juz: new Map(), size: store.get('tsize', 26) };
function tsize(v) {
  TX.size = Math.max(16, Math.min(64, v));
  tpagesEl.style.setProperty('--tsize', TX.size + 'px');
  store.set('tsize', TX.size);
}
async function buildText() {
  if (TX.built) return;
  const pages = await getJSON('data/text.json');
  const ff = new FontFace('hafs', 'url(fonts/hafs.woff2) format("woff2")', { display: 'block' });
  await ff.load(); document.fonts.add(ff);
  let h = '';
  pages.forEach((ays, pi) => {
    const p = pi + 1;
    h += `<section class="tp" data-p="${p}"><p class="tx">`;
    for (const [s, a, j, t] of ays) {
      TX.ayahPage.set(s + ':' + a, p); TX.juz.set(s + ':' + a, j);
      if (a === 1) {
        h += `</p><div class="tsh"><div class="sh">سورة ${D.surahs[s - 1]}</div></div>`;
        if (s !== 1 && s !== 9) h += `<div class="tbs">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>`;
        h += `<p class="tx">`;
      }
      const k = t.lastIndexOf('\u00a0');
      const body = k > 0 ? t.slice(0, k) : t, num = k > 0 ? t.slice(k + 1) : '';
      const cls = isBm(s, a) ? ' bm' : '';
      h += `<span class="ta${cls}" data-a="${s}:${a}">${esc(body)}\u00a0<span class="tm" data-a="${s}:${a}">${esc(num)}</span></span> `;
    }
    h += `</p><div class="pmark"><span>${p}</span></div></section>`;
  });
  tpagesEl.innerHTML = h.replace(/<p class="tx"><\/p>/g, '');
  tsize(TX.size);
  TX.built = true;
}
function textAyahAtCenter() {
  const r = tscroller.getBoundingClientRect();
  for (const dy of [0, -20, 20, -40, 40, -80, 80]) {
    // elementsFromPoint يتجاوز ما فوق النص (الشاشة الافتتاحية، بطاقة التلميح)
    for (const el of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2 + dy)) {
      const ta = el.closest && el.closest('.ta');
      if (ta) return ta;
    }
  }
  return null;
}
let lastTA = null;
function updateTextHeader() {
  const ta = textAyahAtCenter() || lastTA; if (!ta) return;
  lastTA = ta;
  const [s, a] = ref(ta); const k = s + ':' + a;
  const p = TX.ayahPage.get(k), j = TX.juz.get(k);
  const key = 't' + s + '|' + p + '|' + j; if (key === lastHeader) return; lastHeader = key;
  $('#hSurah').textContent = D.surahs[s - 1];
  $('#hPage').textContent = String(p);
  $('#hJuz').textContent = 'الجزء ' + j;
  store.set('tpos', [s, a]);
}
tscroller.addEventListener('scroll', () => { requestAnimationFrame(updateTextHeader); }, { passive: true });

async function setMode(m) {
  // نحتفظ بموضع القراءة عند التبديل
  let at;
  if (mode === 'text') { const ta = textAyahAtCenter(); at = ta ? ref(ta) : store.get('tpos', [1, 1]); }
  else { const pos = currentPos(), i = Math.floor(pos); at = lineRef(i + 1, Math.floor((pos - i) * D.pages[i].length)); }
  if (m === 'text') { $('#loading2').hidden = false; await buildText(); $('#loading2').hidden = true; }
  mode = m; store.set('mode', m);
  scroller.hidden = m === 'text'; tscroller.hidden = m !== 'text';
  $('#hMode').classList.toggle('on', m === 'text');
  lastHeader = '';
  goToAyah(at[0], at[1]);
  if (m === 'text') updateTextHeader(); else onScroll();
}
$('#hMode').onclick = () => setMode(mode === 'text' ? 'pages' : 'text');

// التكبير والتصغير بإصبعين، مع إبقاء الآية التي في الوسط مكانها
const pinch = { active: false, d0: 0, s0: 0 };
const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
tscroller.addEventListener('touchstart', e => {
  if (e.touches.length === 2) { pinch.active = true; pinch.d0 = dist(e.touches); pinch.s0 = TX.size; clearTimeout(G.timer); }
}, { passive: true });
let pinchRaf = 0;
tscroller.addEventListener('touchmove', e => {
  if (!pinch.active || e.touches.length !== 2) return;
  e.preventDefault();
  const want = pinch.s0 * dist(e.touches) / pinch.d0;
  cancelAnimationFrame(pinchRaf);
  pinchRaf = requestAnimationFrame(() => zoomKeepingCenter(want));
}, { passive: false });
tscroller.addEventListener('touchend', e => { if (e.touches.length < 2) setTimeout(() => { pinch.active = false; }, 50); });
tscroller.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoomKeepingCenter(TX.size * (e.deltaY < 0 ? 1.08 : 0.93)); } }, { passive: false });
function zoomKeepingCenter(v) {
  const ta = textAyahAtCenter(); const r = tscroller.getBoundingClientRect();
  const before = ta ? ta.getBoundingClientRect().top - r.top : 0;
  tsize(Math.round(v));
  if (ta) tscroller.scrollTop += (ta.getBoundingClientRect().top - r.top) - before;
}

// ======================= ملء الشاشة دون شريط العنوان =======================
// المتصفح لا يسمح بملء الشاشة إلا بعد لمسة من المستخدم، فنطلبه مع أول لمسة.
// (Safari على الآيفون لا يدعم هذا؛ الحل هناك «إضافة إلى الشاشة الرئيسية»)
// مثبت على الشاشة الرئيسية (لا ملء شاشة طلبناه نحن)
const isStandalone = () => navigator.standalone || (matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches && !inFull());
const canFull = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const inFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function enterFull() {
  const el = document.documentElement;
  try { (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' })?.catch?.(() => {}); } catch {}
}
function exitFull() { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch {} }
// لا ملء شاشة تلقائي؛ يُطلب يدويًا فقط من زر فهرس السور

// ======================= إبقاء الشاشة مضاءة أثناء القراءة =======================
// Screen Wake Lock: يدعمه Chrome على الأندرويد وSafari على الآيفون (iOS 16.4 فما بعده)؛ يُطلب من جديد عند العودة للتطبيق
let wakeLock = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !wakeLock) keepAwake(); });
// بعض المتصفحات لا تقبل الطلب إلا بعد لمسة من المستخدم
document.addEventListener('pointerdown', () => { if (!wakeLock) keepAwake(); }, { passive: true });
keepAwake();

// ======================= الورد: ختمة بمدة يحددها القارئ، ومتابعة القراءة، وتقارير =======================
// الصفحة تُحسب مقروءة إذا بقيت في وسط الشاشة ٢٠ ثانية أو أكثر (مجموعة في اليوم)، والوقت يُحسب إذا كان القارئ نشطًا
const WIRD_READ_SECS = 20, TICK = 5;
const W = {
  plan: store.get('wirdPlan', null),      // {start:'YYYY-MM-DD', days:N, from:p, done:0}
  log: store.get('wirdLog', {}),          // {'YYYY-MM-DD': {secs:n, pages:{p:secs}}}
  khatmas: store.get('wirdKhatmas', 0),
  lastAct: 0,
};
const today = (d = new Date()) => { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const dayAdd = (iso, k) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + k); return today(d); };
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const niceDate = iso => { const d = new Date(iso + 'T12:00:00'); return `${DAYNAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; };
const DAYNAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
function wirdSave() { store.set('wirdPlan', W.plan); store.set('wirdLog', W.log); store.set('wirdKhatmas', W.khatmas); }
['scroll', 'pointerdown'].forEach(ev => document.addEventListener(ev, () => { W.lastAct = Date.now(); }, { passive: true, capture: true }));

function currentLayoutPage() {
  if (mode === 'text') { const ta = textAyahAtCenter(); return ta ? D.ayahPage.get(ta.dataset.a) : 0; }
  return Math.floor(currentPos()) + 1;
}
setInterval(() => {
  if (!D || document.visibilityState !== 'visible' || !sheet.hidden) return;
  const active = auto.running || Date.now() - W.lastAct < 90000;
  if (!active) return;
  const p = currentLayoutPage(); if (!p) return;
  const t = today(); const L0 = W.log[t] ||= { secs: 0, pages: {} };
  const before = L0.pages[p] || 0;
  L0.secs += TICK; L0.pages[p] = before + TICK;
  if (before < WIRD_READ_SECS && L0.pages[p] >= WIRD_READ_SECS) checkCrown();
  // تقليم السجل: نبقي ١٢٠ يومًا
  const keys = Object.keys(W.log).sort(); while (keys.length > 120) delete W.log[keys.shift()];
  wirdSave();
}, TICK * 1000);

// تاج يومض ثانيتين ونصفًا عند إتمام الهدف اليومي (مرة في اليوم)
function checkCrown() {
  const st = wirdStats(); if (!st || store.get('crownDay', '') === st.t || st.perDay(st.t) < st.target) return;
  store.set('crownDay', st.t);
  const el = document.createElement('div'); el.id = 'crown';
  el.innerHTML = `<svg viewBox="0 0 120 100"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE58A"/><stop offset="1" stop-color="#D9A21E"/></linearGradient></defs>
    <path d="M12 78 L6 26 L36 50 L60 12 L84 50 L114 26 L108 78 Z" fill="url(#cg)" stroke="#A9750C" stroke-width="3" stroke-linejoin="round"/>
    <rect x="12" y="78" width="96" height="14" rx="4" fill="url(#cg)" stroke="#A9750C" stroke-width="3"/>
    <circle cx="6" cy="24" r="6" fill="#E9483B"/><circle cx="60" cy="10" r="7" fill="#2F8A6E"/><circle cx="114" cy="24" r="6" fill="#E9483B"/>
    <circle cx="36" cy="66" r="5" fill="#2F6FB5"/><circle cx="60" cy="62" r="6" fill="#E9483B"/><circle cx="84" cy="66" r="5" fill="#2F6FB5"/></svg>
    <div>أتممت ورد اليوم</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// إحصاءات الخطة
function wirdStats() {
  const P = W.plan; if (!P) return null;
  const first = new Map(); // الصفحة -> أول يوم قُرئت فيه ضمن الخطة
  for (const d of Object.keys(W.log).sort()) {
    if (d < P.start) continue;
    for (const [p, secs] of Object.entries(W.log[d].pages)) if (secs >= WIRD_READ_SECS && !first.has(+p)) first.set(+p, d);
  }
  const t = today(), dayN = dayDiff(P.start, t) + 1;
  const target = Math.ceil(604 / P.days), read = first.size;
  const perDay = d => [...first.values()].filter(x => x === d).length;
  const secsOf = d => (W.log[d] && d >= P.start) ? W.log[d].secs : 0;
  let next = 0; for (let k = 0; k < 604; k++) { const p = ((P.from - 1 + k) % 604) + 1; if (!first.has(p)) { next = p; break; } }
  const expected = Math.min(604, target * Math.min(dayN, P.days));
  return { P, first, t, dayN, target, read, perDay, secsOf, next, expected, end: dayAdd(P.start, P.days - 1) };
}

// لون الإنجاز اليومي: دون الثلثين أحمر، من الثلثين برتقالي، الهدف كاملًا أخضر
const wirdColor = (v, target) => v >= target ? '#2F8A6E' : v >= target * 2 / 3 ? '#E08A2E' : '#C2564C';
function barChart(days, st, title, mini = false) {
  // رسم أعمدة: الصفحات المقروءة لكل يوم، وخط متقطع للهدف اليومي
  const vals = days.map(d => st.perDay(d)), max = Math.max(st.target, ...vals, 1);
  const W0 = 340, H0 = 170, padB = 34, padT = 14, bw = Math.min(46, (W0 - 20) / days.length - 10);
  const step = (W0 - 20) / days.length, y = v => padT + (H0 - padB - padT) * (1 - v / max);
  let g = `<svg viewBox="0 0 ${W0} ${H0}" class="wchart" role="img" aria-label="${title}">`;
  days.forEach((d, i) => {
    const x = W0 - 10 - step * (i + 0.5) - bw / 2, v = vals[i];
    g += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${H0 - padB - y(v)}" rx="5" fill="${wirdColor(v, st.target)}" opacity="${d === st.t ? 1 : .85}"/>`;
    g += `<text x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle" class="wv">${v}</text>`;
    g += `<text x="${x + bw / 2}" y="${H0 - 18}" text-anchor="middle" class="wd">${d === st.t ? 'اليوم' : DAYNAMES[new Date(d + 'T12:00:00').getDay()]}</text>`;
    g += `<text x="${x + bw / 2}" y="${H0 - 4}" text-anchor="middle" class="wm">${Math.round(st.secsOf(d) / 60)} د</text>`;
  });
  // خطّا الثلث والثلثين، ثم خط الهدف
  for (const f of [1 / 3, 2 / 3]) g += `<line x1="8" x2="${W0 - 8}" y1="${y(st.target * f)}" y2="${y(st.target * f)}" stroke="#C9B48A" stroke-width="1" stroke-dasharray="2 4"/>`;
  g += `<line x1="8" x2="${W0 - 8}" y1="${y(st.target)}" y2="${y(st.target)}" stroke="#B08A3E" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  g += `<text x="34" y="${y(st.target) - 5}" text-anchor="middle" class="wt">الهدف ${st.target}</text></svg>`;
  return g;
}

function showWird(tab = 'day') {
  sheet.style.height = '88vh';
  if (!W.plan) return wirdSetup();
  const st = wirdStats();
  if (st.read >= 604) {
    openSheet(`<div class="title" style="text-align:center">ختمت القرآن الكريم</div>
      <div class="body" style="flex:none;text-align:center;margin:14px 0">تقبّل الله منك. أتممت ختمتك في ${AR(st.dayN)} يومًا.</div>
      <div class="row" style="justify-content:center"><button class="tb fill" id="wNew">ختمة جديدة</button></div>`);
    if (!W.plan.done) { W.plan.done = 1; W.khatmas++; wirdSave(); }
    $('#wNew').onclick = () => { W.plan = null; wirdSave(); showWird(); };
    return;
  }
  const pct = Math.round(st.read / 604 * 100), diff = st.read - st.expected;
  const todayRead = st.perDay(st.t), remainToday = Math.max(0, st.target - todayRead);
  const toP = Math.min(604, st.next + remainToday - 1);
  const ranges = { day: 7, three: 3, week: 7 };
  const days = Array.from({ length: ranges[tab] }, (_, i) => dayAdd(st.t, -i)).filter(d => d >= st.P.start);
  const sum = days.reduce((a, d) => a + st.perDay(d), 0), mins = Math.round(days.reduce((a, d) => a + st.secsOf(d), 0) / 60);
  const avg = days.length ? sum / days.length : 0;
  const finish = avg > 0 ? dayAdd(st.t, Math.ceil((604 - st.read) / avg)) : null;
  let report = '';
  if (tab === 'day') report = `<div class="wrow"><b>اليوم:</b> ${AR(todayRead)} من ${AR(st.target)} صفحة · ${AR(Math.round(st.secsOf(st.t) / 60))} دقيقة</div>`;
  else report = `<div class="wrow"><b>${tab === 'three' ? 'آخر ٣ أيام' : 'آخر أسبوع'}:</b> ${AR(sum)} صفحة من ${AR(st.target * days.length)} · ${AR(mins)} دقيقة · المعدل ${AR(Math.round(avg * 10) / 10)} صفحة يوميًّا</div>
    ${finish ? `<div class="wrow">بهذا المعدل تختم ${niceDate(finish)}${finish <= st.end ? ' <span class="ok">✓ في موعدك</span>' : ' <span class="late">— بعد موعدك (' + niceDate(st.end) + ')</span>'}</div>` : ''}`;
  openSheet(`
    <div class="small">الورد · ختمة في ${AR(st.P.days)} ${st.P.days <= 10 ? 'أيام' : 'يومًا'} · اليوم ${AR(Math.min(st.dayN, st.P.days))} من ${AR(st.P.days)}</div>
    <div class="wbar"><div style="width:${pct}%"></div></div>
    <div class="wrow"><b>${AR(st.read)}</b> صفحة من ٦٠٤ (${AR(pct)}٪) · ${diff >= 0 ? `<span class="ok">متقدم ${AR(diff)} صفحة</span>` : `<span class="late">متأخر ${AR(-diff)} صفحة</span>`}</div>
    <button class="bmrow" id="wGo">وردك اليوم: ${remainToday ? `من صفحة ${st.next} إلى ${toP}` : 'أتممته، بارك الله فيك'} ← ابدأ القراءة</button>
    <div class="wtabs">
      <button data-t="day" class="${tab === 'day' ? 'on' : ''}">يومي</button>
      <button data-t="three" class="${tab === 'three' ? 'on' : ''}">٣ أيام</button>
      <button data-t="week" class="${tab === 'week' ? 'on' : ''}">أسبوعي</button>
    </div>
    ${report}
    ${barChart(days, st, 'الصفحات المقروءة')}
    <div class="small" style="text-align:center">الأخضر: الهدف كاملًا · البرتقالي: ثلثاه · الأحمر: دون ذلك · الخط المتقطع: الهدف اليومي</div>
    <div class="row"><button class="tbtn" id="wEdit">تعديل الورد</button><button class="tbtn" id="wEnd">إنهاء الورد</button></div>`);
  sheet.querySelector('.wtabs').onclick = e => { const b = e.target.closest('button'); if (b) showWird(b.dataset.t); };
  $('#wGo').onclick = () => { closeAll(); const [s, a] = lineRef(st.next, 0); goToAyah(s, a); };
  $('#wEdit').onclick = () => wirdSetup(true);
  $('#wEnd').onclick = () => { if (confirm('إنهاء الورد الحالي؟ يبقى سجل قراءتك محفوظًا.')) { W.plan = null; wirdSave(); showWird(); } };
}

function wirdSetup(edit = false) {
  sheet.style.height = '';
  const cur = currentLayoutPage() || 1;
  openSheet(`<div class="title">${edit ? 'تعديل الورد' : 'الورد: ختمة جديدة'}</div>
    <div class="small" style="margin:6px 0">متى تريد أن تختم القرآن؟</div>
    <div class="wopts">
      <button data-d="3">كل ٣ أيام<small>٢٠٢ صفحة يوميًّا</small></button>
      <button data-d="7">كل أسبوع<small>٨٧ صفحة يوميًّا</small></button>
      <button data-d="30">كل شهر<small>٢١ صفحة يوميًّا</small></button>
      <button data-d="0">مدة أخرى<small><input id="wDays" class="inp" inputmode="numeric" placeholder="عدد الأيام" style="margin-top:4px;font-size:20px;padding:4px"></small></button>
    </div>
    <div class="small" style="margin:10px 0 4px">من أين تبدأ؟</div>
    <label class="chk"><input type="radio" name="wfrom" value="1" ${edit ? '' : 'checked'}>من أول المصحف</label>
    <label class="chk"><input type="radio" name="wfrom" value="${cur}">من موضعي الحالي (صفحة ${cur})</label>
    ${edit ? `<label class="chk"><input type="radio" name="wfrom" value="keep" checked>أبقِ التقدم الحالي وغيّر المدة فقط</label>` : ''}`);
  sheet.querySelector('.wopts').onclick = e => {
    const b = e.target.closest('button'); if (!b || e.target.id === 'wDays') return;
    let d = +b.dataset.d; if (!d) d = parseInt(($('#wDays').value || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)), 10);
    if (!(d >= 1 && d <= 3650)) { toast('اكتب عدد الأيام'); $('#wDays').focus(); return; }
    const from = sheet.querySelector('input[name=wfrom]:checked').value;
    if (from === 'keep' && W.plan) W.plan.days = d;
    else W.plan = { start: today(), days: d, from: +from, done: 0 };
    wirdSave(); showWird();
  };
  const wd = $('#wDays'); wd.onclick = e => e.stopPropagation();
  wd.onkeydown = e => { if (e.key === 'Enter') wd.closest('button').click(); };
}

// ======================= التمرير التلقائي =======================
const auto = { shown: false, running: false, speed: store.get('speed', 4), acc: 0, last: 0 };
const autoEl = $('#auto');
function paintAuto() {
  autoEl.hidden = !auto.shown;
  $('#speed').textContent = AR(auto.speed);
  $('#playIcon').setAttribute('d', auto.running ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5l11 7-11 7z');
}
function tick(t) {
  if (!auto.running) return;
  if (auto.last) {
    auto.acc += auto.speed * 6 * (t - auto.last) / 1000;
    const step = Math.floor(auto.acc);
    const sc = cur();
    if (step >= 1) { sc.scrollTop += step; auto.acc -= step; }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1) { auto.running = false; paintAuto(); return; }
  }
  auto.last = t;
  requestAnimationFrame(tick);
}
function setRunning(r) { auto.running = r; auto.last = 0; auto.acc = 0; paintAuto(); if (r) requestAnimationFrame(tick); }
autoEl.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act;
  clearTimeout(hideTimer);
  if (!auto.running) hideTimer = setTimeout(() => { if (!auto.running) { auto.shown = false; paintAuto(); } }, 4000);
  if (act === 'faster') auto.speed = Math.min(20, auto.speed + 1);
  if (act === 'slower') auto.speed = Math.max(1, auto.speed - 1);
  if (act === 'toggle') return setRunning(!auto.running);
  if (act === 'stop') { clearTimeout(hideTimer); auto.shown = false; return setRunning(false); }
  store.set('speed', auto.speed); paintAuto();
});
paintAuto();

// ======================= اللمس: نقرة، نقرتان، ضغط مطوّل =======================
const G = { timer: 0, x: 0, y: 0, el: null, long: false, lastTapT: 0, lastTapEl: null, tapTimer: 0, tx: 0, ty: 0 };
const HIT = '.m, .tm, .w, .ta';
function hitEl(t) { return t.closest('.m, .tm') || t.closest('.w, .ta'); }
for (const host of [pagesEl, tpagesEl]) {
  host.addEventListener('contextmenu', e => e.preventDefault());
  host.addEventListener('pointerdown', e => {
    if (performance.now() - tipClosedAt < 50) { G.moved = true; return; } // هذه اللمسة أغلقت التلميح
    G.moved = false;
    G.el = hitEl(e.target); G.x = e.clientX; G.y = e.clientY; G.long = false;
    clearTimeout(G.timer);
    if (G.el) G.timer = setTimeout(() => { G.long = true; onLongPress(G.el); }, 480);
  });
  host.addEventListener('pointermove', e => {
    if (Math.hypot(e.clientX - G.x, e.clientY - G.y) > 10) { clearTimeout(G.timer); G.el = null; G.moved = true; }
  });
  host.addEventListener('pointercancel', () => { clearTimeout(G.timer); G.el = null; G.moved = true; });
  host.addEventListener('pointerup', e => {
    clearTimeout(G.timer);
    if (G.long || G.moved || pinch.active) { G.moved = false; return; }
    const el = hitEl(e.target);
    const now = performance.now();
    const isWord = el && (el.classList.contains('w') || el.classList.contains('ta'));
    if (isWord && G.lastTapEl === el && now - G.lastTapT < 320) {
      clearTimeout(G.tapTimer); G.lastTapEl = null; onDoubleTap(el, e.clientX, e.clientY); return;
    }
    G.lastTapEl = el; G.lastTapT = now;
    clearTimeout(G.tapTimer);
    G.tapTimer = setTimeout(onSingleTap, el ? 300 : 0);
  });
}

// النقر على الصفحة يشغّل التمرير التلقائي ويوقفه؛ تبقى الأزرار ظاهرة قليلًا بعد الإيقاف لضبط السرعة
let hideTimer = 0;
function onSingleTap() {
  if (selected) { setSelected(null); closeAll(); return; }
  clearTimeout(hideTimer);
  auto.shown = true;
  setRunning(!auto.running);
  if (!auto.running) hideTimer = setTimeout(() => { if (!auto.running) { auto.shown = false; paintAuto(); } }, 4000);
}
function ref(el) { return el.dataset.a.split(':').map(Number); }
function onLongPress(el) {
  if (navigator.vibrate) navigator.vibrate(15);
  const [s, a] = ref(el);
  if (el.classList.contains('m') || el.classList.contains('tm')) return toggleBookmark(s, a);
  setSelected([s, a]);
  $('#menuTitle').textContent = `${D.surahs[s - 1]} – الآية ${AR(a)}`;
  $('#menu').hidden = false; $('#veil').hidden = false;
}
function onDoubleTap(el, x, y) {
  const [s, a] = ref(el);
  if (el.classList.contains('w')) return showWord(s, a, +el.dataset.w, el.textContent);
  // وضع النص: نبحث عن الكلمة التي يقع موضع النقر داخل مستطيلها
  const tn = el.firstChild; if (!tn || tn.nodeType !== 3) return;
  const t = tn.textContent, rg = document.createRange();
  let word = '', wi = 0, n = 0;
  for (const m of t.matchAll(/\S+/g)) {
    n++;
    rg.setStart(tn, m.index); rg.setEnd(tn, m.index + m[0].length);
    for (const r of rg.getClientRects()) {
      if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 4 && y <= r.bottom + 4) { word = m[0]; wi = n; break; }
    }
    if (word) break;
  }
  if (!word) return;
  showWordText(s, a, wi, word);
}

function forAyah(s, a, fn) { document.querySelectorAll(`[data-a="${s}:${a}"]`).forEach(fn); }
function setSelected(r) {
  if (selected) forAyah(...selected, e => e.classList.remove('sel'));
  selected = r;
  if (r && !isBm(...r)) forAyah(...r, e => { if (e.classList.contains('w') || e.classList.contains('ta')) e.classList.add('sel'); });
}
function toggleBookmark(s, a) {
  const same = isBm(s, a);
  if (bookmark) forAyah(...bookmark, e => e.classList.remove('bm'));
  bookmark = same ? null : [s, a];
  store.set('bookmark', bookmark);
  if (bookmark) forAyah(s, a, e => { e.classList.remove('sel'); e.classList.add('bm'); });
  toast(bookmark ? `وُضعت علامة الوقوف عند ${D.surahs[s - 1]} ${AR(a)}` : 'أُزيلت علامة الوقوف');
}

let toastTimer = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2200); }

// ======================= النوافذ =======================
const sheet = $('#sheet');
function openSheet(html, center = false) {
  $('#menu').hidden = true;
  sheet.className = center ? 'center' : '';
  sheet.innerHTML = (center ? '' : '<div class="grip"></div>') + html;
  sheet.hidden = false; $('#veil').hidden = false;
}
function closeAll() {
  tafAuto.stop();
  $('#menu').hidden = true; sheet.hidden = true; $('#veil').hidden = true;
  stopAudio(); setSelected(null);
}
$('#veil').addEventListener('click', closeAll);
$('#menu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !selected) return;
  if (b.dataset.act === 'tafsir') showTafsir(...selected);
  if (b.dataset.act === 'recite') showAudio(...selected);
  if (b.dataset.act === 'copy') showCopy(...selected);
  if (b.dataset.act === 'wird') { setSelected(null); showWird(); }
});
const ayahTitle = (s, a) => `سورة ${D.surahs[s - 1]} – الآية ${AR(a)}`;

// ---------- التفسير ----------
const cache = {};
async function json(path) { return cache[path] ??= getJSON(path); }

async function showTafsir(s, a) {
  setSelected([s, a]);
  const arr = await json(`data/saadi/${s}.json`);
  let at = a; while (at > 1 && arr[at - 1] == null) at--;
  const raw = arr[at - 1] || '';
  const body = esc(raw).replace(/\{\s*(.+?)\s*\}/g, '<span class="q">﴿$1﴾</span>').replace(/\n/g, '<br>');
  const prev = a > 1 ? [s, a - 1] : s > 1 ? [s - 1, D.counts[s - 2]] : null;
  const next = a < D.counts[s - 1] ? [s, a + 1] : s < 114 ? [s + 1, 1] : null;
  openSheet(`
    <div class="small">تيسير الكريم الرحمن – السعدي</div>
    <div class="title">${ayahTitle(s, a)}</div>
    ${at !== a ? `<div class="note">فُسِّرت هذه الآية مع الآية ${AR(at)}</div>` : ''}
    <div class="hr"></div>
    <div class="body" id="tBody">${body}</div>
    <div class="row" style="align-items:center">
      <button class="tbtn" id="tPrev" ${prev ? '' : 'disabled'}>الآية السابقة</button>
      <div class="tauto">
        <button data-t="faster" aria-label="أسرع"><svg viewBox="0 0 24 24"><path d="M10.5 4h3v6.5H20v3h-6.5V20h-3v-6.5H4v-3h6.5z"/></svg></button>
        <button data-t="toggle" aria-label="تمرير تلقائي"><svg viewBox="0 0 24 24"><path id="tIcon" d="M8 5l11 7-11 7z"/></svg></button>
        <span id="tSpeed"></span>
        <button data-t="slower" aria-label="أبطأ"><svg viewBox="0 0 24 24"><path d="M4 10.5h16v3H4z"/></svg></button>
      </div>
      <button class="tbtn" id="tNext" ${next ? '' : 'disabled'}>الآية التالية</button>
    </div>`);
  sheet.style.height = '85vh';
  // التمرير التلقائي في التفسير: نقرة على النص تشغّله وتوقفه
  const tb = $('#tBody'), TA = tafAuto;
  TA.stop(); TA.el = tb; TA.paint();
  tb.onclick = () => TA.set(!TA.running);
  sheet.querySelector('.tauto').onclick = e => {
    const t = e.target.closest('button')?.dataset.t; if (!t) return;
    if (t === 'toggle') return TA.set(!TA.running);
    TA.speed = Math.max(1, Math.min(20, TA.speed + (t === 'faster' ? 1 : -1)));
    store.set('tafSpeed', TA.speed); TA.paint();
  };
  if (prev) $('#tPrev').onclick = () => showTafsir(...prev);
  if (next) $('#tNext').onclick = () => showTafsir(...next);
}

const tafAuto = {
  el: null, running: false, speed: store.get('tafSpeed', 3), acc: 0, last: 0,
  paint() {
    const i = $('#tIcon'); if (i) i.setAttribute('d', this.running ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5l11 7-11 7z');
    const sp = $('#tSpeed'); if (sp) sp.textContent = AR(this.speed);
  },
  set(r) { this.running = r; this.last = 0; this.acc = 0; this.paint(); if (r) requestAnimationFrame(t => this.tick(t)); },
  stop() { this.running = false; this.paint(); },
  tick(t) {
    if (!this.running || !this.el || !this.el.isConnected || sheet.hidden) { this.running = false; return; }
    if (this.last) {
      this.acc += this.speed * 6 * (t - this.last) / 1000;
      const step = Math.floor(this.acc);
      if (step >= 1) { this.el.scrollTop += step; this.acc -= step; }
      if (this.el.scrollTop + this.el.clientHeight >= this.el.scrollHeight - 1) { this.stop(); return; }
    }
    this.last = t;
    requestAnimationFrame(tt => this.tick(tt));
  },
};

// ---------- معنى الكلمة ----------
async function showWord(s, a, wi, glyphText) {
  const list = await json(`data/gharib/${s}.json`);
  const e = list.find(x => x.a === a && x.w.includes(wi));
  let word = e ? e.p : '';
  if (!word) { // النص الإملائي للكلمة من بيانات المصحف
    const p = D.ayahPage.get(s + ':' + a);
    for (let k = p - 1; k <= p && !word; k++) for (const l of D.pages[k] || []) if (l[0] === 't')
      for (const w of l[1]) if (w[0] === s && w[1] === a && w[2] === wi) word = w[4];
  }
  sheet.style.height = '';
  openSheet(`
    <div class="word">﴿${esc(word)}﴾</div>
    <div class="body" style="flex:none;margin:8px 0;${e ? '' : 'color:var(--muted)'}">${e ? esc(e.m) : 'لم يذكر كتاب «السراج في بيان غريب القرآن» معنًى لهذه الكلمة.'}</div>
    <div class="small">${ayahTitle(s, a)} · السراج في بيان غريب القرآن</div>`, true);
}

async function showWordText(s, a, wi, word) {
  const list = await json(`data/gharib/${s}.json`);
  const k = skel(normAr(word));
  const e = list.find(x => x.a === a && normAr(x.p).split(' ').some(p => skel(p) === k && k)) ||
            list.find(x => x.a === a && x.w.includes(wi));
  sheet.style.height = '';
  openSheet(`
    <div class="word">﴿${esc(e ? e.p : word)}﴾</div>
    <div class="body" style="flex:none;margin:8px 0;${e ? '' : 'color:var(--muted)'}">${e ? esc(e.m) : 'لم يذكر كتاب «السراج في بيان غريب القرآن» معنًى لهذه الكلمة.'}</div>
    <div class="small">${ayahTitle(s, a)} · السراج في بيان غريب القرآن</div>`, true);
}

// ---------- النسخ ----------
// نص الآية بالرسم العثماني (بيانات المجمع)، قابل للتحديد، مع زر لنسخ الآية كاملة بعزوها
const AYAH_TEXT = new Map();
async function ayahText(s, a) {
  if (!AYAH_TEXT.size) {
    const pages = await json('data/text.json');
    for (const ays of pages) for (const [ss, aa, , t] of ays) {
      const k = t.lastIndexOf('\u00a0'); AYAH_TEXT.set(ss + ':' + aa, k > 0 ? t.slice(0, k) : t);
    }
  }
  if (!document.fonts.check('20px hafs')) {
    try { const ff = new FontFace('hafs', 'url(fonts/hafs.woff2) format("woff2")'); await ff.load(); document.fonts.add(ff); } catch {}
  }
  return AYAH_TEXT.get(s + ':' + a) || '';
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast('نُسخ');
}
async function showCopy(s, a) {
  setSelected([s, a]);
  const t = await ayahText(s, a);
  const cite = `[${D.surahs[s - 1]}: ${AR(a)}]`;
  sheet.style.height = '';
  openSheet(`
    <div class="small">نسخ</div>
    <div class="title">${ayahTitle(s, a)}</div>
    <div class="small" style="margin:4px 0">حدّد بإصبعك الجزء الذي تريده ثم انسخه، أو انسخ الآية كاملة.</div>
    <div class="copytext" id="cpText">﴿${esc(t)}﴾</div>
    <div class="row" style="justify-content:center;gap:10px">
      <button class="tb fill" id="cpAll">نسخ الآية كاملة</button>
      <button class="tb out" id="cpSel">نسخ المحدد</button>
    </div>`);
  $('#cpAll').onclick = () => copyText(`﴿${t}﴾ ${cite}`);
  $('#cpSel').onclick = () => {
    const sel = String(getSelection() || '').trim();
    if (sel) copyText(sel); else toast('حدّد جزءًا من الآية أولًا');
  };
}

// ---------- التلاوة ----------
const player = $('#player');
const A = { s: 0, a: 0, start: null, loaded: false, rec: store.get('reciter', 0), rate: store.get('rate', 1), cont: store.get('continuous', false), rep: store.get('repeat', 1), cnt: 1 };
const REPEATS = [1, 2, 3, 5, 7, 10, 0]; // 0 = بلا حد
function audioUrl(s, a) { return `https://everyayah.com/data/${RECITERS[A.rec][1]}/${pad3(s)}${pad3(a)}.mp3`; }
function stopAudio() { player.pause(); player.removeAttribute('src'); player.load(); A.loaded = false; }
function playAyah() {
  $('#aErr') && ($('#aErr').textContent = '');
  A.cnt = 1;
  player.src = audioUrl(A.s, A.a); player.playbackRate = A.rate; player.defaultPlaybackRate = A.rate;
  A.loaded = true; player.play().catch(() => {});
  setSelected([A.s, A.a]);
  const t = $('#aTitle'); if (t) t.textContent = ayahTitle(A.s, A.a);
}
player.addEventListener('play', paintAudio);
player.addEventListener('pause', paintAudio);
player.addEventListener('ended', () => {
  if (A.rep === 0 || A.cnt < A.rep) { A.cnt++; player.currentTime = 0; player.play().catch(() => {}); return; }
  if (A.cont && A.a < D.counts[A.s - 1]) { A.a++; playAyah(); } else { A.loaded = false; paintAudio(); }
});
player.addEventListener('error', () => {
  if (!A.loaded) return;
  A.loaded = false; const e = $('#aErr'); if (e) e.textContent = 'تعذّر تشغيل التلاوة، تأكد من اتصال الإنترنت.'; paintAudio();
});
function paintAudio() {
  const i = $('#aIcon'); if (!i) return;
  i.setAttribute('d', !player.paused ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5l11 7-11 7z');
}
function showAudio(s, a) {
  Object.assign(A, { s, a, start: [s, a] });
  sheet.style.height = '';
  openSheet(`
    <div class="small">التلاوة</div>
    <div class="title" id="aTitle">${ayahTitle(s, a)}</div>
    <div class="small" style="margin-top:6px;color:var(--ink)">القارئ</div>
    <div class="reciters">${RECITERS.map((r, i) => `<button class="rec${i === A.rec ? ' on' : ''}" data-i="${i}"><span class="dot"></span>${r[0]}</button>`).join('')}</div>
    <div class="ctrls">
      <button class="cbtn" id="aStop" aria-label="إيقاف"><svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg></button>
      <button class="cbtn main" id="aPlay" aria-label="تشغيل"><svg viewBox="0 0 24 24"><path id="aIcon" d="M8 5l11 7-11 7z"/></svg></button>
    </div>
    <div class="err" id="aErr"></div>
    <div style="font-size:21px;margin-top:8px">سرعة القراءة: <span id="aRate"></span></div>
    <input type="range" id="aRange" min="0.5" max="2" step="0.25" value="${A.rate}">
    <label class="chk"><input type="checkbox" id="aCont" ${A.cont ? 'checked' : ''}>متابعة الآيات التالية تلقائيًا</label>
    <div class="repRow"><span>تكرار الآية:</span>${REPEATS.map(n => `<button class="rep${n === A.rep ? ' on' : ''}" data-n="${n}">${n === 0 ? '∞' : n === 1 ? 'بلا' : AR(n)}</button>`).join('')}</div>`);
  const rateLbl = () => $('#aRate').textContent = '×' + AR(String(A.rate).replace('.', '٫'));
  rateLbl();
  sheet.querySelector('.reciters').onclick = e => {
    const b = e.target.closest('.rec'); if (!b) return;
    A.rec = +b.dataset.i; store.set('reciter', A.rec);
    sheet.querySelectorAll('.rec').forEach(x => x.classList.toggle('on', x === b));
    if (A.loaded) playAyah();
  };
  $('#aPlay').onclick = () => { if (!A.loaded) playAyah(); else if (player.paused) player.play(); else player.pause(); };
  $('#aStop').onclick = () => { stopAudio(); [A.s, A.a] = A.start; $('#aTitle').textContent = ayahTitle(A.s, A.a); paintAudio(); };
  $('#aRange').oninput = e => { A.rate = +e.target.value; player.playbackRate = A.rate; rateLbl(); store.set('rate', A.rate); };
  sheet.querySelector('.repRow').onclick = e => {
    const b = e.target.closest('.rep'); if (!b) return;
    A.rep = +b.dataset.n; store.set('repeat', A.rep);
    sheet.querySelectorAll('.rep').forEach(x => x.classList.toggle('on', x === b));
  };
  $('#aCont').onchange = e => { A.cont = e.target.checked; store.set('continuous', A.cont); };
}

// ---------- بطاقتا الفتح: علامة الوقوف، ومتابعة الورد ----------
function showStartCards() {
  const el = document.createElement('div'); el.id = 'startWrap';
  if (bookmark) {
    const [s, a] = bookmark;
    el.insertAdjacentHTML('beforeend', `<div class="scard" id="bmCard"><div class="bm-head">◆ علامة الوقوف</div>
      <div class="bm-line">سورة ${D.surahs[s - 1]}</div>
      <div class="bm-info"><span>الآية ${AR(a)}</span><span>صفحة ${D.ayahPage.get(s + ':' + a)}</span></div>
      <button class="tb fill" id="bmGo">انتقل إليها</button></div>`);
  }
  const st = wirdStats();
  if (st && st.read < 604) {
    const days = Array.from({ length: 7 }, (_, i) => dayAdd(st.t, -i)).filter(d => d >= st.P.start);
    const todayRead = st.perDay(st.t);
    el.insertAdjacentHTML('beforeend', `<button class="scard" id="wCard"><div class="bm-head">الورد اليومي</div>
      <div class="bm-info"><span>اليوم ${AR(todayRead)} من ${AR(st.target)} صفحة</span></div>
      ${barChart(days, st, 'متابعة الورد', true)}</button>`);
  }
  if (!el.children.length) return;
  document.body.appendChild(el);
  if ($('#bmGo')) $('#bmGo').onclick = () => { closeStartCards(); goToAyah(...bookmark, true); };
  if ($('#wCard')) $('#wCard').onclick = () => showWird(); // تبقى البطاقتان بعد الرجوع من الورد
}
function closeStartCards() {
  const el = $('#startWrap'); if (!el) return;
  el.remove(); tipClosedAt = performance.now();
  if (!store.get('hideTips', false)) setTimeout(showTips, 300);
}
// النقر خارج البطاقتين يخفيهما (لا أثناء فتح صفحة الورد)
document.addEventListener('pointerdown', e => {
  const el = $('#startWrap');
  if (el && sheet.hidden && !el.contains(e.target)) closeStartCards();
}, true);

// ---------- التلميحات: بطاقة واحدة لكل تلميح ----------
let tipClosedAt = 0;
function closeTip(never) {
  const el = $('#tip'); if (!el) return;
  if (never) store.set('hideTips', true);
  store.set('tipIdx', (tipIdx + 1) % TIPS.length); // في المرة القادمة يبدأ بالتلميح التالي
  el.remove(); tipClosedAt = performance.now();
}
// النقر في أي مكان خارج بطاقة التلميح يغلقها (ولا يشغّل التمرير)
document.addEventListener('pointerdown', e => {
  const el = $('#tip'); if (el && !el.contains(e.target)) closeTip(false);
}, true);
const TIPS = [
  'انقر على الصفحة لتشغيل التمرير التلقائي، وانقر مرة أخرى لإيقافه. وزرّا + و − الأحمران لضبط سرعته.',
  'اضغط ضغطة مطوّلة على أي آية لتظهر قائمة فيها: التلاوة بأصوات عدد من القراء، وتفسير السعدي.',
  'زر «نص» أعلى الشاشة يعرض القرآن نصًّا بخط المصحف يلتف مع الشاشة، وتكبّره وتصغّره بإصبعين.',
  'انقر نقرتين على أي كلمة ليظهر معناها من كتاب «السراج في بيان غريب القرآن» للخضيري.',
  'اضغط ضغطة مطوّلة على رقم الآية لتضع علامة الوقوف، فتتلوّن الآية وتعرف أين انتهيت. والضغطة نفسها تزيلها.',
  'انقر اسم السورة أعلى الشاشة لفهرس السور، وفيه الانتقال إلى علامة الوقوف وإعادة عرض التلميحات، ورقم الصفحة للانتقال إلى صفحة، والجزء لقائمة الأجزاء.',
  'الورد: اضغط ضغطة مطوّلة على أي آية واختر «الورد»، فتحدد مدة ختمتك، ويتابع التطبيق قراءتك ويعطيك تقارير يومية وكل ٣ أيام وأسبوعية.',
  'اضغط رمز العدسة أعلى الشاشة للبحث في القرآن بكلمة أو عبارة، ثم اختر النتيجة لتنتقل إلى الآية.',
  'من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية» ليظهر المصحف بأيقونة مثل التطبيق، ويعمل بلا إنترنت فيما قرأته.',
];
let tipIdx = store.get('tipIdx', 0) % TIPS.length;
function showTips() {
  let el = $('#tip');
  if (!el) {
    el = document.createElement('div'); el.id = 'tip';
    el.innerHTML = `<div class="tip-head">
        <svg class="bulb" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zM9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/></svg>
        <b>تلميح</b><span class="badge">جديد</span><span class="count"></span></div>
      <div class="tip-text"></div>
      <div class="tip-btns">
        <button class="tb out" data-t="never">لا تظهر التلميحات</button>
        <span style="flex:1"></span>
        <button class="tb out" data-t="next">التالي</button>
        <button class="tb fill" data-t="ok">فهمت</button>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const t = e.target.closest('button')?.dataset.t; if (!t) return;
      if (t === 'next') { tipIdx = (tipIdx + 1) % TIPS.length; paint(); return; }
      closeTip(t === 'never');
    });
  }
  const paint = () => {
    el.querySelector('.count').textContent = `تلميح ${AR(tipIdx + 1)} من ${AR(TIPS.length)}`;
    el.querySelector('.tip-text').textContent = TIPS[tipIdx];
  };
  paint();
}

// ---------- البحث في القرآن ----------
// يطابق ما يكتبه المستخدم بالإملاء الحديث على الرسم العثماني: تُحذف الحركات وتوحَّد الهمزات،
// ثم يُقارن «هيكل» الكلمة دون حروف المد (ا و ي) حتى تُوجد «الصلاة» في «الصلوة» و«الكتاب» في «الكتب».
const normAr = t => t.replace(/ (?=[\u0670\u0640])/g, '')
  .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640\u2060]/g, '')
  .replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه').replace(/ء/g, '')
  .replace(/[^\u0621-\u064A ]/g, '').replace(/\s+/g, ' ').trim();
const skel = t => t.replace(/[اوي]/g, '');
let SI = null; // فهرس البحث
function searchIndex() {
  if (SI) return SI;
  const m = new Map();
  D.pages.forEach((lines, pi) => lines.forEach(l => {
    if (l[0] !== 't') return;
    for (const w of l[1]) {
      const k = w[0] + ':' + w[1];
      if (!m.has(k)) m.set(k, { s: w[0], a: w[1], p: pi + 1, words: [] });
      m.get(k).words.push(w[4]);
    }
  }));
  SI = [...m.values()].map(x => {
    const n = x.words.map(normAr), k = n.map(skel);
    return { ...x, n, k, nj: ' ' + n.join(' ') + ' ', kj: ' ' + k.join(' ') + ' ' };
  });
  return SI;
}
function runSearch(q) {
  const qn = normAr(q); if (qn.replace(/ /g, '').length < 2) return { list: [], qn };
  const qk = skel(qn).trim();
  const exact = [], loose = [];
  for (const x of searchIndex()) {
    if (x.nj.includes(qn)) exact.push(x);
    else if (qk && x.kj.includes(qk)) loose.push(x);
  }
  return { list: exact.concat(loose), qn, qk };
}
// البحث عن صفحة أو جزء: «460» أو «صفحة 460» أو «الجزء 5» أو «الجزء الخامس»
function specialResults(q) {
  const t = q.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
  const num = (t.match(/\d+/) || [])[0], n = num ? +num : 0;
  const wantPage = /صفح|^ص\s*\d/.test(t), wantJuz = /جز/.test(t);
  const out = [];
  const pageItem = p => {
    const [s, a] = lineRef(p, 0);
    return { kind: 'page', n: p, title: `صفحة ${p}`, sub: `سورة ${D.surahs[s - 1]}، تبدأ بالآية ${AR(a)}` };
  };
  const juzItem = j => ({ kind: 'juz', n: j, title: `الجزء ${JUZ_NAMES[j - 1]}`, sub: `يبدأ بسورة ${D.surahs[JUZ[j - 1][0] - 1]}، الآية ${AR(JUZ[j - 1][1])}` });
  if (n) {
    if (!wantJuz && n >= 1 && n <= 604) out.push(pageItem(n));
    if (!wantPage && n >= 1 && n <= 30) out.push(juzItem(n));
  } else if (wantJuz) {
    // اسم الجزء بالحروف
    const qn = normAr(t).replace(/^(ال)?جز[ءي]?\s*/, '');
    if (qn) JUZ_NAMES.forEach((nm, i) => { if (normAr(nm).startsWith(qn) || normAr(nm) === qn) out.push(juzItem(i + 1)); });
  }
  return out;
}
function highlightWords(x, qn, qk) {
  const toks = qn.split(' ').filter(Boolean), kt = toks.map(skel);
  return x.words.map((w, i) => {
    const hit = toks.some((t, j) => x.n[i].includes(t) || (kt[j] && x.k[i].includes(kt[j])));
    const shown = w.replace(/[\u06D6-\u06DC\u06DE-\u06ED]/g, ''); // علامات الوقف لا يعرضها خط المركزي
    return hit ? `<mark>${esc(shown)}</mark>` : esc(shown);
  }).join(' ');
}
$('#hSearch').onclick = () => {
  sheet.style.height = '88vh';
  openSheet(`<div class="title">البحث في القرآن</div>
    <div class="sbox"><input class="inp" id="sq" type="search" placeholder="اكتب كلمة أو عبارة" autocomplete="off"></div>
    <div class="scount" id="scount"></div>
    <div class="list" id="slist"></div>`);
  const inp = $('#sq'); let t = 0;
  inp.value = store.get('lastSearch', '');
  const go = () => {
    const special = specialResults(inp.value);
    const { list, qn, qk } = runSearch(inp.value);
    store.set('lastSearch', inp.value);
    $('#scount').textContent = qn.length < 2 && !special.length ? '' : list.length ? `${AR(list.length)} نتيجة` : (special.length ? '' : 'لا نتائج');
    $('#slist').innerHTML = special.map(x => `<button class="sres special" data-kind="${x.kind}" data-n="${x.n}"><div class="sref">${x.title}</div><div class="stext">${x.sub}</div></button>`).join('') +
      list.slice(0, 300).map(x =>
      `<button class="sres" data-s="${x.s}" data-a="${x.a}" data-p="${x.p}"><div class="sref">سورة ${D.surahs[x.s - 1]}، الآية ${AR(x.a)} – صفحة ${AR(x.p)}</div><div class="stext">${highlightWords(x, qn, qk)}</div></button>`).join('') +
      (list.length > 300 ? `<div class="scount" style="text-align:center;padding:10px">تُعرض أول ٣٠٠ نتيجة؛ زد كلمات البحث لتضييقها</div>` : '');
  };
  inp.oninput = () => { clearTimeout(t); t = setTimeout(go, 200); };
  if (inp.value) go();
  $('#slist').onclick = e => {
    const b = e.target.closest('.sres'); if (!b) return;
    if (b.dataset.kind === 'page') { closeAll(); goToPageAny(+b.dataset.n); return; }
    if (b.dataset.kind === 'juz') { closeAll(); goToAyah(...JUZ[+b.dataset.n - 1]); return; }
    const s = +b.dataset.s, a = +b.dataset.a, p = +b.dataset.p;
    closeAll(); goToAyah(s, a, true);
    setTimeout(() => { setSelected([s, a]); const el = cur().querySelector(`[data-a="${s}:${a}"]`); if (el) el.scrollIntoView({ block: 'center' }); }, 120);
  };
  setTimeout(() => inp.focus(), 50);
};

// ---------- الفهارس ----------
$('#hSurah').onclick = () => {
  sheet.style.height = '85vh';
  openSheet(`<div class="title">فهرس السور</div>
    ${bookmark ? `<button class="bmrow" id="goBm">◆ علامة الوقوف: ${ayahTitle(...bookmark)}</button>` : ''}
    <button class="bmrow" id="showTipsBtn" style="background:#FBF6EC;color:#7A2430">💡 عرض التلميحات</button>
    ${canFull() && !isStandalone() ? `<button class="bmrow" id="fullBtn" style="background:#EAF3EF;color:var(--accent)">⛶ ${inFull() ? 'الخروج من ملء الشاشة' : 'ملء الشاشة دون شريط العنوان'}</button>` : ''}
    <div class="list">${D.surahs.map((n, i) => `<button class="item" data-s="${i + 1}" data-p="${D.surahPage[i + 1]}"><span class="n">${AR(i + 1)}</span>سورة ${n}<span class="p">ص ${AR(D.surahPage[i + 1])}</span></button>`).join('')}</div>`);
  if ($('#fullBtn')) $('#fullBtn').onclick = () => {
    const on = !inFull(); closeAll(); if (on) enterFull(); else exitFull();
  };
  $('#showTipsBtn').onclick = () => { store.set('hideTips', false); closeAll(); showTips(); };
  if (bookmark) $('#goBm').onclick = () => { closeAll(); goToAyah(...bookmark, true); };
  sheet.querySelector('.list').onclick = e => { const b = e.target.closest('.item'); if (b) { closeAll(); goToAyah(+b.dataset.s, 1); } };
};
$('#hJuz').onclick = () => {
  sheet.style.height = '85vh';
  const pages = JUZ.map(([s, a]) => D.ayahPage.get(s + ':' + a));
  openSheet(`<div class="title">الأجزاء</div>
    <div class="list">${pages.map((p, i) => `<button class="item" data-j="${i}" data-p="${p}">الجزء ${JUZ_NAMES[i]}<span class="p">ص ${AR(p)}</span></button>`).join('')}</div>`);
  sheet.querySelector('.list').onclick = e => { const b = e.target.closest('.item'); if (b) { closeAll(); goToAyah(...JUZ[+b.dataset.j]); } };
};
$('#hPage').onclick = () => {
  sheet.style.height = '';
  openSheet(`<div class="title" style="text-align:center">الانتقال إلى صفحة</div>
    <input class="inp" id="pgIn" inputmode="numeric" placeholder="١ – ٦٠٤" style="margin:12px 0">
    <div class="row"><button class="tbtn" id="pgGo">انتقال</button><button class="tbtn" id="pgNo">إلغاء</button></div>`, true);
  const go = () => {
    const n = parseInt($('#pgIn').value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10);
    if (n >= 1 && n <= 604) { closeAll(); goToPageAny(n); }
  };
  $('#pgGo').onclick = go; $('#pgNo').onclick = closeAll;
  $('#pgIn').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#pgIn').focus();
};

boot().catch(e => { $('#loading').textContent = 'تعذّر تحميل بيانات المصحف: ' + e.message; });
