#!/usr/bin/env bash
# يبني الموقع في مجلد site/ من مصادر البيانات المثبّتة
set -euo pipefail
LAYOUT_SHA=421e9eaa991897ecd50d7abb79160651a45976d3
TAFSIR_SHA=311a038bf532fa84566ca1bb2cdbeb210da3d5ed
rm -rf src site && mkdir -p src/layout src/tafsir/saadi site
curl -sfL "https://codeload.github.com/zonetecde/mushaf-layout/tar.gz/$LAYOUT_SHA" | tar xz -C src/layout --strip-components=1
seq 1 114 | xargs -P 16 -I{} sh -c '
  curl -sfL --retry 3 -o src/tafsir/saadi/{}.json  https://raw.githubusercontent.com/spa5k/tafsir_api/'$TAFSIR_SHA'/tafsir/ar-tafseer-al-saddi/{}.json'
test "$(ls src/tafsir/saadi | wc -l)" -eq 114
HAFS_SHA=281dbbe8eed1370daa5a023b6cd81655cbfd6473
curl -sfL --retry 3 -o src/hafsData_v18.json https://raw.githubusercontent.com/thetruetruth/quran-data-kfgqpc/$HAFS_SHA/hafs/data/hafsData_v18.json
curl -sfL --retry 3 -o src/hafs.woff2 https://raw.githubusercontent.com/thetruetruth/quran-data-kfgqpc/$HAFS_SHA/hafs/font/hafs.18.woff2
python3 scripts/prepare_assets.py src/layout src/tafsir site/data --no-fonts
cp scripts/line_widths.json site/data/
python3 scripts/prepare_text.py src/hafsData_v18.json site/data
cp -r static/. site/
cp src/hafs.woff2 site/fonts/hafs.woff2
cp src/layout/fonts/QPC1/p*.woff2 site/fonts/
cp src/layout/fonts/QPC1/QPC1BSML.ttf site/fonts/bsml.ttf
# رقم إصدار لملفات الواجهة حتى لا يخلط المتصفح نسخة قديمة بجديدة
V="${GITHUB_RUN_NUMBER:-dev}-$(date +%s)"
sed -i "s/app\.css\"/app.css?v=$V\"/; s/app\.js\"/app.js?v=$V\"/" site/index.html
sed -i "s/__BUILD__/${GITHUB_RUN_NUMBER:-dev}-$(date +%s)/" site/sw.js
touch site/.nojekyll
du -sh site
