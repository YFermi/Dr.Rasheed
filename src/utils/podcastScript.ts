import type { GeneratedArticle } from '../types/article';
import type { PodcastLine, PodcastScript, PodcastSegment, PodcastSegmentKind, PodcastSpeaker } from '../types/podcast';
import { COMMENT_SLOT, MAX_GUEST_RUN_WORDS, PODCAST_SPEAKERS, isGuest } from '../types/podcast';
import type { ReferenceArticle } from '../store/useReferenceStore';
import { paragraphsFromText, type StoryParagraph } from './blogArticle';
import { replaceQuranGlyphs, toArabicDigits } from './arabic';

// Splits the current article (pasted text, a Word file, a saved reference article or the draft) into the
// segments of a recording script: the introduction, the body in parts of at most
// SEGMENT_MAX_WORDS (one /api/generate-podcast-script call each), and the closing.

export const SEGMENT_MAX_WORDS = 1400;
const CLOSING_RE = /(الجزء القادم|الجزء التالي|الحلقة القادمة|للحديث بقية|وللحديث بقيه)/;

export const DEFAULT_PROGRAM_NAME = 'نظرية الشبكة العنكبوتية';
export const DEFAULT_EPISODE_NUMBER = 187;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
let lineCounter = 0;
export const newLineId = () => `ln-${Date.now().toString(36)}-${(lineCounter++).toString(36)}`;

interface Group {
  title: string;
  paragraphs: string[];
}

// The script's segments: the introduction (written from the previous article, so
// it carries no text of the current one), the current article's body in parts of
// at most SEGMENT_MAX_WORDS («المحور الأول (١/٢)»), and its closing.
function toSegments(groups: Group[], closing: string[]): PodcastSegment[] {
  const segment = (kind: PodcastSegmentKind, title: string, paragraphs: string[], key: string): PodcastSegment => ({
    id: `seg-${key}`,
    kind,
    title,
    sourceText: paragraphs.join('\n\n'),
    lines: [],
    status: 'pending',
  });
  const body = groups.filter(g => g.paragraphs.length).flatMap((g, gi) => {
    const parts: string[][] = [[]];
    let count = 0;
    for (const p of g.paragraphs) {
      if (count > 0 && count + words(p) > SEGMENT_MAX_WORDS) {
        parts.push([]);
        count = 0;
      }
      parts[parts.length - 1].push(p);
      count += words(p);
    }
    return parts.map((paragraphs, pi) =>
      segment('body', parts.length > 1 ? `${g.title} (${toArabicDigits(pi + 1)}/${toArabicDigits(parts.length)})` : g.title, paragraphs, `${gi}-${pi}`)
    );
  });
  return [
    segment('intro', 'المقدمة', [], 'intro'),
    ...body,
    ...(closing.length ? [segment('closing', 'الخاتمة', closing, 'closing')] : [segment('closing', 'الخاتمة', ['(لا خاتمة في المقال)'], 'closing')]),
  ];
}

// ---- The current draft as text ----------------------------------------------------------

// The draft offered as the current article: headings on their own lines, verses
// as «﴿text﴾ [ref]», like a pasted article
export function draftToText(draft: GeneratedArticle): string {
  return [
    draft.opening,
    ...draft.sections.flatMap(s => [s.axisName, ...s.blocks.flatMap(b => {
      if (b.type === 'heading') return [];
      if (b.type === 'subheading') return [`${b.text}:`];
      if (b.type === 'verse') return b.ref ? [`﴿${b.text || '…'}﴾ [${b.ref.replace(':', ': ')}]`] : [];
      return [b.text];
    })]),
    draft.closing,
  ].join('\n');
}

// ---- From a reference article (Word or pasted text) ----------------------------------

// «[الأعراف: 80]», «(سورة هود: 78)», «[الحجر: 73-74]», Arabic-Indic digits too
const REF_RE = /[[(]\s*(?:سورة\s+)?([ء-ي\s]{2,20}?)\s*[:：]\s*([0-9٠-٩]+)(?:\s*[-–—]\s*([0-9٠-٩]+))?\s*[\])]/g;
const western = (d: string) => d.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660));

export function referenceRefCandidates(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(REF_RE)) {
    const from = western(m[2]);
    const to = m[3] ? western(m[3]) : '';
    refs.add(`${m[1].trim()}:${from}${to && to !== from ? `-${to}` : ''}`);
  }
  return [...refs];
}

export interface ArticleText {
  title: string;
  fullText: string;
}

const articleParagraphs = (article: ArticleText): StoryParagraph[] => {
  // Quran-font glyph runs are unreadable outside their font; their reference stays
  const paragraphs = paragraphsFromText(replaceQuranGlyphs(article.fullText, '﴿…﴾'));
  return paragraphs[0] && paragraphs[0].text.trim() === article.title.trim() ? paragraphs.slice(1) : paragraphs;
};

// The current article (today's episode) → the body segments and the closing. Its
// opening paragraphs (before the first heading) are the first body segment: Dr.
// Rasheed says them too; nothing of this article is summarized.
export function currentArticleSegments(article: ArticleText): { segments: PodcastSegment[]; refCandidates: string[] } {
  const paragraphs = articleParagraphs(article);

  // Closing: the final paragraphs from the one announcing the next part
  let closingStart = paragraphs.length;
  for (let i = paragraphs.length - 1; i >= Math.max(0, paragraphs.length - 4); i--) {
    if (CLOSING_RE.test(paragraphs[i].text)) closingStart = i;
  }
  const closing = paragraphs.slice(closingStart).filter(p => !p.isHeading).map(p => p.text);
  const main = paragraphs.slice(0, closingStart);

  const groups: Group[] = [];
  const firstHeading = main.findIndex(p => p.isHeading);
  if (firstHeading === -1) {
    if (main.length) groups.push({ title: article.title || 'المقال', paragraphs: main.map(p => p.text) });
  } else {
    if (firstHeading > 0) groups.push({ title: 'تمهيد المقال', paragraphs: main.slice(0, firstHeading).map(p => p.text) });
    for (const p of main.slice(firstHeading)) {
      if (p.isHeading) groups.push({ title: p.text, paragraphs: [] });
      else groups[groups.length - 1].paragraphs.push(p.text);
    }
  }
  return { segments: toSegments(groups, closing), refCandidates: referenceRefCandidates(article.fullText) };
}

// The opening words of the current article: the introduction's last turn frames
// the first question to Dr. Rasheed from them (and from nothing else of it)
export function articleOpening(article: ArticleText, maxWords = 250): string {
  const out: string[] = [];
  let count = 0;
  for (const p of articleParagraphs(article)) {
    const left = maxWords - count;
    if (left <= 0) break;
    const ws = p.text.split(/\s+/).filter(Boolean);
    out.push(ws.length > left ? `${ws.slice(0, left).join(' ')}…` : p.text);
    count += Math.min(ws.length, left);
  }
  return out.join('\n');
}

// ---- Verse text and dialog lines ------------------------------------------------------

// Only references that exist in the Quran text are offered to the model
export async function validVerseRefs(refs: string[]): Promise<string[]> {
  const { resolveVerseRef } = await import('./quranLookup');
  return refs.filter(r => resolveVerseRef(r) !== null);
}

// Verse lines carry only a reference; their text always comes from Tanzil
export async function resolvePodcastVerses(lines: PodcastLine[]): Promise<PodcastLine[]> {
  const { resolveVerseRef } = await import('./quranLookup');
  return lines.map(l => {
    if (l.type !== 'verse' || !l.ref) return l;
    const resolved = resolveVerseRef(l.ref);
    return resolved ? { ...l, text: resolved.text, unresolved: false } : { ...l, text: '', unresolved: true };
  });
}

export const speakerName = (speaker: PodcastSpeaker | undefined) => (speaker ? PODCAST_SPEAKERS[speaker] : '');

// «المتحدث: النص» of a segment's last lines, for the next call's continuity
export function lastLinesOf(segment: PodcastSegment | undefined, n = 4): string[] {
  if (!segment) return [];
  return segment.lines
    .filter(l => l.type === 'speech')
    .slice(-n)
    .map(l => `${speakerName(l.speaker)}: ${l.text}`);
}

// ---- Smart cutter, verse format, plain text ------------------------------------------

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

// Guest runs longer than MAX_GUEST_RUN_WORDS without a host's question (verses count
// as the guest's): the id of each run's last line → its word count
export function overlongGuestRuns(lines: PodcastLine[]): Map<string, number> {
  const flagged = new Map<string, number>();
  let run = 0;
  let lastId = '';
  const close = () => {
    if (run > MAX_GUEST_RUN_WORDS && lastId) flagged.set(lastId, run);
    run = 0;
  };
  for (const l of lines) {
    if (l.text === COMMENT_SLOT) continue; // an empty comment slot neither adds nor ends a run
    if (l.type === 'verse' || isGuest(l.speaker)) {
      run += wordCount(l.text);
      lastId = l.id;
    } else close();
  }
  close();
  return flagged;
}

// The unified Quranic format of the scripts:
// > قال تعالى:
// > {نص الآية}
// > [السورة: الآية]
export const verseRefLabel = (ref: string | undefined) => `[${(ref ?? '').replace(':', ': ')}]`;
export function verseBlockLines(line: PodcastLine): string[] {
  return ['قال تعالى:', line.unresolved || !line.text ? '{تعذر العثور على الآية}' : `{${line.text}}`, verseRefLabel(line.ref)];
}

// The whole script as text (to paste into a teleprompter or a document)
export function scriptToText(script: PodcastScript, lead: PodcastSpeaker): string {
  const out: string[] = [
    `${script.episode.programName} — EPISODE ${script.episode.episodeNumber}`,
    script.episode.dateText,
    '',
    `${PODCAST_SPEAKERS[lead]}: ${script.episode.disclaimer}`,
  ];
  for (const segment of script.segments) {
    if (!segment.lines.length) continue;
    out.push('', `— ${segment.title} —`, '');
    for (const l of segment.lines) {
      if (l.type === 'verse') out.push('', ...verseBlockLines(l).map(t => `> ${t}`), '');
      else out.push(`${speakerName(l.speaker)}: ${l.text}`);
    }
  }
  if (script.interruptionBank?.length) {
    out.push('', '— بنك المقاطعات —', '', ...script.interruptionBank.map((q, i) => `${i + 1}. ${q}`));
  }
  return out.join('\n');
}

// The opening words of each body segment (the closing call writes the interruption bank from them)
export function segmentHighlights(script: PodcastScript, words = 40): string[] {
  return script.segments
    .filter(s => s.kind === 'body')
    .map(s => `${s.title}: ${s.sourceText.split(/\s+/).slice(0, words).join(' ')}…`);
}

// The text sent to the model carries its verses in the unified format:
// «﴿نص﴾ [الأعراف: 82]» → «> قال تعالى: {نص} [الأعراف: 82]»
const BRACKETED_VERSE_RE = /(?:قال تعالى\s*:?\s*)?﴿([^﴾﴿]*)﴾\s*(\[[^\]]+\])?/g;
export function unifyVerseMarkup(text: string): string {
  return text.replace(BRACKETED_VERSE_RE, (_m, verse: string, ref?: string) => `> قال تعالى: {${verse.trim()}}${ref ? ` ${ref}` : ''}`);
}
