import type { BlogArticle } from '../types/blog';
import type { GeneratedArticle } from '../types/article';
import { extractVerses, normalizeArabic } from './arabic';

// Builds a story-corpus article (the blog.json format) from plain paragraphs: a
// reference article's text, or an approved draft saved to the story corpus.

export interface StoryParagraph {
  text: string;
  isHeading: boolean;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toBlogArticle(
  meta: { id: string; partNumber: number; title: string; sourceFile: string },
  paragraphs: StoryParagraph[]
): BlogArticle {
  const kept = paragraphs.map(p => ({ ...p, text: p.text.trim() })).filter(p => p.text);
  const blogParagraphs = kept.map((p, i) => ({
    id: `p${meta.partNumber}-${i}`,
    html: p.isHeading ? `<h2>${escapeHtml(p.text)}</h2>` : `<p>${escapeHtml(p.text)}</p>`,
    text: p.text,
    norm: normalizeArabic(p.text),
    isHeading: p.isHeading,
    ...(p.isHeading ? { headingLevel: 2 } : {}),
  }));
  return {
    id: meta.id,
    partNumber: meta.partNumber,
    title: meta.title,
    sourceFile: meta.sourceFile,
    paragraphs: blogParagraphs,
    verses: blogParagraphs.flatMap(p => extractVerses(p.text, p.id, meta.partNumber)),
    wordCount: kept.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0),
  };
}

// Plain text: one paragraph per line; a short line without final punctuation is a heading
export function paragraphsFromText(fullText: string): StoryParagraph[] {
  return fullText
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(text => ({ text, isHeading: text.split(/\s+/).length <= 12 && !/[.؟!:،»"]$/.test(text) }));
}

// An approved draft: title, opening, the sections (verses as «﴿text﴾ [ref]», as in
// Dr. Rasheed's articles, so the corpus finds them), closing
export function paragraphsFromDraft(draft: GeneratedArticle): StoryParagraph[] {
  const prose = (text: string) => text.split(/\n{2,}/).map(t => ({ text: t, isHeading: false }));
  return [
    { text: draft.title, isHeading: true },
    ...prose(draft.opening),
    ...draft.sections.flatMap(s => s.blocks.map(b => {
      if (b.type === 'verse') return { text: b.text ? `﴿${b.text}﴾ [${(b.ref ?? '').replace(':', ': ')}]` : '', isHeading: false };
      return { text: b.text, isHeading: b.type === 'heading' || b.type === 'subheading' };
    })),
    ...prose(draft.closing),
  ];
}
