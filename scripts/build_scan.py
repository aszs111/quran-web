"""
يبني صور صفحات مصحف المدينة القديم (1405هـ، مجمع الملك فهد) بلا إطار، من مسح أرشيف الإنترنت
(mushaf_madinah_tercetak، الملف «01. مصحف المدينة ملون القديم - 1405_1984»).

لكل صفحة من 3 إلى 604:
- نقصّ داخل الإطار الداخلي، ثم نحدد مراكز الأسطر الخمسة عشر ونقصّ بحيث يكون لكل سطر خانة متساوية
  (فتنطبق الأسطر على طبقة الكلمات الشفافة في التطبيق).
- نحوّل لون الورق إلى خلفية التطبيق مع إبقاء الحبر والألوان.
- نحفظ webp بعرض ثابت، ونكتب index.json بنسبة ارتفاع كل صفحة إلى عرضها.
الاستعمال: build_scan.py <مجلد jp2> <ملف page_numbers.json> <مجلد الإخراج>
"""
import sys, os, json, glob, re
from multiprocessing import Pool
import numpy as np
from PIL import Image

BG = np.array((220, 234, 246), float)
OUT_W = 1080

def groups(idx):
    g = []
    for i in idx:
        if g and i - g[-1][-1] <= 3: g[-1].append(i)
        else: g.append([i])
    return [(x[0], x[-1]) for x in g]

def process(args):
    page, src, outdir = args
    im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(float); H, W, _ = a.shape
    dark = a.mean(2) < 140
    rg = groups(np.where(dark.mean(1) > 0.5)[0]); cg = groups(np.where(dark.mean(0) > 0.5)[0])
    top = max(e for s, e in rg if s < H / 2); bot = min(s for s, e in rg if s > H / 2)
    lef = max(e for s, e in cg if s < W / 2); rig = min(s for s, e in cg if s > W / 2)
    x0, y0 = lef + 10, top + 10
    c = a[y0:bot - 10, x0:rig - 10]
    ink = (c.mean(2) < 110) & ((c.max(2) - c.min(2)) < 60)
    prof = np.convolve(ink.mean(1), np.ones(25) / 25, 'same'); h = len(prof)
    cent = np.array([np.argmax(prof[int(k * h / 15):int((k + 1) * h / 15)]) + int(k * h / 15) for k in range(15)], float)
    k = np.arange(15)
    # خط مستقيم عبر المراكز مع إسقاط الشواذ (سطر قصير أو زخرفة)
    for _ in range(3):
        A = np.vstack([k, np.ones(15)]).T
        pitch, c0 = np.linalg.lstsq(A, cent, rcond=None)[0]
        res = cent - (c0 + pitch * k); bad = np.abs(res) > 18
        if not bad.any(): break
        cent[bad] = (c0 + pitch * k)[bad]
    cols = np.where(ink.mean(0) > 0.002)[0]
    l, r = (cols[0], cols[-1]) if len(cols) else (0, c.shape[1] - 1)
    t = c0 - pitch / 2; b = c0 + pitch * 14.5
    box = (int(x0 + l), int(y0 + t), int(x0 + r + 1), int(y0 + b))
    cr = np.asarray(im.crop(box)).astype(float)
    flat = cr.reshape(-1, 3); paper = np.median(flat[flat.mean(1) > 200], axis=0)
    o = (np.clip(cr / paper, 0, 1) * BG).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(o)
    oh = round(img.height * OUT_W / img.width)
    img = img.resize((OUT_W, oh), Image.LANCZOS)
    img.save(os.path.join(outdir, f'{page:03d}.webp'), quality=78, method=6)
    return page, oh / OUT_W, float(pitch), int(np.abs(res).max())

AR = str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789')

def main(jp2dir, pnjson, outdir):
    os.makedirs(outdir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(jp2dir, '**', '*.jp2'), recursive=True))
    leaf = {int(re.search(r'_(\d{4})\.jp2$', f).group(1)): f for f in files}
    pmap = {}
    try:
        pn = json.load(open(pnjson))
        for e in pn.get('pages', []):
            num = str(e.get('pageNumber', '')).translate(AR).strip()
            if num.isdigit() and e.get('leafNum') in leaf: pmap.setdefault(int(num), leaf[e['leafNum']])
    except Exception as ex:
        print('page_numbers.json:', ex)
    print('mapped from json:', len(pmap))
    # ما لم يُعرف رقمه نستنتجه بإزاحة الورقة (الصفحة 8 = الورقة 12)
    off = 4
    jobs = [(p, pmap.get(p) or leaf.get(p + off), outdir) for p in range(3, 605)]
    miss = [p for p, f, _ in jobs if not f]
    if miss: print('missing pages', miss)
    jobs = [j for j in jobs if j[1]]
    with Pool(os.cpu_count()) as pool:
        res = sorted(pool.map(process, jobs))
    idx = {str(p): round(ratio, 4) for p, ratio, _, _ in res}
    bad = [(p, mx) for p, _, _, mx in res if mx > 18]
    print('pitch range', min(r[2] for r in res), max(r[2] for r in res), 'irregular', bad[:40])
    json.dump({'w': OUT_W, 'ratio': idx}, open(os.path.join(outdir, 'index.json'), 'w'))

if __name__ == '__main__':
    main(*sys.argv[1:4])
