#!/usr/bin/env python3
"""بيانات «وضع النص»: نص المصحف بالرسم العثماني من مجمع الملك فهد (بيانات حفص، الإصدار ١٨)
المصدر: qurancomplex.gov.sa/techquran/dev — عبر github.com/thetruetruth/quran-data-kfgqpc
الاستعمال: prepare_text.py <hafsData_v18.json> <مجلد الإخراج>
يكتب text.json: قائمة بالصفحات (٦٠٤)، وكل صفحة قائمة آيات: [السورة، الآية، الجزء، النص]
"""
import json, os, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
assert len(d) == 6236
pages = [[] for _ in range(604)]
for x in d:
    pages[x['page'] - 1].append([x['sora'], x['aya_no'], x['jozz'], x['aya_text'].strip()])
os.makedirs(out, exist_ok=True)
json.dump(pages, open(os.path.join(out, 'text.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('text pages', sum(1 for p in pages if p), 'ayahs', sum(len(p) for p in pages))
