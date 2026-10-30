import { create } from 'zustand';
import type { BlogCorpus, BlogRef, SearchResult } from '../types/blog';
import { loadBlogCorpus } from '../data/blogLoader';
import { searchCorpus } from '../utils/arabic';
import { findRefArticle } from '../utils/blogLinks';

// Read-only blog corpus — kept apart from useIdeaStore so it is never persisted
// or included in project exports.
interface BlogStoreState {
  corpus: BlogCorpus | null;
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
      const corpus = await loadBlogCorpus();
      set({ corpus, isLoading: false });
      // Re-run a query typed before the corpus arrived.
      const { searchQuery } = get();
      if (searchQuery) get().search(searchQuery);
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : String(e) });
    }
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
