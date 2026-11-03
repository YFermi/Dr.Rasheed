import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ArticleInput, ArticleOptions, ArticleSectionInput, DraftSection, GeneratedArticle, OutlineSection } from '../types/article';
import { useIdeaStore } from './useIdeaStore';
import { useBlogStore } from './useBlogStore';
import {
  DEFAULT_ARTICLE_OPTIONS,
  buildArticleInput,
  computeSectionHash,
  generateArticle,
  hasEnoughContent,
  orderArticleByTree,
  previousArticleOf,
  regenerateOneSection,
  sortByAxisOrder,
  type GenerationProgress,
} from '../utils/articleBuilder';

export type SectionState = 'fresh' | 'stale' | 'locked' | 'generating';

interface SectionMeta {
  hash: string; // hash of the section's tree inputs when it was written
  locked: boolean;
  stale: boolean; // its tree inputs changed since
  generating: boolean;
}

interface ArticleStoreState {
  draft: GeneratedArticle | null;
  sectionMeta: Record<string, SectionMeta>;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  error: string | null;
  isGenerateModalOpen: boolean;
  lastOptions: ArticleOptions;

  generate: (options: ArticleOptions) => Promise<void>;
  regenerateSection: (sectionId: string, opts?: { lengthFactor?: number; instruction?: string }) => Promise<void>;
  generateMissingSection: (sectionId: string) => Promise<void>;
  cancelGeneration: () => void;
  lockSection: (sectionId: string) => void;
  unlockSection: (sectionId: string) => void;
  markStale: (sectionId: string) => void;
  refreshStaleness: () => void;
  computeHash: (section: ArticleSectionInput) => string;
  sectionState: (sectionId: string) => SectionState;
  approveDraft: () => void;
  unapproveDraft: () => void;
  openGenerateModal: () => void;
  closeGenerateModal: () => void;
  clearError: () => void;
}

// The current tree as article input (with the draft's options when one exists)
export function currentArticleInput(options: ArticleOptions): ArticleInput {
  const { treeData, projectSettings } = useIdeaStore.getState();
  return buildArticleInput(treeData, options, {
    projectTitle: projectSettings.title,
    previous: previousArticleOf(useBlogStore.getState().corpus),
  });
}

// The tree's axis order, which the draft's sections follow
export function treeAxisIds(): string[] {
  return (useIdeaStore.getState().treeData.children ?? []).map(axis => axis.id);
}

let controller: AbortController | null = null;

const errorMessage = (e: unknown) =>
  e instanceof DOMException && e.name === 'AbortError' ? 'أُلغي التوليد.' : e instanceof Error ? e.message : String(e);

export const useArticleStore = create<ArticleStoreState>()(persist((set, get) => ({
  draft: null,
  sectionMeta: {},
  isGenerating: false,
  progress: null,
  error: null,
  isGenerateModalOpen: false,
  lastOptions: DEFAULT_ARTICLE_OPTIONS,

  generate: async (options: ArticleOptions) => {
    if (get().isGenerating) return;
    // The previous blog part feeds the opening recap
    await useBlogStore.getState().loadCorpus();
    const input = currentArticleInput(options);
    if (!hasEnoughContent(input)) {
      set({ error: 'يلزم محوران على الأقل فيهما أفكار مدرجة في الوثيقة.' });
      return;
    }

    const { draft, sectionMeta } = get();
    const locked = new Set(Object.keys(sectionMeta).filter(id => sectionMeta[id].locked && draft?.sections.some(s => s.id === id)));
    const hashes = Object.fromEntries(input.sections.map(s => [s.id, computeSectionHash(s)]));

    controller = new AbortController();
    set({
      isGenerating: true,
      error: null,
      lastOptions: options,
      progress: { label: 'جاري التحضير...', step: 0, total: 1 },
      sectionMeta: Object.fromEntries(input.sections.map(s => [s.id, {
        hash: sectionMeta[s.id]?.hash ?? '',
        locked: locked.has(s.id),
        stale: false,
        generating: !locked.has(s.id),
      }])),
    });

    try {
      const article = await generateArticle(input, options, progress => set({ progress }), {
        signal: controller.signal,
        existing: draft,
        locked,
      });
      set({
        draft: article,
        // A locked section keeps the hash of the inputs it was written from
        sectionMeta: Object.fromEntries(article.sections.map(s => [s.id, {
          hash: locked.has(s.id) ? sectionMeta[s.id].hash : hashes[s.id],
          locked: locked.has(s.id),
          stale: false,
          generating: false,
        }])),
      });
    } catch (e) {
      set({ error: errorMessage(e), sectionMeta });
    } finally {
      controller = null;
      set({ isGenerating: false, progress: null });
      get().refreshStaleness();
    }
  },

  regenerateSection: async (sectionId, opts = {}) => {
    const { draft, sectionMeta, isGenerating } = get();
    if (!draft || isGenerating || sectionMeta[sectionId]?.locked) return;

    const input = currentArticleInput(draft.options);
    const section = input.sections.find(s => s.id === sectionId);
    if (!section) {
      set({ error: 'هذا المحور لم يعد في الشجرة أو لم تعد فيه أفكار مدرجة.' });
      return;
    }
    const plan = draft.outline.sections.find(s => s.id === sectionId);
    const wordBudget = opts.lengthFactor && plan ? Math.round((plan.wordBudget * opts.lengthFactor) / 10) * 10 : undefined;
    const locked = new Set(Object.keys(sectionMeta).filter(id => sectionMeta[id].locked));

    controller = new AbortController();
    set({
      isGenerating: true,
      error: null,
      progress: { label: 'جاري التحضير...', step: 0, total: 1 },
      sectionMeta: { ...sectionMeta, [sectionId]: { ...sectionMeta[sectionId], generating: true } },
    });

    try {
      const article = await regenerateOneSection(
        draft,
        section,
        input.allowedVerseRefs,
        { ...(wordBudget ? { wordBudget } : {}), ...(opts.instruction ? { instruction: opts.instruction } : {}) },
        progress => set({ progress }),
        { signal: controller.signal, locked }
      );
      set(state => ({
        draft: article,
        sectionMeta: { ...state.sectionMeta, [sectionId]: { hash: computeSectionHash(section), locked: false, stale: false, generating: false } },
      }));
    } catch (e) {
      set(state => ({
        error: errorMessage(e),
        sectionMeta: { ...state.sectionMeta, [sectionId]: { ...state.sectionMeta[sectionId], generating: false } },
      }));
    } finally {
      controller = null;
      set({ isGenerating: false, progress: null });
      get().refreshStaleness();
    }
  },

  // Writes an axis that has no section in the draft yet, in its place in the tree
  // order (the outline gets a minimal plan for it); an empty slot is removed again
  // when the writing fails.
  generateMissingSection: async (sectionId) => {
    const { draft, isGenerating } = get();
    if (!draft || isGenerating || draft.sections.some(s => s.id === sectionId)) return;
    const section = currentArticleInput(draft.options).sections.find(s => s.id === sectionId);
    if (!section) {
      set({ error: 'هذا المحور لم يعد في الشجرة أو لم تعد فيه أفكار مدرجة.' });
      return;
    }

    const budgets = draft.outline.sections.map(s => s.wordBudget);
    const plan: OutlineSection = {
      id: section.id,
      axisName: section.axisName,
      thesis: section.axisName,
      keyMoves: [],
      verseRefs: section.verseRefs,
      transitionIn: '',
      transitionOut: '',
      wordBudget: budgets.length ? Math.round(budgets.reduce((a, b) => a + b, 0) / budgets.length / 10) * 10 : 600,
      coveredNodeIds: section.nodes.filter(n => n.depth > 0).map(n => n.id),
    };
    const slot: DraftSection = { id: section.id, axisName: section.axisName, blocks: [], coveredNodeIds: [], wordCount: 0 };
    const axisIds = treeAxisIds();
    set(state => ({
      draft: {
        ...draft,
        sections: sortByAxisOrder([...draft.sections, slot], axisIds),
        outline: { ...draft.outline, sections: sortByAxisOrder([...draft.outline.sections.filter(s => s.id !== sectionId), plan], axisIds) },
      },
      sectionMeta: { ...state.sectionMeta, [sectionId]: { hash: '', locked: false, stale: false, generating: false } },
    }));

    await get().regenerateSection(sectionId);

    const written = get().draft?.sections.find(s => s.id === sectionId);
    if (written && written.blocks.length === 0) {
      set(state => {
        const { [sectionId]: _removed, ...sectionMeta } = state.sectionMeta;
        return {
          sectionMeta,
          draft: state.draft && { ...state.draft, sections: state.draft.sections.filter(s => s.id !== sectionId) },
        };
      });
    }
  },

  cancelGeneration: () => controller?.abort(),

  lockSection: (sectionId) => set(state => ({
    sectionMeta: { ...state.sectionMeta, [sectionId]: { ...state.sectionMeta[sectionId], locked: true } },
  })),

  unlockSection: (sectionId) => set(state => ({
    sectionMeta: { ...state.sectionMeta, [sectionId]: { ...state.sectionMeta[sectionId], locked: false } },
  })),

  markStale: (sectionId) => set(state => ({
    sectionMeta: { ...state.sectionMeta, [sectionId]: { ...state.sectionMeta[sectionId], stale: true } },
  })),

  // Puts the draft in the tree's axis order (moving an axis only reorders, it
  // never regenerates), then compares each section's stored hash with its
  // current tree inputs (moving an idea marks its old and new axes stale).
  refreshStaleness: () => {
    const { sectionMeta, isGenerating } = get();
    let { draft } = get();
    if (!draft) return;
    if (!isGenerating) {
      // During generation the result is reordered once it is in (finally → refreshStaleness)
      const ordered = orderArticleByTree(draft, treeAxisIds());
      if (ordered !== draft) {
        draft = ordered;
        set({ draft });
      }
    }
    const input = currentArticleInput(draft.options);
    const current = new Map(input.sections.map(s => [s.id, computeSectionHash(s)]));
    let changed = false;
    const next: Record<string, SectionMeta> = {};
    for (const s of draft.sections) {
      const meta = sectionMeta[s.id] ?? { hash: '', locked: false, stale: false, generating: false };
      const stale = current.get(s.id) !== meta.hash;
      if (stale !== meta.stale) changed = true;
      next[s.id] = { ...meta, stale };
    }
    if (changed) set({ sectionMeta: { ...sectionMeta, ...next } });
  },

  computeHash: (section) => computeSectionHash(section),

  sectionState: (sectionId) => {
    const meta = get().sectionMeta[sectionId];
    if (!meta) return 'fresh';
    if (meta.generating) return 'generating';
    if (meta.locked) return 'locked';
    return meta.stale ? 'stale' : 'fresh';
  },

  approveDraft: () => set(state => (state.draft ? { draft: { ...state.draft, approvedAt: new Date().toISOString() } } : {})),
  unapproveDraft: () => set(state => (state.draft ? { draft: { ...state.draft, approvedAt: null } } : {})),

  openGenerateModal: () => set({ isGenerateModalOpen: true, error: null }),
  closeGenerateModal: () => set({ isGenerateModalOpen: false }),
  clearError: () => set({ error: null }),
}), {
  name: 'idea-builder-article',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    draft: state.draft,
    lastOptions: state.lastOptions,
    sectionMeta: Object.fromEntries(Object.entries(state.sectionMeta).map(([id, m]) => [id, { ...m, generating: false }])),
  }),
}));

// Tree edits mark the affected sections stale (never regenerate on their own).
useIdeaStore.subscribe((state, prev) => {
  if (state.treeData !== prev.treeData) useArticleStore.getState().refreshStaleness();
});
useArticleStore.getState().refreshStaleness();
