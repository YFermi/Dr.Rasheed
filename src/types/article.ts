// Shared by the client (articleBuilder, useArticleStore, ArticleDraftView) and the
// /api/article/* functions — type-only, so it adds no runtime import to the API.

export type StyleMode = 'rasheed-original';

export interface ArticleOptions {
  targetLength: number; // words, whole article (= sectionLength × axes when generating)
  sectionLength: number; // words per axis (1500 / 2500 / 3000)
  styleMode: StyleMode;
  includeDeferred: boolean;
  storyName: string; // picks the reference article and the story corpus
}

// ---- Input built from the idea tree ---------------------------------------

export interface ArticleNodeInput {
  id: string;
  type: 'idea' | 'evidence' | 'question';
  label: string;
  notes: string;
  verseRefs: string[]; // "سورة:آية" / "سورة:من-إلى"
  isNew: boolean; // not yet published by Dr. Rasheed → may get «افتراء من عند أنفسنا»
  status: string;
  links: { type: string; target: string }[];
  blogParts: number[]; // blog parts this idea was cited from
  depth: number; // 1 = directly under the axis
}

export interface ArticleSectionInput {
  id: string; // the axis node id
  axisName: string;
  nodes: ArticleNodeInput[];
  verseRefs: string[];
}

export interface ArticleInput {
  projectTitle: string;
  previousArticleTitle: string;
  previousArticleEnding: string;
  targetLength: number;
  sectionLength?: number; // every axis gets this budget when set
  styleMode: StyleMode;
  sections: ArticleSectionInput[];
  allowedVerseRefs: string[];
}

// ---- Model output ----------------------------------------------------------

export interface OutlineSection {
  id: string;
  axisName: string;
  thesis: string;
  keyMoves: string[];
  verseRefs: string[];
  transitionIn: string;
  transitionOut: string;
  wordBudget: number;
  coveredNodeIds: string[];
}

export interface ArticleOutline {
  title: string;
  opening: string;
  sections: OutlineSection[];
  closing: string;
}

export type DraftBlockType = 'heading' | 'subheading' | 'paragraph' | 'verse';

export interface DraftBlock {
  type: DraftBlockType;
  text: string; // verse blocks: canonical Tanzil text, filled in by the client
  ref?: string; // verse blocks only
  unresolved?: boolean; // verse ref not found in the Quran text, or not allowed
}

export interface SectionResponse {
  blocks: DraftBlock[];
  coveredNodeIds: string[];
  wordCount: number;
  rejectedRefs?: string[]; // verse refs the model used outside allowedVerseRefs
}

export interface DraftSection extends SectionResponse {
  id: string;
  axisName: string;
}

export interface GeneratedArticle {
  title: string;
  opening: string;
  closing: string;
  outline: ArticleOutline;
  sections: DraftSection[];
  options: ArticleOptions;
  generatedAt: string;
  approvedAt: string | null; // labelled "مسودة بمساعدة الذكاء الاصطناعي" until approved
}

// ---- Request bodies ----------------------------------------------------------

export interface OutlineRequest {
  tree: ArticleInput;
  referenceContext?: string;
  previousIdeas?: PreviousIdea[];
  previousArticleEnding: string;
  targetLength: number;
  numAxes: number;
  styleMode: StyleMode;
}

// A passage of an earlier article of the story, picked for one axis (corpusSearch)
export interface CorpusExcerpt {
  source: string; // "الجزء 15" / "مقال مرجعي"
  title: string;
  text: string;
  reason: string; // why it was picked
}

// A reference idea (role 'reference'): already treated in an earlier part
export interface PreviousIdea {
  title: string;
  summary: string; // one sentence
}

// A long section is written in parts (each call writes ≤ ~1500 words)
export interface SectionPart {
  index: number; // 1-based
  count: number;
  previousPartEnding: string; // the end of what this section has so far
  subheadingsSoFar: string[];
}

export interface SectionRequest {
  outline: ArticleOutline;
  sectionId: string;
  sectionNodes: ArticleNodeInput[];
  previousSectionEnding: string;
  nextSectionPlan: string;
  allowedVerseRefs: string[];
  wordBudget?: number; // overrides the outline's budget (longer / shorter)
  instruction?: string; // the editor's extra instruction for this section
  referenceContext?: string; // excerpt of the reference article (style reference)
  corpusExcerpts?: CorpusExcerpt[];
  previousIdeas?: PreviousIdea[];
  part?: SectionPart;
}

export interface StitchRequest {
  sectionA_ending: string[]; // last paragraphs of section A
  sectionB_start: string[]; // first paragraphs of section B
  transitionPlan: string;
}

export interface StitchResponse {
  newA_ending: string[];
  newB_start: string[];
}

// The style data built by scripts/extract-examples.ts
export interface StyleExample {
  id: string;
  category: string;
  label: string;
  articleId: string;
  paragraphId: string;
  words: number;
  text: string;
}

export interface StylePack {
  generatedAt: string;
  styleGuide: string;
  examples: StyleExample[];
}
