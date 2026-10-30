export interface BlogParagraph {
  id: string;        // stable ID: "p{partNumber}-{index}"
  html: string;      // clean HTML from mammoth
  text: string;      // plain text (for display)
  norm: string;      // normalized text (for search)
  isHeading: boolean;
  headingLevel?: number;
}

export interface BlogVerse {
  key: string;       // e.g., "الحجر:76" or "الأعراف:80-84" ("unref:<text>" when no reference is given)
  text: string;      // verse text without brackets
  surah?: string;
  ayahFrom?: number;
  ayahTo?: number;
  paragraphId: string;
  partNumber: number;
  // True when `text` is canonical Tanzil text that replaced Quran-font glyphs
  replacedFromGlyphs: boolean;
  originalText?: string; // the glyph version, for diagnostics
}

export interface BlogArticle {
  id: string;        // e.g., "lot-01"
  partNumber: number;
  title: string;
  sourceFile: string; // original .docx filename
  paragraphs: BlogParagraph[];
  verses: BlogVerse[];
  wordCount: number;
}

export interface BlogCorpus {
  version: number;
  generatedAt: string; // ISO date
  totalArticles: number;
  totalParagraphs: number;
  totalVerses: number;
  // Attribution for canonical verse text (required by Tanzil's terms of use)
  quranTextSource?: string;
  articles: BlogArticle[];
}

export interface BlogRef {
  partNumber: number;
  paragraphId?: string;
  quote?: string;
}

export interface SearchResult {
  article: BlogArticle;
  paragraph: BlogParagraph;
  matchCount: number;
  snippet: string;   // excerpt of the normalized paragraph text around the first match
}
