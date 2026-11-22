#!/usr/bin/env python3
"""يجهّز بيانات التطبيق في app/src/main/assets من مصادرها:
- تخطيط المصحف وخطوط مجمع الملك فهد QPC V1: github.com/zonetecde/mushaf-layout
- تفسير السعدي: github.com/spa5k/tafsir_api
- السراج في بيان غريب القرآن: quranpedia.net (scripts/siraj-quranpedia-2013.json.gz)
الاستعمال: prepare_assets.py <مجلد mushaf-layout> <مجلد tafsir الخام> <مجلد assets>
مجلد tafsir الخام يحوي saadi/{1..114}.json و gharib/{1..114}.json
"""
import json, os, re, sys, glob

layout_dir, tafsir_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)

# ---------- المصحف ----------
pages = []
words_by_ayah = {}   # (s,a) -> [(w, text)]
surah_names = {}
for p in range(1, 605):
    d = json.load(open(os.path.join(layout_dir, 'mushaf', 'QPC1', 'page-%03d.json' % p), encoding='utf-8'))
    lines = []
    for ln in d['lines']:
        t = ln['type']
        if t == 'surah-header':
            s = int(ln['surah'])
            surah_names[s] = ln['text'].replace('سورة', '').strip()
            lines.append(['h', s])
        elif t == 'basmala':
            lines.append(['b', ln['qpcV1']])
        else:
            ws = []
            for w in ln['words']:
                s, a, wi = map(int, w['location'].split(':'))
                text = re.sub(r'[\s٠-٩۰-۹]+$', '', w['word']).strip()
                ws.append([s, a, wi, w['qpcV1'], text])
                words_by_ayah.setdefault((s, a), []).append((wi, text))
            lines.append(['t', ws])
    pages.append(lines)
json.dump({'pages': pages}, open(os.path.join(out, 'mushaf.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
json.dump([surah_names[i] for i in range(1, 115)], open(os.path.join(out, 'surahs.json'), 'w', encoding='utf-8'),
          ensure_ascii=False)
ayah_counts = [max(a for (s, a) in words_by_ayah if s == i) for i in range(1, 115)]
json.dump(ayah_counts, open(os.path.join(out, 'ayah_counts.json'), 'w'))

# سماكة التعويض لكل صفحة (خطوط الصفحات متفاوتة السماكة؛ انظر page_stroke.json)
import shutil as _sh
_sh.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'page_stroke.json'), os.path.join(out, 'page_stroke.json'))

# ---------- تفسير السعدي ----------
os.makedirs(os.path.join(out, 'saadi'), exist_ok=True)
missing = 0
for s in range(1, 115):
    d = json.load(open(os.path.join(tafsir_dir, 'saadi', '%d.json' % s), encoding='utf-8'))
    by = {x['ayah']: x['text'].strip() for x in d if x['text'].strip()}
    arr = []
    for a in range(1, ayah_counts[s - 1] + 1):
        if a in by:
            arr.append(by[a])
        else:
            missing += 1
            arr.append(None)   # يفسَّر مع ما قبله
    json.dump(arr, open(os.path.join(out, 'saadi', '%d.json' % s), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
print('saadi: ayahs without own entry =', missing)

# ---------- غريب القرآن: ربط كل عبارة بكلماتها في الآية ----------
DIAC = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ⁠‌‍]')
def norm(t, skel=False):
    t = re.sub(' (?=[ٰـ])', '', t)
    t = DIAC.sub('', t)
    t = (t.replace('ٱ', 'ا').replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
          .replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي').replace('ة', 'ه').replace('ء', ''))
    t = re.sub('[^ء-ي ]', '', t)
    if skel:
        t = re.sub('[اوي]', '', t)
    return t.strip()

os.makedirs(os.path.join(out, 'gharib'), exist_ok=True)
tot = ok = 0
# «السراج في بيان غريب القرآن» للخضيري — من بيانات الموسوعة القرآنية quranpedia.net (إصدار 2026-08-10)
import gzip
siraj = json.load(gzip.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'siraj-quranpedia-2013.json.gz'), 'rt', encoding='utf-8'))
by_surah = {}
for x in siraj['ayahs']:
    for c in x['content']:
        t = re.sub(r'<br\s*/?>', '\n', c['text']); t = re.sub(r'<[^>]+>', '', t)
        for ln in (l.strip() for l in t.split('\n')):
            if ':' not in ln:
                continue
            phrase, meaning = (p.strip() for p in ln.split(':', 1))
            by_surah.setdefault(x['surah'], []).append((x['ayah'], phrase, meaning))
def link(phrase, aw):
    for skel in (False, True):
        pw = [w for w in norm(phrase, skel).split() if w]
        keys = [norm(t, skel) for _, t in aw]
        n = len(pw)
        for i in range(len(keys) - n + 1):
            if keys[i:i + n] == pw:
                return [aw[j][0] for j in range(i, i + n)]
        if n > 1:
            c = [aw[j][0] for j, k in enumerate(keys) if k in pw]
            if len(c) * 2 >= n:
                return c
    return []

for s in range(1, 115):
    res = []
    for a, phrase, meaning in by_surah.get(s, []):
        tot += 1
        covered = []
        # الآية المذكورة أولًا، ثم ما جاورها (في الكتاب أرقام آيات قليلة فيها سهو)
        for cand in [a] + [a + d for k in range(1, 11) for d in (k, -k)]:
            if (s, cand) not in words_by_ayah:
                continue
            covered = link(phrase, words_by_ayah[(s, cand)])
            if covered:
                a = cand
                break
        if covered:
            ok += 1
        res.append({'a': a, 'w': covered, 'p': phrase, 'm': meaning})
    json.dump(res, open(os.path.join(out, 'gharib', '%d.json' % s), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
print('siraj entries', tot, 'linked to words', ok)

# ---------- الخطوط: woff2 -> ttf ----------
if '--no-fonts' not in sys.argv:
    from fontTools.ttLib import TTFont
    fdir = os.path.join(out, 'fonts')
    os.makedirs(fdir, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(layout_dir, 'fonts', 'QPC1', 'p*.woff2'))):
        f = TTFont(path); f.flavor = None
        for t in ['fpgm', 'prep', 'cvt ', 'hdmx', 'prop']:
            if t in f: del f[t]
        f.save(os.path.join(fdir, os.path.basename(path).replace('.woff2', '.ttf')))
    import shutil
    shutil.copy(os.path.join(layout_dir, 'fonts', 'QPC1', 'QPC1BSML.ttf'), os.path.join(fdir, 'bsml.ttf'))
    shutil.copy(os.path.join(layout_dir, 'fonts', 'Surahs.ttf'), os.path.join(fdir, 'surahs.ttf'))
    print('fonts done')
