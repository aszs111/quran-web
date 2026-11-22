# يرسم شعار «مثاني»: زخرفة دائرية أصلية، وفي وسطها الكلمة بخط ثلث (ae_Tholoth، رخصة GPL من عربآيز) محوّلة إلى مسارات
import math, uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

GREEN, RED, GOLD, DARK = '#0E5A45', '#8E1B1B', '#D7B36A', '#123F33'
C = 500  # مركز لوحة 1000×1000
P = []   # (لون، مسار)

def poly(pts): return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z'
def circle(r, cx=C, cy=C): return f'M{cx-r:.1f},{cy:.1f} a{r:.1f},{r:.1f} 0 1,0 {2*r:.1f},0 a{r:.1f},{r:.1f} 0 1,0 {-2*r:.1f},0 Z'
def ring(r1, r2): return circle(r1) + ' ' + circle(r2)  # يُرسم بتعبئة زوجية-فردية
def pol(r, a): return (C + r * math.sin(a), C - r * math.cos(a))

# ١) أشعة مقوّسة متناوبة الطول (طولى بزهرة ثلاثية، وقصرى بنقطة)
def qpath(pts):  # مسار بمنحنيات تربيعية: [(نقطة), (تحكم, نقطة), ...]
    d = f'M{pts[0][0]:.1f},{pts[0][1]:.1f}'
    for c, p in pts[1:]: d += f' Q{c[0]:.1f},{c[1]:.1f} {p[0]:.1f},{p[1]:.1f}'
    return d + ' Z'
N = 32
for k in range(N):
    a = 2 * math.pi * k / N; long = k % 2 == 0
    tip = 455 if long else 405; w = math.pi / N * (0.95 if long else 0.75)
    for col, grow in ((GOLD, 7), (RED, 0)):
        r0 = 330 - grow
        shape = [pol(r0, a - w - grow / 400),
                 (pol(380, a - w * 1.25), pol(tip - 40 + grow, a - w * 0.18)),
                 (pol(tip + grow, a - w * 0.05), pol(tip + grow, a)),
                 (pol(tip + grow, a + w * 0.05), pol(tip - 40 + grow, a + w * 0.18)),
                 (pol(380, a + w * 1.25), pol(r0, a + w + grow / 400))]
        P.append((col, qpath(shape)))
    if long:  # زهرة ثلاثية عند الرأس
        for dd, rr in ((0, 9), (-0.035, 6), (0.035, 6)):
            cx, cy = pol(tip + 18 if dd == 0 else tip + 8, a + dd); P.append((GOLD, circle(rr, cx, cy)))
        cx, cy = pol(tip + 34, a); P.append((GOLD, circle(3.5, cx, cy)))
    else:
        cx, cy = pol(tip + 12, a); P.append((GOLD, circle(5, cx, cy)))

# ٢) حلقة خضراء داكنة فيها دوائر متشابكة ذهبية
P.append((GOLD, circle(352)))
P.append((DARK, circle(347)))
M = 40
for k in range(M):
    a = 2 * math.pi * k / M; cx, cy = pol(322, a)
    P.append((GOLD, ring(22, 19.5).replace(f'M{C-22:.1f},{C:.1f}', f'M{cx-22:.1f},{cy:.1f}').replace(f'M{C-19.5:.1f},{C:.1f}', f'M{cx-19.5:.1f},{cy:.1f}')))
    bx, by = pol(345, a + math.pi / M); P.append((GOLD, circle(3, bx, by)))
P.append((RED, circle(298)))
# ٣) حلقات ذهبية حول القرص
P.append((GOLD, ring(300, 291)))
P.append((GOLD, ring(283, 279.5)))
for k in range(48):
    a = 2 * math.pi * k / 48; cx, cy = pol(287, a); P.append((GOLD, circle(2.6, cx, cy)))

# ٤) الكلمة
font_path = '/home/claude/splash/ae_Tholoth.ttf'
face = hb.Face(hb.Blob.from_file_path(font_path)); hfont = hb.Font(face)
buf = hb.Buffer(); buf.add_str('مَثَانِي'); buf.guess_segment_properties(); hb.shape(hfont, buf, {})
tt = TTFont(font_path); gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
xs = 0; glyphs = []
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    glyphs.append((order[info.codepoint], xs + pos.x_offset, pos.y_offset)); xs += pos.x_advance
# حدود الكلمة لتوسيطها
from fontTools.pens.boundsPen import BoundsPen
minx = miny = 1e9; maxx = maxy = -1e9
for g, x, y in glyphs:
    bp = BoundsPen(gs); gs[g].draw(TransformPen(bp, (1, 0, 0, 1, x, y)))
    if bp.bounds:
        minx, miny = min(minx, bp.bounds[0]), min(miny, bp.bounds[1]); maxx, maxy = max(maxx, bp.bounds[2]), max(maxy, bp.bounds[3])
w, h = maxx - minx, maxy - miny
s = min(450 / w, 360 / h)
tx = C - (minx + w / 2) * s; ty = C + (miny + h / 2) * s
text = []
for g, x, y in glyphs:
    sp = SVGPathPen(gs); gs[g].draw(TransformPen(sp, (s, 0, 0, -s, tx + x * s, ty - y * s))); d = sp.getCommands()
    if d: text.append(d)
P.append((GOLD, ' '.join(text)))

def svg(bg=True, size=1000):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="{size}" height="{size}">']
    if bg: out.append(f'<rect width="1000" height="1000" fill="{GREEN}"/>')
    for col, d in P: out.append(f'<path fill="{col}" fill-rule="evenodd" d="{d}"/>')
    out.append('</svg>'); return '\n'.join(out)

open('/home/claude/splash/mathani.svg', 'w').write(svg(False))
open('/home/claude/splash/mathani_bg.svg', 'w').write(svg(True))

# VectorDrawable للأندرويد
vd = ['<?xml version="1.0" encoding="utf-8"?>',
      '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="300dp" android:height="300dp" android:viewportWidth="1000" android:viewportHeight="1000">']
for col, d in P:
    vd.append(f'  <path android:fillColor="{col}" android:fillType="evenOdd" android:pathData="{d}"/>')
vd.append('</vector>')
open('/home/claude/splash/ic_mathani.xml', 'w').write('\n'.join(vd))
print('ok', len(P))
