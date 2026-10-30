# Quran text (Tanzil Project)

Canonical Quran text used by `scripts/build-blog.ts` to replace the Quran-font glyphs
(Quran Word / KFGQPC QCF2 page fonts) in Dr. Rasheed's `.docx` files.

| File | Tanzil edition | Used for |
| --- | --- | --- |
| `quran-uthmani.json` | Uthmani Minimal, v1.1 | displayed verse text |
| `quran-simple-clean.json` | Simple Clean, v1.1 | search index (standard spelling, no diacritics) |

Format: `{ "_copyright": [...], "1": { "name": "الفاتحة", "verses": { "1": "…" } }, … }`
— 114 surahs, 6,236 ayahs. The basmala is not part of verse 1 (except in Al-Fatiha).

## Source and license

Text © 2007-2026 [Tanzil Project](https://tanzil.net), Creative Commons Attribution 3.0,
copied **verbatim** (Tanzil's terms do not allow changing it). The full copyright notice
is kept in each JSON file under `_copyright`, and the app links to tanzil.net wherever it
shows this text (the blog reader footer).

## Regenerating

Download the **XML** export (the `.txt` export prepends the basmala to verse 1 of every
surah), then convert:

```bash
curl -L -o uthmani-min.xml "https://tanzil.net/pub/download/index.php?quranType=uthmani-min&outType=xml&agree=true"
curl -L -o simple-clean.xml "https://tanzil.net/pub/download/index.php?quranType=simple-clean&outType=xml&agree=true"
npx tsx scripts/convert-tanzil.ts uthmani-min.xml data/quran/quran-uthmani.json
npx tsx scripts/convert-tanzil.ts simple-clean.xml data/quran/quran-simple-clean.json
npm run blog
```
