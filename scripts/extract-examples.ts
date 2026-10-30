/// <reference types="node" />
// Builds data/style-examples.json for the article-writing engine:
//   - styleGuide: data/style-guide.md, verbatim
//   - examples:   10–15 paragraphs from articles 1–14 showing Dr. Rasheed's style markers
//
// Usage: npx tsx scripts/extract-examples.ts
// Run after `npm run blog` (it reads public/blog/blog.json).

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { containsQuranGlyphs, normalizeArabic } from '../src/utils/arabic';
import type { BlogCorpus, BlogParagraph, BlogArticle } from '../src/types/blog';
import type { StyleExample, StylePack } from '../src/types/article';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_FILE = path.join(ROOT, 'public', 'blog', 'blog.json');
const GUIDE_FILE = path.join(ROOT, 'data', 'style-guide.md');
const OUT_FILE = path.join(ROOT, 'data', 'style-examples.json');

const MAX_ORIGINAL_PART = 14; // articles 1–14 are Dr. Rasheed's own
const MIN_WORDS = 50;
const MAX_WORDS = 150;
const IDEAL_WORDS = 100;
// Two examples for the core idea-development moves, one for the rest → 15 in all
const CORE_CATEGORIES = new Set(['question', 'verse', 'refutation', 'iftiraa', 'result']);
const perCategory = (id: string) => (CORE_CATEGORIES.has(id) ? 2 : 1);

interface Category {
  id: string;
  label: string;
  // Tested against the normalized paragraph text (no diacritics, أ/إ/آ → ا)
  pattern: RegExp;
  // Prefer paragraphs where the marker opens the paragraph
  leading?: RegExp;
  requiresVerse?: boolean;
  // Where in the article the paragraph must sit (index among body paragraphs)
  position?: 'start' | 'end';
}

const OPENING_PARAGRAPHS = 4;
const CLOSING_PARAGRAPHS = 8;
const MIN_COMMENTARY_WORDS = 30; // verse examples need the author's own words too

const CATEGORIES: Category[] = [
  { id: 'opening', label: 'افتتاح بتلخيص الجزء السابق', pattern: /(وصلنا في الجزء السابق|خلص الجزء السابق|كان جل البحث في الجزء|في الجزء السابق|هذا هو الجزء)/, position: 'start' },
  { id: 'question', label: 'طرح الفكرة سؤالاً', pattern: /(السؤال\s*:|لماذا)[^.]*؟/, leading: /^(السؤال|لماذا|فلماذا)/ },
  { id: 'verse', label: 'الاستشهاد بالآية والتعليق عليها', pattern: /﴿/, requiresVerse: true },
  { id: 'refutation', label: 'نقد التفسير الموروث', pattern: /(يا ساده|سادتنا|اهل العلم|علماءنا|علمائنا|المفسرين)/ },
  { id: 'iftiraa', label: 'افتراء من عند أنفسنا', pattern: /افتراء من عند انفسنا/, leading: /^ا?فتراء/ },
  { id: 'result', label: 'النتيجة المرحلية', pattern: /النتيجه?ة?(\s+\S+)?\s*:/, leading: /^النتيج/ },
  { id: 'opinion', label: 'الحكم الشخصي (رأينا)', pattern: /(^راينا|في راينا|نحن نظن|لا اظن)/, leading: /^(راينا|نحن نظن)/ },
  // Patterns use normalized spelling: القارئ → القاري (ئ → ي)
  { id: 'reader', label: 'مخاطبة القارئ', pattern: /(عزيزي القاري|القاري الكريم)/ },
  { id: 'transition', label: 'الانتقال والعودة', pattern: /(عوده على بدء|عودة على بدء|فنعود|لنعود|نعود الان|وهذا يقودنا|ولعلكم تسالون|حتى نعود اليها)/ },
  { id: 'closing', label: 'التمهيد للجزء القادم', pattern: /(في الجزء القادم|في الجزء التالي|الجزء القادم|للحديث بقيه)/, position: 'end' },
];

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean).length;

// A 50–150-word window of whole sentences around the first sentence matching the
// category, so markers inside long paragraphs can still be used.
function excerptAround(text: string, pattern: RegExp): string | null {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.؟!:])\s+/);
  const hit = sentences.findIndex(s => pattern.test(normalizeArabic(s)));
  if (hit < 0) return null;
  let from = hit;
  let to = hit;
  const count = () => wordsOf(sentences.slice(from, to + 1).join(' '));
  if (count() > MAX_WORDS) return null;
  // Grow forward first (the marker usually opens the thought), then backward
  while (count() < IDEAL_WORDS) {
    if (to + 1 < sentences.length && wordsOf(sentences.slice(from, to + 2).join(' ')) <= MAX_WORDS) to++;
    else if (from > 0 && wordsOf(sentences.slice(from - 1, to + 1).join(' ')) <= MAX_WORDS) from--;
    else break;
  }
  return count() >= MIN_WORDS ? sentences.slice(from, to + 1).join(' ') : null;
}

// Verse text is collapsed to "﴿…﴾ [ref]": the examples show where a verse goes,
// never its wording (the model must not write verse text itself).
function collapseVerses(text: string): string {
  return text.replace(/[﴾﴿][^﴾﴿]*[﴾﴿]/g, '﴿…﴾');
}

function score(text: string, c: Category): number {
  const norm = normalizeArabic(text);
  let s = 100 - Math.abs(wordsOf(text) - IDEAL_WORDS);
  if (c.leading?.test(norm)) s += 40;
  // Excerpts carrying several markers teach more per token
  s += CATEGORIES.filter(other => other.id !== c.id && other.pattern.test(norm)).length * 5;
  return s;
}

interface Candidate {
  article: BlogArticle;
  p: BlogParagraph;
  index: number; // in article.paragraphs
  bodyIndex: number;
  bodyCount: number;
  hasVerifiedVerse: boolean;
}

const MAX_INTRO_WORDS = 40; // "قال تعالى:"-style lead-in kept before a verse

// Dr. Rasheed's paragraphs are short (~30 words), so an example is a run of
// consecutive paragraphs starting at the marker, never crossing a heading or a
// paragraph with unreadable glyphs. A long paragraph is cut to a sentence window.
function exampleText(c: Candidate, category: Category): { text: string; paragraphIds: string[] } | null {
  const ps = c.article.paragraphs;
  const usable = (p: BlogParagraph | undefined): p is BlogParagraph => p !== undefined && !p.isHeading && !containsQuranGlyphs(p.text);
  const clean = (p: BlogParagraph) => p.text.replace(/\s+/g, ' ').trim();
  if (wordsOf(c.p.text) > MAX_WORDS) {
    const excerpt = excerptAround(c.p.text, category.pattern);
    return excerpt && !containsQuranGlyphs(excerpt) ? { text: excerpt, paragraphIds: [c.p.id] } : null;
  }
  if (!usable(c.p)) return null;

  const window = [c.p];
  const total = () => wordsOf(window.map(clean).join(' '));
  const before = ps[c.index - 1];
  if (category.requiresVerse && usable(before) && wordsOf(before.text) <= MAX_INTRO_WORDS) window.unshift(before);
  for (let k = c.index + 1; total() < IDEAL_WORDS && k < ps.length; k++) {
    if (!usable(ps[k]) || total() + wordsOf(ps[k].text) > MAX_WORDS) break;
    window.push(ps[k]);
  }
  return total() >= MIN_WORDS ? { text: window.map(clean).join('\n'), paragraphIds: window.map(p => p.id) } : null;
}

async function main() {
  const corpus: BlogCorpus = JSON.parse(await readFile(CORPUS_FILE, 'utf8'));
  const styleGuide = await readFile(GUIDE_FILE, 'utf8');
  const articles: BlogArticle[] = corpus.articles.filter(a => a.partNumber <= MAX_ORIGINAL_PART);
  if (articles.length === 0) throw new Error(`No articles 1–${MAX_ORIGINAL_PART} in ${CORPUS_FILE}; run npm run blog first`);

  const candidates: Candidate[] = articles.flatMap(article => {
    const bodyCount = article.paragraphs.filter(p => !p.isHeading).length;
    let bodyIndex = -1;
    return article.paragraphs.flatMap((p, index) => {
      if (p.isHeading) return [];
      bodyIndex++;
      return [{
        article,
        p,
        index,
        bodyIndex,
        bodyCount,
        // Verse text verified against Tanzil (not original glyphs or typed text)
        hasVerifiedVerse: article.verses.some(v => v.paragraphId === p.id && v.replacedFromGlyphs),
      }];
    });
  });

  const used = new Set<string>();
  const examples: StyleExample[] = [];

  for (const category of CATEGORIES) {
    const ranked = candidates
      .filter(c => !used.has(c.p.id) && category.pattern.test(c.p.norm))
      .filter(c => !category.requiresVerse || c.hasVerifiedVerse)
      .filter(c =>
        category.position === 'start' ? c.bodyIndex < OPENING_PARAGRAPHS :
        category.position === 'end' ? c.bodyIndex >= c.bodyCount - CLOSING_PARAGRAPHS :
        true
      )
      .map(c => {
        const window = exampleText(c, category);
        return window ? { ...c, text: collapseVerses(window.text), paragraphIds: window.paragraphIds } : null;
      })
      .filter((c): c is Candidate & { text: string; paragraphIds: string[] } => c !== null)
      .filter(c => !category.requiresVerse || wordsOf(c.text.replace(/﴿…﴾(\s*\[[^\]]*\])?/g, '')) >= MIN_COMMENTARY_WORDS)
      .sort((a, b) => score(b.text, category) - score(a.text, category));

    const usedArticles = new Set<string>();
    for (const { article, p, text, paragraphIds } of ranked) {
      if (examples.filter(e => e.category === category.id).length >= perCategory(category.id)) break;
      if (usedArticles.has(article.id)) continue; // spread examples over articles
      if (paragraphIds.some(id => used.has(id))) continue; // windows must not overlap
      usedArticles.add(article.id);
      paragraphIds.forEach(id => used.add(id));
      examples.push({
        id: `${category.id}-${examples.filter(e => e.category === category.id).length + 1}`,
        category: category.id,
        label: category.label,
        articleId: article.id,
        paragraphId: p.id,
        words: wordsOf(text),
        text,
      });
    }

    const found = examples.filter(e => e.category === category.id).length;
    console.log(`  ${found === perCategory(category.id) ? '✓' : '⚠'} ${category.label}: ${found}`);
  }

  // Runs on every build: leave the committed file alone when nothing changed.
  const previous: StylePack | null = existsSync(OUT_FILE) ? JSON.parse(await readFile(OUT_FILE, 'utf8')) : null;
  if (previous && previous.styleGuide === styleGuide && JSON.stringify(previous.examples) === JSON.stringify(examples)) {
    console.log(`✓ ${examples.length} examples + style guide unchanged (${path.relative(ROOT, OUT_FILE)})`);
    return;
  }
  const pack: StylePack = { generatedAt: new Date().toISOString(), styleGuide, examples };
  await writeFile(OUT_FILE, JSON.stringify(pack, null, 2), 'utf8');
  console.log(`✓ ${examples.length} examples + style guide → ${path.relative(ROOT, OUT_FILE)}`);
  if (normalizeArabic(styleGuide).length < 500) console.warn('  ⚠ style guide looks empty');
}

main().catch(err => {
  console.error('✗ extract-examples failed:', err);
  process.exit(1);
});
