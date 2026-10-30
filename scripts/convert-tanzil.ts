/// <reference types="node" />
// One-time conversion of a Tanzil Quran XML export into data/quran/*.json.
//
// Usage: npx tsx scripts/convert-tanzil.ts <tanzil.xml> <out.json>
//
// Download the XML (not the .txt export, which prepends the basmala to verse 1
// of every surah) from https://tanzil.net/download/ — e.g.
//   https://tanzil.net/pub/download/index.php?quranType=uthmani-min&outType=xml&agree=true
//
// Verse text is copied verbatim (Tanzil's terms forbid changing it). The
// copyright block is kept in the output under "_copyright", as the terms require.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_SURAHS = 114;
const EXPECTED_AYAHS = 6236;

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : XML_ENTITIES[e.toLowerCase()]
  );

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: npx tsx scripts/convert-tanzil.ts <tanzil.xml> <out.json>');
    process.exit(1);
  }

  const xml = await readFile(input, 'utf8');

  const comment = xml.match(/<!--([\s\S]*?)-->/)?.[1];
  if (!comment || !comment.includes('Tanzil')) throw new Error('Tanzil copyright block not found');
  const copyright = comment.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim().length > 0);

  const out: Record<string, unknown> = { _copyright: copyright };
  let ayahCount = 0;

  for (const sura of xml.matchAll(/<sura\s+index="(\d+)"\s+name="([^"]+)"\s*>([\s\S]*?)<\/sura>/g)) {
    const [, index, name, body] = sura;
    const verses: Record<string, string> = {};
    for (const aya of body.matchAll(/<aya\s+index="(\d+)"\s+text="([^"]*)"/g)) {
      verses[aya[1]] = decodeXml(aya[2]);
      ayahCount++;
    }
    out[index] = { name: decodeXml(name), verses };
  }

  const surahCount = Object.keys(out).length - 1;
  if (surahCount !== EXPECTED_SURAHS || ayahCount !== EXPECTED_AYAHS) {
    throw new Error(`Unexpected counts: ${surahCount} surahs, ${ayahCount} ayahs (expected ${EXPECTED_SURAHS}/${EXPECTED_AYAHS})`);
  }

  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, JSON.stringify(out), 'utf8');
  console.log(`✓ ${surahCount} surahs, ${ayahCount} ayahs → ${output}`);
}

main().catch(err => {
  console.error('✗ convert-tanzil failed:', err);
  process.exit(1);
});
