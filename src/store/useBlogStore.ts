import { create } from 'zustand';
import type { BlogCorpus, BlogRef, SearchResult } from '../types/blog';
import { loadBlogCorpus } from '../data/blogLoader';
import { searchCorpus } from '../utils/arabic';
import { findRefArticle } from '../utils/blogLinks';
import { toBlogArticle, type StoryParagraph } from '../utils/blogArticle';

// Approved articles saved to the story corpus from the app. blog.json is a static
// file, so they live in this browser (localStorage) and are merged in at load.
export interface SavedStoryArticle {
  id: string;
  partNumber: number;
  title: string;
  savedAt: string; // ISO date
  paragraphs: StoryParagraph[];
}

const SAVED_KEY = 'idea-builder-story-additions';

function readSaved(): SavedStoryArticle[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedStoryArticle[]) : [];
  } catch {
    return [];
  }
}

// false when storage is blocked or full
function writeSaved(list: SavedStoryArticle[]): boolean {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const savedToBlog = (a: SavedStoryArticle) =>
  toBlogArticle({ id: a.id, partNumber: a.partNumber, title: a.title, sourceFile: 'محفوظ من التطبيق' }, a.paragraphs);

function mergeCorpus(base: BlogCorpus, saved: SavedStoryArticle[]): BlogCorpus {
  const ids = new Set(saved.map(a => a.id));
  const articles = [...base.articles.filter(a => !ids.has(a.id)), ...saved.map(savedToBlog)];
  return {
    ...base,
    articles,
    totalArticles: articles.length,
    totalParagraphs: articles.reduce((n, a) => n + a.paragraphs.length, 0),
    totalVerses: articles.reduce((n, a) => n + a.verses.length, 0),
  };
}

// Read-only blog corpus — kept apart from useIdeaStore so it is never persisted
// or included in project exports.
interface BlogStoreState {
  corpus: BlogCorpus | null; // blog.json + savedArticles
  baseCorpus: BlogCorpus | null; // blog.json as loaded
  savedArticles: SavedStoryArticle[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  openArticleId: string | null;
  highlightedParagraphId: string | null;
  // One-shot request for the reader to scroll to a paragraph; the reader clears
  // it once handled, so remounting the reader doesn't scroll again.
  scrollTargetId: string | null;
  leftPanelView: 'document' | 'blog' | 'draft';

  loadCorpus: () => Promise<void>;
  // Adds (or replaces, same id) an article in the story corpus; false when it could not be saved
  saveToStory: (article: Omit<SavedStoryArticle, 'savedAt'>) => boolean;
  nextPartNumber: () => number;
  search: (query: string) => void;
  openArticle: (id: string, highlightParagraphId?: string) => void;
  highlightParagraph: (id: string) => void;
  goToParagraph: (articleId: string, paragraphId: string) => void;
  openBlogRef: (ref: BlogRef) => boolean;
  closeArticle: () => void;
  clearScrollTarget: () => void;
  setLeftPanelView: (view: 'document' | 'blog' | 'draft') => void;
}

export const useBlogStore = create<BlogStoreState>((set, get) => ({
  corpus: null,
  baseCorpus: null,
  savedArticles: readSaved(),
  isLoading: false,
  error: null,
  searchQuery: '',
  searchResults: [],
  openArticleId: null,
  highlightedParagraphId: null,
  scrollTargetId: null,
  leftPanelView: 'document',

  loadCorpus: async () => {
    if (get().corpus || get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const baseCorpus = await loadBlogCorpus();
      set({ baseCorpus, corpus: mergeCorpus(baseCorpus, get().savedArticles), isLoading: false });
      // Re-run a query typed before the corpus arrived.
      const { searchQuery } = get();
      if (searchQuery) get().search(searchQuery);
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  saveToStory: (article) => {
    const saved = [...get().savedArticles.filter(a => a.id !== article.id), { ...article, savedAt: new Date().toISOString() }];
    if (!writeSaved(saved)) return false;
    const { baseCorpus, searchQuery } = get();
    set({ savedArticles: saved, ...(baseCorpus ? { corpus: mergeCorpus(baseCorpus, saved) } : {}) });
    if (searchQuery) get().search(searchQuery);
    return true;
  },

  nextPartNumber: () => {
    const parts = [...(get().corpus?.articles ?? []).map(a => a.partNumber), ...get().savedArticles.map(a => a.partNumber)];
    return parts.length ? Math.max(...parts) + 1 : 1;
  },

  search: (query: string) => {
    const { corpus } = get();
    set({
      searchQuery: query,
      searchResults: corpus ? searchCorpus(corpus.articles, query) : [],
    });
  },

  // Opens the article at its top in the left panel; the optional paragraph is
  // marked but not scrolled to (use highlightParagraph for that).
  openArticle: (id: string, highlightParagraphId?: string) => set({
    openArticleId: id,
    highlightedParagraphId: highlightParagraphId ?? null,
    scrollTargetId: null,
    leftPanelView: 'blog',
  }),

  highlightParagraph: (id: string) => set({ highlightedParagraphId: id, scrollTargetId: id }),

  // Opens the article in the left panel and scrolls to the highlighted paragraph.
  goToParagraph: (articleId: string, paragraphId: string) => set({
    openArticleId: articleId,
    leftPanelView: 'blog',
    highlightedParagraphId: paragraphId,
    scrollTargetId: paragraphId,
  }),

  // Returns false when the referenced article isn't in the loaded corpus.
  openBlogRef: (ref: BlogRef) => {
    const article = findRefArticle(get().corpus?.articles ?? [], ref);
    if (!article) return false;
    if (ref.paragraphId) get().goToParagraph(article.id, ref.paragraphId);
    else get().openArticle(article.id);
    return true;
  },

  closeArticle: () => set({
    openArticleId: null,
    highlightedParagraphId: null,
    scrollTargetId: null,
    leftPanelView: 'document',
  }),

  clearScrollTarget: () => set({ scrollTargetId: null }),

  setLeftPanelView: (view: 'document' | 'blog' | 'draft') => set({ leftPanelView: view }),
}));
