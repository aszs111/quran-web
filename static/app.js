'use strict';
/* المصحف — نسخة المتصفح
   عرض متصل لصفحات مصحف المدينة بخطوط مجمع الملك فهد (QPC V1)، مع التمرير التلقائي،
   والتلاوة، وتفسير السعدي، ومعاني الكلمات، وعلامة الوقوف. */

const $ = s => document.querySelector(s);
const scroller = $('#scroller'), pagesEl = $('#pages');
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
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
  if (!store.get('hideTips', false)) showTips();
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
  const pos = currentPos(), i = Math.floor(pos), p = i + 1;
  const [s, a] = lineRef(p, Math.floor((pos - i) * D.pages[i].length));
  const key = s + '|' + p + '|' + juzOf(s, a);
  if (key === lastHeader) return;
  lastHeader = key;
  $('#hSurah').textContent = D.surahs[s - 1];
  $('#hPage').textContent = AR(p);
  $('#hJuz').textContent = 'الجزء ' + JUZ_NAMES[juzOf(s, a) - 1];
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
    if (step >= 1) { scroller.scrollTop += step; auto.acc -= step; }
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) { auto.running = false; paintAuto(); return; }
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
const G = { timer: 0, x: 0, y: 0, el: null, long: false, lastTapT: 0, lastTapEl: null, tapTimer: 0 };
pagesEl.addEventListener('contextmenu', e => e.preventDefault());
pagesEl.addEventListener('pointerdown', e => {
  G.el = e.target.closest('.w, .m'); G.x = e.clientX; G.y = e.clientY; G.long = false;
  clearTimeout(G.timer);
  if (G.el) G.timer = setTimeout(() => { G.long = true; onLongPress(G.el); }, 480);
});
pagesEl.addEventListener('pointermove', e => {
  if (Math.hypot(e.clientX - G.x, e.clientY - G.y) > 10) { clearTimeout(G.timer); G.el = null; G.moved = true; }
});
pagesEl.addEventListener('pointercancel', () => { clearTimeout(G.timer); G.el = null; G.moved = true; });
pagesEl.addEventListener('pointerup', e => {
  clearTimeout(G.timer);
  if (G.long || G.moved) { G.moved = false; return; }
  const el = e.target.closest('.w, .m');
  const now = performance.now();
  if (el && el.classList.contains('w') && G.lastTapEl === el && now - G.lastTapT < 320) {
    clearTimeout(G.tapTimer); G.lastTapEl = null; onDoubleTap(el); return;
  }
  G.lastTapEl = el; G.lastTapT = now;
  clearTimeout(G.tapTimer);
  G.tapTimer = setTimeout(onSingleTap, el ? 300 : 0);
});
pagesEl.addEventListener('pointerdown', () => { G.moved = false; }, true);

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
  if (el.classList.contains('m')) return toggleBookmark(s, a);
  setSelected([s, a]);
  $('#menuTitle').textContent = `${D.surahs[s - 1]} – الآية ${AR(a)}`;
  $('#menu').hidden = false; $('#veil').hidden = false;
}
function onDoubleTap(el) { const [s, a] = ref(el); showWord(s, a, +el.dataset.w, el.textContent); }

function forAyah(s, a, fn) { document.querySelectorAll(`[data-a="${s}:${a}"]`).forEach(fn); }
function setSelected(r) {
  if (selected) forAyah(...selected, e => e.classList.remove('sel'));
  selected = r;
  if (r && !isBm(...r)) forAyah(...r, e => { if (e.classList.contains('w')) e.classList.add('sel'); });
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
  $('#menu').hidden = true; sheet.hidden = true; $('#veil').hidden = true;
  stopAudio(); setSelected(null);
}
$('#veil').addEventListener('click', closeAll);
$('#menu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !selected) return;
  if (b.dataset.act === 'tafsir') showTafsir(...selected);
  if (b.dataset.act === 'recite') showAudio(...selected);
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
    <div class="body">${body}</div>
    <div class="row">
      <button class="tbtn" id="tPrev" ${prev ? '' : 'disabled'}>الآية السابقة</button>
      <button class="tbtn" id="tNext" ${next ? '' : 'disabled'}>الآية التالية</button>
    </div>`);
  sheet.style.height = '85vh';
  if (prev) $('#tPrev').onclick = () => showTafsir(...prev);
  if (next) $('#tNext').onclick = () => showTafsir(...next);
}

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
    <div class="body" style="flex:none;margin:8px 0;${e ? '' : 'color:var(--muted)'}">${e ? esc(e.m) : 'لم يذكر كتاب «الميسّر في غريب القرآن» معنًى مفردًا لهذه الكلمة.'}</div>
    <div class="small">${ayahTitle(s, a)} · الميسّر في غريب القرآن</div>`, true);
}

// ---------- التلاوة ----------
const player = $('#player');
const A = { s: 0, a: 0, start: null, loaded: false, rec: store.get('reciter', 0), rate: store.get('rate', 1), cont: store.get('continuous', false) };
function audioUrl(s, a) { return `https://everyayah.com/data/${RECITERS[A.rec][1]}/${pad3(s)}${pad3(a)}.mp3`; }
function stopAudio() { player.pause(); player.removeAttribute('src'); player.load(); A.loaded = false; }
function playAyah() {
  $('#aErr') && ($('#aErr').textContent = '');
  player.src = audioUrl(A.s, A.a); player.playbackRate = A.rate; player.defaultPlaybackRate = A.rate;
  A.loaded = true; player.play().catch(() => {});
  setSelected([A.s, A.a]);
  const t = $('#aTitle'); if (t) t.textContent = ayahTitle(A.s, A.a);
}
player.addEventListener('play', paintAudio);
player.addEventListener('pause', paintAudio);
player.addEventListener('ended', () => {
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
    <label class="chk"><input type="checkbox" id="aCont" ${A.cont ? 'checked' : ''}>متابعة الآيات التالية تلقائيًا</label>`);
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
  $('#aCont').onchange = e => { A.cont = e.target.checked; store.set('continuous', A.cont); };
}

// ---------- التلميحات: بطاقة واحدة لكل تلميح ----------
const TIPS = [
  'انقر على الصفحة لتشغيل التمرير التلقائي، وانقر مرة أخرى لإيقافه. وزرّا + و − الأحمران لضبط سرعته.',
  'اضغط ضغطة مطوّلة على أي آية لتظهر قائمة فيها: التلاوة بأصوات عدد من القراء، وتفسير السعدي.',
  'انقر نقرتين على أي كلمة ليظهر معناها من كتاب «الميسّر في غريب القرآن».',
  'اضغط ضغطة مطوّلة على رقم الآية لتضع علامة الوقوف، فتتلوّن الآية وتعرف أين انتهيت. والضغطة نفسها تزيلها.',
  'انقر اسم السورة أعلى الشاشة لفهرس السور وللانتقال إلى علامة الوقوف، ورقم الصفحة للانتقال إلى صفحة، والجزء لقائمة الأجزاء.',
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
      if (t === 'never') store.set('hideTips', true);
      store.set('tipIdx', (tipIdx + 1) % TIPS.length); // في المرة القادمة يبدأ بالتلميح التالي
      el.remove();
    });
  }
  const paint = () => {
    el.querySelector('.count').textContent = `تلميح ${AR(tipIdx + 1)} من ${AR(TIPS.length)}`;
    el.querySelector('.tip-text').textContent = TIPS[tipIdx];
  };
  paint();
}

// ---------- الفهارس ----------
$('#hSurah').onclick = () => {
  sheet.style.height = '85vh';
  openSheet(`<div class="title">فهرس السور</div>
    ${bookmark ? `<button class="bmrow" id="goBm">◆ علامة الوقوف: ${ayahTitle(...bookmark)}</button>` : ''}
    <div class="list">${D.surahs.map((n, i) => `<button class="item" data-p="${D.surahPage[i + 1]}"><span class="n">${AR(i + 1)}</span>سورة ${n}<span class="p">ص ${AR(D.surahPage[i + 1])}</span></button>`).join('')}</div>`);
  if (bookmark) $('#goBm').onclick = () => { const p = D.ayahPage.get(bookmark.join(':')); closeAll(); goToPage(p); };
  sheet.querySelector('.list').onclick = e => { const b = e.target.closest('.item'); if (b) { closeAll(); goToPage(+b.dataset.p); } };
};
$('#hJuz').onclick = () => {
  sheet.style.height = '85vh';
  const pages = JUZ.map(([s, a]) => D.ayahPage.get(s + ':' + a));
  openSheet(`<div class="title">الأجزاء</div>
    <div class="list">${pages.map((p, i) => `<button class="item" data-p="${p}">الجزء ${JUZ_NAMES[i]}<span class="p">ص ${AR(p)}</span></button>`).join('')}</div>`);
  sheet.querySelector('.list').onclick = e => { const b = e.target.closest('.item'); if (b) { closeAll(); goToPage(+b.dataset.p); } };
};
$('#hPage').onclick = () => {
  sheet.style.height = '';
  openSheet(`<div class="title" style="text-align:center">الانتقال إلى صفحة</div>
    <input class="inp" id="pgIn" inputmode="numeric" placeholder="١ – ٦٠٤" style="margin:12px 0">
    <div class="row"><button class="tbtn" id="pgGo">انتقال</button><button class="tbtn" id="pgNo">إلغاء</button></div>`, true);
  const go = () => {
    const n = parseInt($('#pgIn').value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10);
    if (n >= 1 && n <= 604) { closeAll(); goToPage(n); }
  };
  $('#pgGo').onclick = go; $('#pgNo').onclick = closeAll;
  $('#pgIn').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#pgIn').focus();
};

boot().catch(e => { $('#loading').textContent = 'تعذّر تحميل بيانات المصحف: ' + e.message; });
