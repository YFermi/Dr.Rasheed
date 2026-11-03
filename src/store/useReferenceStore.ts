import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// Finished, verified articles added as references (ReferenceArticleModal): their
// full text and style notes, kept for the style reference of later generation.
// Not part of blog.json (the story corpus) for now.

export interface ReferenceArticle {
  id: string;
  title: string;
  storyName: string;
  fullText: string;
  styleNotes: string;
  ideaCount: number;
  dateAdded: string; // ISO date
  structure?: { introduction: string; axes: string[]; conclusion: string };
}

export const DEFAULT_STORY = 'قصة لوط';

// localStorage has a quota (~5 MB per site): a failed write is recorded here and
// reported by addArticle, instead of being thrown from inside the store update.
let lastWriteError: unknown = null;
const guardedStorage: StateStorage = {
  getItem: name => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
      lastWriteError = null;
    } catch (e) {
      lastWriteError = e;
    }
  },
  removeItem: name => localStorage.removeItem(name),
};

interface ReferenceStoreState {
  referenceArticles: ReferenceArticle[];
  stories: string[];
  isModalOpen: boolean;

  // false when the article could not be saved (storage full); nothing is kept then
  addArticle: (article: ReferenceArticle) => boolean;
  getArticle: (id: string) => ReferenceArticle | undefined;
  getArticlesByStory: (storyName: string) => ReferenceArticle[];
  removeArticle: (id: string) => void;
  addStory: (name: string) => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useReferenceStore = create<ReferenceStoreState>()(persist((set, get) => ({
  referenceArticles: [],
  stories: [DEFAULT_STORY],
  isModalOpen: false,

  addArticle: (article) => {
    const previous = get().referenceArticles;
    set({ referenceArticles: [...previous.filter(a => a.id !== article.id), article] });
    if (lastWriteError) {
      console.warn('Reference article not saved:', lastWriteError);
      set({ referenceArticles: previous });
      return false;
    }
    get().addStory(article.storyName);
    return true;
  },

  getArticle: (id) => get().referenceArticles.find(a => a.id === id),

  getArticlesByStory: (storyName) => get().referenceArticles.filter(a => a.storyName === storyName),

  removeArticle: (id) => set(state => ({ referenceArticles: state.referenceArticles.filter(a => a.id !== id) })),

  addStory: (name) => {
    const story = name.trim();
    if (story && !get().stories.includes(story)) set(state => ({ stories: [...state.stories, story] }));
  },

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}), {
  name: 'idea-builder-references',
  version: 1,
  storage: createJSONStorage(() => guardedStorage),
  partialize: (state) => ({ referenceArticles: state.referenceArticles, stories: state.stories }),
}));

// The title of the article a reference idea came from (the node's sessionRef
// keeps it too, for when the article itself was not saved or was removed)
export function referenceArticleTitle(
  node: { referenceArticleId?: string; sessionRef?: string },
  articles: ReferenceArticle[]
): string {
  const article = node.referenceArticleId ? articles.find(a => a.id === node.referenceArticleId) : undefined;
  return article?.title ?? node.sessionRef?.replace(/^مقال مرجعي:\s*/, '') ?? '';
}
