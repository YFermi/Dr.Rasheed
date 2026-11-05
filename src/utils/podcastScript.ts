import type { GeneratedArticle } from '../types/article';
import type { PodcastLine, PodcastScript, PodcastSegment, PodcastSegmentKind, PodcastSpeaker } from '../types/podcast';
import { COMMENT_SLOT, MAX_GUEST_RUN_WORDS, PODCAST_SPEAKERS, isGuest } from '../types/podcast';
import type { ReferenceArticle } from '../store/useReferenceStore';
import { paragraphsFromText, type StoryParagraph } from './blogArticle';
import { replaceQuranGlyphs, toArabicDigits } from './arabic';

// Splits an article (pasted text or a Word file, a reference article, or the current draft) into the
// segments of a recording script: the introduction, the body in parts of at most
// SEGMENT_MAX_WORDS (one /api/generate-podcast-script call each), and the closing.

export const SEGMENT_MAX_WORDS = 1400;
const INTRO_MAX_WORDS = 400; // a text without headings: its first paragraphs
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

// Body groups longer than SEGMENT_MAX_WORDS are cut between paragraphs: «المحور الأول (١/٢)»
function toSegments(intro: string[], groups: Group[], closing: string[]): PodcastSegment[] {
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
    segment('intro', 'المقدمة', intro.length ? intro : ['(لا تلخيص للجزء السابق في المقال)'], 'intro'),
    ...body,
    ...(closing.length ? [segment('closing', 'الخاتمة', closing, 'closing')] : [segment('closing', 'الخاتمة', ['(لا خاتمة في المقال)'], 'closing')]),
  ];
}

// ---- From the current draft ---------------------------------------------------------

export function draftSegments(draft: GeneratedArticle): { segments: PodcastSegment[]; allowedVerseRefs: string[] } {
  const groups: Group[] = draft.sections.map(s => ({
    title: s.axisName,
    paragraphs: s.blocks.flatMap(b => {
      if (b.type === 'heading') return [];
      if (b.type === 'subheading') return [`${b.text}:`];
      if (b.type === 'verse') return b.ref ? [`﴿${b.text || '…'}﴾ [${b.ref.replace(':', ': ')}]`] : [];
      return [b.text];
    }),
  }));
  const allowedVerseRefs = [...new Set(draft.sections.flatMap(s => s.blocks.flatMap(b => (b.type === 'verse' && b.ref && !b.unresolved ? [b.ref] : []))))];
  const split = (text: string) => text.split(/\n{2,}/).map(t => t.trim()).filter(Boolean);
  return { segments: toSegments(split(draft.opening), groups, split(draft.closing)), allowedVerseRefs };
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

// A reference article, or any text pasted or read from a Word file in the script window
export function referenceSegments(article: Pick<ReferenceArticle, 'title' | 'fullText'>): { segments: PodcastSegment[]; refCandidates: string[] } {
  // Quran-font glyph runs are unreadable outside their font; their reference stays
  const text = replaceQuranGlyphs(article.fullText, '﴿…﴾');
  let paragraphs: StoryParagraph[] = paragraphsFromText(text);
  if (paragraphs[0] && paragraphs[0].text.trim() === article.title.trim()) paragraphs = paragraphs.slice(1);

  // Closing: the final paragraphs from the one announcing the next part
  let closingStart = paragraphs.length;
  for (let i = paragraphs.length - 1; i >= Math.max(0, paragraphs.length - 4); i--) {
    if (CLOSING_RE.test(paragraphs[i].text)) closingStart = i;
  }
  const closing = paragraphs.slice(closingStart).filter(p => !p.isHeading).map(p => p.text);
  const main = paragraphs.slice(0, closingStart);

  const intro: string[] = [];
  const groups: Group[] = [];
  const firstHeading = main.findIndex(p => p.isHeading);
  if (firstHeading > 0 || (firstHeading === -1 && main.length)) {
    // Text before the first heading (or the first ~400 words) is the introduction
    const end = firstHeading > 0 ? firstHeading : main.length;
    let count = 0;
    let i = 0;
    for (; i < end && (firstHeading > 0 || count < INTRO_MAX_WORDS); i++) {
      intro.push(main[i].text);
      count += words(main[i].text);
    }
    if (firstHeading === -1) groups.push({ title: article.title, paragraphs: main.slice(i).map(p => p.text) });
  }
  for (const p of firstHeading >= 0 ? main.slice(firstHeading) : []) {
    if (p.isHeading) groups.push({ title: p.text, paragraphs: [] });
    else groups[groups.length - 1].paragraphs.push(p.text);
  }
  return { segments: toSegments(intro, groups, closing), refCandidates: referenceRefCandidates(text) };
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
