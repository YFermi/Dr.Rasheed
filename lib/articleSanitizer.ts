// =====================================================================
//  وحدة تنظيف وتنقية المقالات — Article Sanitizer
//  قاعدة مطلقة: لا يُمس أي نص داخل ﴿ ... ﴾ (نص عثماني موثّق من تنزيل).
// =====================================================================
// Two faces of one pipeline:
// - sanitizeArticle(text): the article as flat text, verses as «﴿…﴾ [ref]»
//   masked with placeholders before any change and restored verbatim after;
// - sanitizeArticleBlocks(draft): the app's structured draft, where each verse is
//   its own block (never passed to any text filter) — used on the assembled
//   article; sanitizeProse cleans one paragraph in the article endpoints.
// Arabic words are matched with Arabic-letter boundaries: JavaScript's \b only
// knows ASCII letters and never matches next to an Arabic one.

// The series' closing line, as Dr. Rasheed writes it (13 of the 18 corpus articles)
export const CLOSING_LINE = 'وللحديث بقية';

const AR = '\\u0621-\\u065F\\u0670-\\u06D3\\u0640'; // letters, marks, tatweel
const arWord = (pattern: string, flags = 'g') => new RegExp(`(?<![${AR}])(?:${pattern})(?![${AR}])`, flags);

/** نمط صندوق الآية: ﴿نص الآية﴾  [السورة: الآية] */
const VERSE_BLOCK_RE = /﴿[\s\S]*?﴾\s*\[[^\]\n]+\]/g;
const PLACEHOLDER_RE = /@@VERSE_(\d+)@@/g;
const isPlaceholderOnly = (s: string) => /^(?:\s*@@VERSE_\d+@@\s*)+$/.test(s);

/** يحمي صناديق الآيات بوضع placeholders مكانها */
export function protectVerses(text: string): { masked: string; verses: string[] } {
  const verses: string[] = [];
  const masked = text.replace(VERSE_BLOCK_RE, (m) => {
    verses.push(m);
    return `@@VERSE_${verses.length - 1}@@`;
  });
  return { masked, verses };
}

/** يستعيد صناديق الآيات بعد انتهاء المعالجة */
export function restoreVerses(masked: string, verses: string[]): string {
  return masked.replace(PLACEHOLDER_RE, (_m, i) => verses[Number(i)] ?? '');
}

/** تطبيع للمقارنة فقط (لا يُستخدم في المخرجات) */
function normalizeForCompare(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '') // تشكيل + ألف خنجرية + تطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** معامل تشابه Dice على ثنائيات الكلمات */
export function similarity(a: string, b: string): number {
  const wa = normalizeForCompare(a).split(' ').filter(Boolean);
  const wb = normalizeForCompare(b).split(' ').filter(Boolean);
  if (wa.length < 4 || wb.length < 4) {
    return normalizeForCompare(a) === normalizeForCompare(b) ? 1 : 0;
  }
  const big = (w: string[]) => {
    const s = new Set<string>();
    for (let i = 0; i < w.length - 1; i++) s.add(w[i] + ' ' + w[i + 1]);
    return s;
  };
  const A = big(wa), B = big(wb);
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter++; });
  return (2 * inter) / (A.size + B.size);
}

const DUPLICATE_THRESHOLD = 0.82;
const ECHO_THRESHOLD = 0.75;

/**
 * 1) حذف الفقرات المكررة أو شبه المكررة (تشابه ≥ 0.82)
 *    يعمل على النص المُقنَّع؛ فقرات الآيات (placeholders) لا تُقارن.
 */
export function dedupeParagraphs(maskedText: string, threshold = DUPLICATE_THRESHOLD): string {
  const paragraphs = maskedText.split(/\n{2,}/);
  const kept: string[] = [];
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // لا تُسقط العناوين الرئيسية للمحاور ولا الآيات (يُعالجها فلتر مستقل)
    const exempt = /^المحور\s/.test(trimmed) || isPlaceholderOnly(trimmed);
    const dup = !exempt && kept.some((k) => !/^المحور\s/.test(k.trim()) && !isPlaceholderOnly(k) && similarity(k, trimmed) >= threshold);
    if (dup) continue;
    kept.push(trimmed);
  }
  return kept.join('\n\n');
}

/**
 * 2) حذف العناوين الفرعية التي تكرر عنوان المحور نفسه
 *    (السطر القصير الذي يطابق عنوان المحور الجاري بنسبة ≥ 0.75).
 */
export function dropEchoedHeadings(maskedText: string): string {
  const lines = maskedText.split('\n');
  const out: string[] = [];
  let currentAxis = '';
  for (const line of lines) {
    const t = line.trim();
    const axisMatch = t.match(/^المحور\s+[^:：]+[:：]\s*(.+)$/);
    if (axisMatch) {
      currentAxis = axisMatch[1].trim();
      out.push(line);
      continue;
    }
    const isShortHeading = t.length > 0 && t.length < 120 && !/[.!؟]$/.test(t) && !t.startsWith('@@VERSE_');
    if (currentAxis && isShortHeading && similarity(currentAxis, t) >= ECHO_THRESHOLD) {
      continue; // عنوان فرعي يكرر عنوان المحور → احذفه
    }
    out.push(line);
  }
  return out.join('\n');
}

// ---- Verse references -------------------------------------------------------------

const toWestern = (d: string) => d.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660));

interface AyahRange { surah: string; from: number; to: number }

// «العلق: 17» / «العلق:17-18» → the surah and its ayahs
function parseRef(ref: string): AyahRange | null {
  const m = toWestern(ref).match(/^\s*(?:سورة\s+)?(.+?)\s*:\s*(\d+)(?:\s*[-–—]\s*(\d+))?\s*$/);
  if (!m) return null;
  const from = Number(m[2]);
  return { surah: normalizeForCompare(m[1]), from, to: m[3] ? Number(m[3]) : from };
}

const ayahKeys = (r: AyahRange) => Array.from({ length: r.to - r.from + 1 }, (_, i) => `${r.surah}:${r.from + i}`);

/**
 * 3) منع تكرار الآية داخل المحور الواحد (يُبقي أول ورود فقط).
 *    يعمل على النص الأصلي (غير المُقنَّع)؛ الآية نفسها مسموحة في محور آخر.
 */
export function dedupeVersesPerAxis(text: string): string {
  const chunks = text.split(/(?=^المحور\s)/m);
  return chunks
    .map((chunk) => {
      const seen = new Set<string>();
      return chunk.replace(VERSE_BLOCK_RE, (block) => {
        const refMatch = block.match(/\[([^\]]+)\]\s*$/);
        const range = refMatch ? parseRef(refMatch[1]) : null;
        const keys = range ? ayahKeys(range) : [normalizeForCompare(block)];
        if (keys.every(k => seen.has(k))) return '';
        keys.forEach(k => seen.add(k));
        return block;
      });
    })
    .join('');
}

/**
 * 4) دمج صندوقي آية متتاليين من نفس السورة بآيتين متتاليتين.
 *    ﴿أ﴾ [العلق: 17] + ﴿ب﴾ [العلق: 18]  →  ﴿أ ب﴾ [العلق: 17-18]
 */
export function mergeAdjacentVerses(text: string): string {
  const pattern = /﴿([\s\S]*?)﴾\s*\[([^\]:]+):\s*(\d+)(?:\s*-\s*(\d+))?\]\s*\n?\s*\n?\s*﴿([\s\S]*?)﴾\s*\[([^\]:]+):\s*(\d+)(?:\s*-\s*(\d+))?\]/g;
  let prev = '';
  let cur = text;
  // كرّر حتى الاستقرار (لدمج ثلاث آيات فأكثر)
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(pattern, (m, t1, s1, a1, b1, t2, s2, a2, b2) => {
      if (s1.trim() !== s2.trim()) return m;
      const end1 = Number(b1 ?? a1);
      if (Number(a2) !== end1 + 1) return m;
      return `﴿${t1.trim()} ${t2.trim()}﴾  [${s1.trim()}: ${a1}-${b2 ?? a2}]`;
    });
  }
  return cur;
}

// ---- Closings ------------------------------------------------------------------------

const CLOSING_LINE_RE = /\s*وللحديث\s+(?:بقية|بقيه|تتمة|تتمه)[.…!\s]*/g;
// Closing sentences that belong once, at the end of the article
const CLOSING_SENTENCE_RES = [/وهذا ما سنتناوله[^.!؟\n]*[.!؟]?/g, /وهكذا نكون قد[^.!؟\n]*[.!؟]?/g];

/** 5) طيّ الجمل الختامية المكررة وضمان خاتمة واحدة */
export function fixClosings(maskedText: string): string {
  let t = maskedText;
  // أي جملة تبدأ بـ "وهذا ما سنتناوله" أو "وهكذا نكون قد" → أبقِ آخر ورود فقط
  for (const re of CLOSING_SENTENCE_RES) {
    const total = t.match(re)?.length ?? 0;
    if (total > 1) {
      let count = 0;
      t = t.replace(re, m => (++count === total ? m : ''));
    }
  }
  // "وللحديث بقية" مرة واحدة في النهاية المطلقة
  t = t.replace(CLOSING_LINE_RE, ' ').replace(/[ \t]+\n/g, '\n');
  return `${t.trimEnd()}\n\n${CLOSING_LINE}`;
}

// ---- Typos, clichés, heritage ---------------------------------------------------------

/** 6) تصحيح الحروف غير العربية والأخطاء الإملائية الشائعة (خارج الآيات فقط) */
const TYPO_MAP: Array<[RegExp, string]> = [
  [/ک/g, 'ك'],            // كاف فارسية ک
  [/ی/g, 'ي'],            // ياء فارسية ی
  [/ۀ/g, 'ة'],
  [/ـ/g, ''],             // تطويل داخل النص العادي
  [arWord('اغوار'), 'أغوار'],
  [arWord('سورتتا'), 'سورتا'],
  [arWord('فاصحاب'), 'فأصحاب'],
  [arWord('الغاة'), 'الغزاة'],
  [arWord('الاية'), 'الآية'],
  [arWord('الاستدراعية'), 'الاستقرائية'],
  [arWord('نأوا'), 'نأَوْا'],
  [/في الناس بالناس/g, 'في الناس بالحج'],
  [arWord('مَطَهراً'), 'مُطهَّراً'],
  [arWord('أقباشهم'), 'أقبيتهم'],
  [arWord('حبكات'), 'حِيَل'],
  [/[ \t]{2,}/g, ' '],         // مسافات متتالية فقط (لا تُمس فواصل الفقرات)
];

export function fixTypos(maskedText: string): string {
  let t = maskedText;
  for (const [re, rep] of TYPO_MAP) t = t.replace(re, rep);
  return t;
}

// Clichés the constraints ban, replaced if they slip through
// («والسؤال هنا:» opening a sentence, «السؤال هنا:» inside one)
const CLICHES: [RegExp, string][] = [
  [/(^|[.؟?!:؛\n]\s*)(?:و|ف)?السؤال الذي يطرح نفسه( هنا)?( بقوة)?\s*:?/g, '$1والسؤال هنا:'],
  [/السؤال الذي يطرح نفسه( هنا)?( بقوة)?\s*:?/g, 'السؤال هنا:'],
  [/فنعود لنطرح السؤال نفسه\s*:?/g, 'ونتساءل:'],
];

export function replaceCliches(text: string): string {
  let t = text;
  for (const [re, rep] of CLICHES) t = t.replace(re, rep);
  return t.replace(/(والسؤال هنا:)\s*\1/g, '$1');
}

/** 7) حذف الجمل التي تخرق [م-2] (استدعاء الموروث ولو للنفي) */
const HERITAGE_TERMS = 'الركام الموروث|الموروث|التراث|التفاسير|المفسرين|المفسرون|الفهم السائد|العرض السطحي|كما يظن البعض|كما يحلو';
const HERITAGE_SENTENCE_RE = new RegExp(
  `[^.!؟\\n]*(?<![${AR}])(?:و|ف|ب|ك|وب|فب|ول|فل|لل)?(?:${HERITAGE_TERMS}|للتراث|للموروث|للمفسرين|للتفاسير)(?![${AR}])[^.!؟\\n]*[.!؟]`,
  'g'
);

export function stripHeritageSentences(maskedText: string): string {
  return maskedText.replace(HERITAGE_SENTENCE_RE, '');
}

// Orphan «؟» (or other punctuation) left at the start of a line where a verse failed
const stripOrphanPunctuation = (t: string) => t.replace(/^[ \t]*[؟?،,.:؛;]+[ \t]*/gm, '');

/** خط التنظيف الكامل */
export function sanitizeArticle(raw: string): string {
  // المرحلة أ: عمليات تعمل على النص الكامل (تحتاج رؤية صناديق الآيات)
  let text = dedupeVersesPerAxis(raw);
  text = mergeAdjacentVerses(text);

  // المرحلة ب: تقنيع الآيات ثم المعالجة النصية
  const { masked, verses } = protectVerses(text);
  let m = masked;
  m = stripHeritageSentences(m);
  m = fixTypos(m);
  m = replaceCliches(m);
  m = dropEchoedHeadings(m);
  m = dedupeParagraphs(m);
  m = fixClosings(m);
  m = stripOrphanPunctuation(m);
  m = m.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  // المرحلة ج: استعادة الآيات
  return restoreVerses(m, verses).trim();
}

export default sanitizeArticle;

// =====================================================================
//  The structured draft (blocks): what the app generates and shows
// =====================================================================

const tidy = (t: string) =>
  t.replace(/[ \t]{2,}/g, ' ').replace(/\s+([،,.:؛؟?!])/g, '$1').replace(/^\s+|\s+$/gm, '').trim();

/**
 * One paragraph of prose (never a verse): heritage sentences, typos and foreign
 * letters, clichés, closing sentences mid-article and orphan punctuation removed.
 */
export function sanitizeProse(text: string): string {
  let t = stripHeritageSentences(text);
  t = fixTypos(t);
  t = replaceCliches(t);
  t = t.replace(CLOSING_LINE_RE, ' ');
  for (const re of CLOSING_SENTENCE_RES) t = t.replace(re, '');
  t = stripOrphanPunctuation(t);
  return tidy(t);
}

/** The closing paragraph(s): cleaned, the next-part sentence kept once, then the closing line once */
export function withClosingLine(closing: string): string {
  const cleaned = closing
    .split(/\n{2,}/)
    .map(p => tidy(stripOrphanPunctuation(replaceCliches(fixTypos(stripHeritageSentences(p))))))
    .filter(Boolean)
    .join('\n\n');
  // the last «وهذا ما سنتناوله…» stays, the closing line once at the end
  return fixClosings(cleaned).split(/\n{2,}/).map(tidy).filter(Boolean).join('\n\n');
}

const OPENING_RECAP_RE = /وصلنا في الجزء السابق/;

// «وصلنا في الجزء السابق…» belongs to the opening: later, the recap sentence goes
function dropRecapSentence(text: string): string {
  return text.split(/(?<=[.؟?!])\s+/).filter(s => !OPENING_RECAP_RE.test(s)).join(' ').trim();
}

export interface SanitizableBlock {
  type: string;
  text: string;
  ref?: string;
  unresolved?: boolean;
}

interface SanitizableArticle<B extends SanitizableBlock> {
  opening: string;
  closing: string;
  sections: { axisName: string; blocks: B[] }[];
}

// Two verse blocks of consecutive ayahs of one surah → one block «العلق:17-18»
function mergeVerseBlocks<B extends SanitizableBlock>(blocks: B[]): B[] {
  const out: B[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type === 'verse' && last?.type === 'verse' && b.ref && last.ref && !b.unresolved && !last.unresolved) {
      const r1 = parseRef(last.ref);
      const r2 = parseRef(b.ref);
      if (r1 && r2 && r1.surah === r2.surah && r2.from === r1.to + 1) {
        const surah = last.ref.slice(0, last.ref.indexOf(':')).trim();
        out[out.length - 1] = { ...last, ref: `${surah}:${r1.from}-${r2.to}`, text: [last.text, b.text].filter(Boolean).join(' ') };
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

/**
 * The assembled draft. Verse blocks are never text-filtered; they are only
 * de-duplicated per axis (first citation kept) and merged when consecutive.
 * Prose: sanitized; near-duplicate paragraphs (≥ 0.82) across the article removed;
 * a sub-heading echoing its axis title removed; the opening recap kept once; the
 * closing line once, at the very end.
 */
export function sanitizeArticleBlocks<B extends SanitizableBlock, A extends SanitizableArticle<B>>(article: A): A {
  const opening = article.opening.split(/\n{2,}/).map(p => tidy(stripOrphanPunctuation(replaceCliches(fixTypos(stripHeritageSentences(p))))).replace(CLOSING_LINE_RE, ' ').trim()).filter(Boolean).join('\n\n');
  let recapSeen = OPENING_RECAP_RE.test(opening);
  const keptParagraphs: string[] = opening.split(/\n{2,}/).filter(Boolean);

  const sections = article.sections.map(section => {
    const cited = new Set<string>();
    let headingSeen = false;
    const blocks = mergeVerseBlocks(section.blocks).flatMap(block => {
      if (block.type === 'verse') {
        const range = block.ref ? parseRef(block.ref) : null;
        if (!range) return [block];
        const keys = ayahKeys(range);
        if (keys.every(k => cited.has(k))) return [];
        keys.forEach(k => cited.add(k));
        return [block];
      }
      if (block.type === 'heading') {
        if (headingSeen) return [];
        headingSeen = true;
        return [block];
      }
      if (block.type === 'subheading') {
        const text = tidy(fixTypos(block.text));
        if (!text || similarity(section.axisName, text.replace(/[:：]\s*$/, '')) >= ECHO_THRESHOLD) return [];
        return [{ ...block, text }];
      }
      let text = sanitizeProse(block.text);
      if (block.type === 'paragraph' && OPENING_RECAP_RE.test(text)) {
        if (recapSeen) text = dropRecapSentence(text);
        recapSeen = true;
      }
      if (!text) return [];
      if (block.type === 'paragraph') {
        if (keptParagraphs.some(k => similarity(k, text) >= DUPLICATE_THRESHOLD)) return [];
        keptParagraphs.push(text);
      }
      return [{ ...block, text }];
    });
    // Ayahs merged after a dedupe may now repeat a neighbour: merge once more
    return { ...section, blocks: mergeVerseBlocks(blocks) };
  });

  return { ...article, opening, sections, closing: withClosingLine(article.closing) };
}
