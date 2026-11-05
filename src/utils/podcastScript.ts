import type { GeneratedArticle } from '../types/article';
import type { PodcastLine, PodcastSegment, PodcastSegmentKind, PodcastSpeaker } from '../types/podcast';
import { PODCAST_SPEAKERS } from '../types/podcast';
import type { ReferenceArticle } from '../store/useReferenceStore';
import { paragraphsFromText, type StoryParagraph } from './blogArticle';
import { replaceQuranGlyphs, toArabicDigits } from './arabic';

// Splits an article (an approved reference article or the current draft) into the
// segments of a recording script: the introduction, the body in parts of at most
// SEGMENT_MAX_WORDS (one /api/generate-podcast-script call each), and the closing.

export const SEGMENT_MAX_WORDS = 1400;
const INTRO_MAX_WORDS = 400; // a text without headings: its first paragraphs
const CLOSING_RE = /(الجزء القادم|الجزء التالي|الحلقة القادمة|للحديث بقية|وللحديث بقيه)/;

export const DEFAULT_PROGRAM_NAME = 'نظرية الشبكة العنكبوتية';
export const DEFAULT_EPISODE_NUMBER = 187;
// Draft wording: replace it with the programme's exact disclaimer (editable in the
// generation window and kept for the next episodes)
export const DEFAULT_DISCLAIMER =
  'تنويه: ما يُطرح في هذه الحلقة اجتهادٌ شخصيٌّ في تدبّر النص القرآني، يقوم على تفكيك ألفاظه في اللسان العربي المبين ومقابلتها بمواضعها في كتاب الله، وليس فتوى ولا قولاً فصلاً. نحن نفتري الظن، فما كان من صواب فمن الله وحده، وما كان من خطأ فمن أنفسنا، ونستغفر الله إن كنا نفتري.';

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

export function referenceSegments(article: ReferenceArticle): { segments: PodcastSegment[]; refCandidates: string[] } {
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
