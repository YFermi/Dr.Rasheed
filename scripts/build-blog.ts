/// <reference types="node" />
// Converts the Story-of-Lot .docx files into public/blog/blog.json.
//
// Usage: npx tsx scripts/build-blog.ts [sourceDir] [outFile]
//   defaults: content/blog/قصة لوط/  →  public/blog/blog.json
//
// A file containing several "المقال الأول / المقال الثاني …" headings is split into
// one article per heading; any other file is a single article whose part number
// comes from its filename (e.g. "Part 15.docx", "الجزء ١٥.docx").

import mammoth from 'mammoth';
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractVerses, normalizeArabic } from '../src/utils/arabic';
import type { BlogArticle, BlogCorpus, BlogParagraph } from '../src/types/blog';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.resolve(process.argv[2] ?? path.join(ROOT, 'content', 'blog', 'قصة لوط'));
const OUT_FILE = path.resolve(process.argv[3] ?? path.join(ROOT, 'public', 'blog', 'blog.json'));

const CORPUS_VERSION = 1;

// Word installed in Arabic names its built-in heading styles "عنوان 1" etc.
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='العنوان'] => h1:fresh",
  ...[1, 2, 3, 4, 5, 6].map(n => `p[style-name='عنوان ${n}'] => h${n}:fresh`),
];

// ---------------------------------------------------------------------------
// Article heading detection
// ---------------------------------------------------------------------------

// Ordinals as they look after normalizeArabic (أ → ا).
const ORDINALS: [string, number][] = [
  ['الاول', 1], ['الثاني', 2], ['الثالث', 3], ['الرابع', 4], ['الخامس', 5],
  ['السادس', 6], ['السابع', 7], ['الثامن', 8], ['التاسع', 9], ['العاشر', 10],
  ['الحادي عشر', 11], ['الثاني عشر', 12], ['الثالث عشر', 13], ['الرابع عشر', 14],
  ['الخامس عشر', 15], ['السادس عشر', 16], ['السابع عشر', 17], ['الثامن عشر', 18],
  ['التاسع عشر', 19], ['العشرون', 20],
];
// Longest first so "الثاني عشر" is tried before "الثاني".
const ORDINAL_ALT = [...ORDINALS].sort((a, b) => b[0].length - a[0].length).map(o => o[0]).join('|');
const ARTICLE_HEADING_RE = new RegExp(
  `^[\\s\\-–—:.*#]*(?:ال)?مقال[ةه]?\\s*(?:رقم\\s*)?(?:(${ORDINAL_ALT})(?![\\u0621-\\u064A])|\\(?(\\d+)\\)?)`
);

// A non-heading paragraph only counts as an article title when it is this short.
const MAX_FALLBACK_TITLE_LENGTH = 120;

function articleNumberOf(norm: string): number | null {
  const m = norm.match(ARTICLE_HEADING_RE);
  if (!m) return null;
  if (m[1]) return ORDINALS.find(o => o[0] === m[1])![1];
  return Number(m[2]);
}

// ---------------------------------------------------------------------------
// HTML → blocks
// ---------------------------------------------------------------------------

interface Block {
  tag: string;
  html: string;
  text: string;
  norm: string;
}

const VOID_TAGS = new Set(['br', 'img', 'hr']);

// mammoth emits well-formed, flat-ish HTML; walk the tags and cut at depth 0
// so nested lists and tables stay inside their block.
function splitTopLevelBlocks(html: string): { tag: string; html: string }[] {
  const blocks: { tag: string; html: string }[] = [];
  const tagRe = /<(\/?)([a-zA-Z0-9]+)\b[^>]*?(\/?)>/g;
  let depth = 0;
  let start = 0;
  let topTag = '';

  for (const m of html.matchAll(tagRe)) {
    const [whole, closing, rawName, selfClosing] = m;
    const name = rawName.toLowerCase();
    if (VOID_TAGS.has(name) || selfClosing) continue;

    if (!closing) {
      if (depth === 0) {
        start = m.index!;
        topTag = name;
      }
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        blocks.push({ tag: topTag, html: html.slice(start, m.index! + whole.length) });
      }
    }
  }
  return blocks;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
      if (ent[0] === '#') {
        const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return String.fromCodePoint(code);
      }
      return ENTITIES[ent.toLowerCase()] ?? whole;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function toBlocks(html: string): Block[] {
  return splitTopLevelBlocks(html)
    .map(b => {
      const text = htmlToText(b.html);
      return { tag: b.tag, html: b.html, text, norm: normalizeArabic(text) };
    })
    .filter(b => b.text.length > 0);
}

const headingLevelOf = (tag: string) => (/^h[1-6]$/.test(tag) ? Number(tag[1]) : undefined);

// ---------------------------------------------------------------------------
// Blocks → articles
// ---------------------------------------------------------------------------

interface Section {
  partNumber: number;
  title: string;
  blocks: Block[];
}

// Series headings number each part at the end: "لماذا قدّم نبي الله لوط بناته بدلاً من ضيوفه (3)؟"
const SERIES_PART_RE = /\((\d+)\)\s*[؟?]?\s*$/;

function headingPartNumber(b: Block): number | null {
  const level = headingLevelOf(b.tag);
  if (level === undefined) return null;
  const byWord = articleNumberOf(b.norm);
  if (byWord !== null) return byWord;
  const m = level === 1 ? b.norm.match(SERIES_PART_RE) : null;
  return m ? Number(m[1]) : null;
}

// A heading may be preceded by its own title lines, e.g. "لماذا قدم …؟" then
// "(الجزء الثالث)"; those belong to the new article, not the end of the previous one.
const PART_LINE_RE = /^\(?الجزء\s/;
const MAX_PART_LINE_LENGTH = 40;

function sectionStart(blocks: Block[], headingIndex: number): number {
  const isPlainShort = (b: Block | undefined, max: number) => b !== undefined && !headingLevelOf(b.tag) && b.norm.length <= max;
  const prev = blocks[headingIndex - 1];
  if (!isPlainShort(prev, MAX_PART_LINE_LENGTH) || !PART_LINE_RE.test(prev.norm)) return headingIndex;
  return isPlainShort(blocks[headingIndex - 2], MAX_FALLBACK_TITLE_LENGTH) ? headingIndex - 2 : headingIndex - 1;
}

function findSplitPoints(blocks: Block[]): { index: number; partNumber: number }[] {
  const byHeadings = blocks
    .map((b, index) => ({ index, partNumber: headingPartNumber(b) }))
    .filter((s): s is { index: number; partNumber: number } => s.partNumber !== null)
    .map(s => ({ ...s, index: sectionStart(blocks, s.index) }));
  if (byHeadings.length >= 2) return byHeadings;

  return blocks
    .map((b, index) => ({
      index,
      partNumber: b.norm.length <= MAX_FALLBACK_TITLE_LENGTH ? articleNumberOf(b.norm) : null,
    }))
    .filter((s): s is { index: number; partNumber: number } => s.partNumber !== null);
}

function titleFrom(blocks: Block[], fallback: string): string {
  const first = blocks[0];
  if (!first) return fallback;
  // A bare "المقال الأول" / "الجزء السادس عشر:" heading followed by a heading → join them.
  const second = blocks[1];
  const bareLabel = first.text.replace(/[\s:：]+$/, '');
  const isBareLabel =
    (articleNumberOf(first.norm) !== null || PART_LINE_RE.test(first.norm)) &&
    !bareLabel.includes(':') &&
    first.norm.length < 25;
  if (isBareLabel && second && headingLevelOf(second.tag)) {
    return `${bareLabel}: ${second.text}`;
  }
  const heading = blocks.find(b => headingLevelOf(b.tag));
  const text = (heading ?? first).text.replace(/\s+/g, ' ');
  return text.length > MAX_FALLBACK_TITLE_LENGTH ? `${text.slice(0, MAX_FALLBACK_TITLE_LENGTH)}…` : text;
}

function splitIntoSections(blocks: Block[], file: string): Section[] | null {
  const points = findSplitPoints(blocks);
  if (points.length < 2) return null;

  let sections: Section[] = points.map((p, i) => {
    const sectionBlocks = blocks.slice(p.index, points[i + 1]?.index ?? blocks.length);
    return { partNumber: p.partNumber, title: titleFrom(sectionBlocks, file), blocks: sectionBlocks };
  });

  // The same number twice usually means a table of contents line plus the real
  // article; keep the longer section.
  const best = new Map<number, Section>();
  for (const s of sections) {
    const prev = best.get(s.partNumber);
    if (!prev || wordsIn(s.blocks) > wordsIn(prev.blocks)) best.set(s.partNumber, s);
  }
  const dropped = sections.filter(s => best.get(s.partNumber) !== s);
  if (dropped.length > 0) {
    console.warn(`  ⚠ ${file}: ignored ${dropped.length} short duplicate heading section(s) (likely a table of contents).`);
  }
  sections = sections.filter(s => best.get(s.partNumber) === s);

  if (points[0].index > 0) {
    console.warn(`  ⚠ ${file}: skipped ${points[0].index} paragraph(s) before the first article heading.`);
  }
  return sections;
}

function wordsIn(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + (b.text.match(/\S+/g)?.length ?? 0), 0);
}

function partNumberFromFilename(file: string): number | null {
  const m = path.parse(file).name.match(/[0-9٠-٩]+/);
  return m ? Number(normalizeArabic(m[0])) : null;
}

function buildArticle(section: Section, id: string, paragraphPrefix: string, sourceFile: string): BlogArticle {
  const paragraphs: BlogParagraph[] = section.blocks.map((b, i) => {
    const level = headingLevelOf(b.tag);
    return {
      id: `${paragraphPrefix}-${i}`,
      html: b.html,
      text: b.text,
      norm: b.norm,
      isHeading: level !== undefined,
      ...(level !== undefined ? { headingLevel: level } : {}),
    };
  });

  return {
    id,
    partNumber: section.partNumber,
    title: section.title,
    sourceFile,
    paragraphs,
    verses: paragraphs.flatMap(p => extractVerses(p.text, p.id, section.partNumber)),
    wordCount: wordsIn(section.blocks),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function writeCorpus(articles: BlogArticle[]): Promise<BlogCorpus> {
  const corpus: BlogCorpus = {
    version: CORPUS_VERSION,
    generatedAt: new Date().toISOString(),
    totalArticles: articles.length,
    totalParagraphs: articles.reduce((n, a) => n + a.paragraphs.length, 0),
    totalVerses: articles.reduce((n, a) => n + a.verses.length, 0),
    articles,
  };
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(corpus, null, 2), 'utf8');
  return corpus;
}

async function main() {
  const files = existsSync(SRC_DIR)
    ? (await readdir(SRC_DIR))
        .filter(f => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
        .sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }))
    : [];

  if (files.length === 0) {
    // The .docx sources are not in git, so a fresh clone has none: never replace
    // a committed corpus with an empty one.
    if (existsSync(OUT_FILE)) {
      console.log('ℹ No .docx files found. Keeping existing blog.json.');
      console.log(`    source: ${SRC_DIR}`);
      return;
    }
    console.log(`ℹ No .docx files found in:\n    ${SRC_DIR}`);
    console.log('  Place the Story of Lot .docx files there and run: npm run blog');
    await writeCorpus([]);
    console.log(`  Wrote an empty corpus to ${path.relative(ROOT, OUT_FILE)}`);
    return;
  }

  console.log(`Reading ${files.length} file(s) from ${path.relative(ROOT, SRC_DIR)}`);
  const pending: { section: Section; sourceFile: string }[] = [];
  const singles: { file: string; blocks: Block[]; partNumber: number | null }[] = [];

  for (const file of files) {
    const { value: html, messages } = await mammoth.convertToHtml(
      { path: path.join(SRC_DIR, file) },
      { styleMap: STYLE_MAP }
    );
    const warnings = messages.length;
    const blocks = toBlocks(html);

    const sections = splitIntoSections(blocks, file);
    if (sections) {
      console.log(`  • ${file}: ${sections.length} articles (${blocks.length} paragraphs)${warnings ? `, ${warnings} mammoth warnings` : ''}`);
      sections.forEach(section => pending.push({ section, sourceFile: file }));
    } else {
      const partNumber = partNumberFromFilename(file) ?? (blocks[0] ? articleNumberOf(blocks[0].norm) : null);
      console.log(`  • ${file}: 1 article, part ${partNumber ?? '?'} (${blocks.length} paragraphs)${warnings ? `, ${warnings} mammoth warnings` : ''}`);
      singles.push({ file, blocks, partNumber });
    }
  }

  // Files with no detectable number go after the highest known part.
  let nextPart = Math.max(0, ...pending.map(p => p.section.partNumber), ...singles.map(s => s.partNumber ?? 0)) + 1;
  for (const s of singles) {
    if (s.partNumber === null) {
      console.warn(`  ⚠ ${s.file}: no part number in filename or first line; assigned part ${nextPart}.`);
      s.partNumber = nextPart++;
    }
    pending.push({
      section: { partNumber: s.partNumber, title: titleFrom(s.blocks, path.parse(s.file).name), blocks: s.blocks },
      sourceFile: s.file,
    });
  }

  pending.sort((a, b) => a.section.partNumber - b.section.partNumber);

  // Duplicate part numbers keep both articles but get distinct ids (lot-14, lot-14-b).
  const seen = new Map<number, number>();
  const articles = pending.map(({ section, sourceFile }) => {
    const n = section.partNumber;
    const dup = seen.get(n) ?? 0;
    seen.set(n, dup + 1);
    const suffix = dup === 0 ? '' : String.fromCharCode(0x61 + dup); // b, c, …
    if (dup > 0) console.warn(`  ⚠ Part ${n} appears more than once (${sourceFile}); using id lot-${String(n).padStart(2, '0')}-${suffix}.`);
    const id = `lot-${String(n).padStart(2, '0')}${suffix ? `-${suffix}` : ''}`;
    return buildArticle(section, id, `p${n}${suffix}`, sourceFile);
  });

  const corpus = await writeCorpus(articles);
  console.log(
    `✓ ${corpus.totalArticles} articles, ${corpus.totalParagraphs} paragraphs, ${corpus.totalVerses} verses → ${path.relative(ROOT, OUT_FILE)}`
  );
}

main().catch(err => {
  console.error('✗ build-blog failed:', err);
  process.exit(1);
});
