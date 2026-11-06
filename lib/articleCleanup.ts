// Post-processing of generated article prose: shared by the article endpoints
// (each paragraph they return) and the client (the assembled article). Only prose
// is touched; verse blocks (the gold boxes) are never passed through it.

// The series' closing line, as Dr. Rasheed writes it (13 of the 18 corpus articles)
export const CLOSING_LINE = 'وللحديث بقية';

const CLOSING_LINE_RE = /\s*وللحديث\s+(?:بقية|بقيه|تتمة|تتمه)[.…!\s]*/g;
const OPENING_RECAP_RE = /وصلنا في الجزء السابق/;

// Clichés the constraints ban, replaced if they slip through
// («والسؤال هنا:» opening a sentence, «السؤال هنا:» inside one: «والآن السؤال هنا:»)
const CLICHES: [RegExp, string][] = [
  [/(^|[.؟?!:؛\n]\s*)(?:و|ف)?السؤال الذي يطرح نفسه( هنا)?( بقوة)?\s*:?/g, '$1والسؤال هنا:'],
  [/السؤال الذي يطرح نفسه( هنا)?( بقوة)?\s*:?/g, 'السؤال هنا:'],
  [/فنعود لنطرح السؤال نفسه\s*:?/g, 'ونتساءل:'],
];

// One paragraph: no orphan «؟» (or other punctuation) where a verse failed at the
// start of a line, no banned clichés, no closing line inside the article
export function cleanProse(text: string): string {
  let out = text;
  for (const [re, replacement] of CLICHES) out = out.replace(re, replacement);
  out = out.replace(CLOSING_LINE_RE, ' ');
  out = out.replace(/^[\s؟?،,.:؛;]+/gm, '');
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([،,.:؛؟?!])/g, '$1');
  // «والسؤال هنا: والسؤال هنا:» after a replacement next to the same phrase
  out = out.replace(/(والسؤال هنا:)\s*\1/g, '$1');
  return out.trim();
}

// The closing paragraph(s): cleaned, then the closing line once, at the very end
export function withClosingLine(closing: string): string {
  const body = closing
    .split(/\n{2,}/)
    .map(cleanProse)
    .filter(Boolean)
    .join('\n\n');
  return body ? `${body}\n\n${CLOSING_LINE}` : CLOSING_LINE;
}

// «وصلنا في الجزء السابق…» belongs to the opening: in any later paragraph the
// recap sentence is dropped (the paragraph too, when nothing else is left)
export function dropRepeatedRecap(text: string): string {
  if (!OPENING_RECAP_RE.test(text)) return text;
  return text
    .split(/(?<=[.؟?!])\s+/)
    .filter(sentence => !OPENING_RECAP_RE.test(sentence))
    .join(' ')
    .trim();
}

interface CleanableBlock {
  type: string;
  text: string;
}

interface CleanableArticle<B extends CleanableBlock> {
  opening: string;
  closing: string;
  sections: { blocks: B[] }[];
}

// The assembled article: every prose block cleaned (verse blocks untouched), the
// opening recap kept once, empty paragraphs removed, one closing line at the end
export function cleanArticle<B extends CleanableBlock, A extends CleanableArticle<B>>(article: A): A {
  const opening = article.opening
    .split(/\n{2,}/)
    .map(cleanProse)
    .filter(Boolean)
    .join('\n\n');
  let recapSeen = OPENING_RECAP_RE.test(opening);
  const sections = article.sections.map(section => ({
    ...section,
    blocks: section.blocks.flatMap(block => {
      if (block.type === 'verse') return [block];
      let text = cleanProse(block.text);
      if (block.type === 'paragraph' && OPENING_RECAP_RE.test(text)) {
        if (recapSeen) text = dropRepeatedRecap(text);
        recapSeen = true;
      }
      return text ? [{ ...block, text }] : [];
    }),
  }));
  return { ...article, opening, sections, closing: withClosingLine(article.closing) };
}
