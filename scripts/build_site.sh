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
python3 scripts/prepare_assets.py src/layout src/tafsir site/data --no-fonts
cp scripts/line_widths.json site/data/
cp -r static/. site/
cp src/layout/fonts/QPC1/p*.woff2 site/fonts/
cp src/layout/fonts/QPC1/QPC1BSML.ttf site/fonts/bsml.ttf
sed -i "s/__BUILD__/${GITHUB_RUN_NUMBER:-dev}-$(date +%s)/" site/sw.js
touch site/.nojekyll
du -sh site
