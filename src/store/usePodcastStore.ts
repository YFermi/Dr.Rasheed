import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_LEAD_HOST, PODCAST_DISCLAIMER } from '../types/podcast';
import type {
  PodcastEpisode,
  PodcastHost,
  PodcastLine,
  PodcastScript,
  PodcastSegment,
  PodcastSegmentRequest,
  PodcastSegmentResponse,
  PodcastSource,
} from '../types/podcast';
import { callApiWithKey } from '../utils/apiKey';
import { aiErrorMessage } from '../utils/aiErrors';
import {
  DEFAULT_EPISODE_NUMBER,
  DEFAULT_PROGRAM_NAME,
  draftSegments,
  lastLinesOf,
  newLineId,
  referenceSegments,
  resolvePodcastVerses,
  validVerseRefs,
} from '../utils/podcastScript';
import { useReferenceStore } from './useReferenceStore';
import { useArticleStore } from './useArticleStore';
import { useBlogStore } from './useBlogStore';

// The recording script (🎙️ سكريبت التسجيل): generated segment by segment from an
// approved reference article or the current draft, editable line by line, kept in
// localStorage with the programme settings for the next episodes.

export interface PodcastSettings {
  programName: string;
  nextEpisodeNumber: number;
  leadHost: PodcastHost; // the last choice, offered again for the next episode
}

export interface PodcastProgress {
  step: number;
  total: number;
  label: string;
}

interface PodcastStoreState {
  script: PodcastScript | null;
  settings: PodcastSettings;
  isModalOpen: boolean;
  isGenerating: boolean;
  progress: PodcastProgress | null;
  error: string | null;

  openModal: () => void;
  closeModal: () => void;
  updateSettings: (patch: Partial<PodcastSettings>) => void;
  // Splits the source into segments and writes them all
  generate: (source: Pick<PodcastSource, 'kind' | 'id'>, episode: Omit<PodcastEpisode, 'disclaimer'>) => Promise<void>;
  // Writes the segments not written yet (after an error or a cancel)
  resume: () => Promise<void>;
  regenerateSegment: (segmentId: string, instruction?: string) => Promise<void>;
  cancel: () => void;
  updateEpisode: (patch: Partial<Omit<PodcastEpisode, 'disclaimer' | 'leadHost'>>) => void;
  updateLine: (segmentId: string, lineId: string, patch: Partial<Pick<PodcastLine, 'text' | 'speaker'>>) => void;
  deleteLine: (segmentId: string, lineId: string) => void;
  insertLineAfter: (segmentId: string, lineId: string | null) => void;
  clearError: () => void;
}

let controller: AbortController | null = null;

const bodyOf = (script: PodcastScript) => script.segments.filter(s => s.kind === 'body');

function requestFor(script: PodcastScript, index: number, instruction?: string): PodcastSegmentRequest {
  const segment = script.segments[index];
  const body = bodyOf(script);
  return {
    kind: segment.kind,
    programName: script.episode.programName,
    episodeNumber: script.episode.episodeNumber,
    leadHost: script.episode.leadHost ?? DEFAULT_LEAD_HOST,
    articleTitle: script.source.title,
    segmentTitle: segment.title,
    segmentIndex: segment.kind === 'body' ? body.indexOf(segment) + 1 : 0,
    bodyCount: body.length,
    topics: [...new Set(body.map(s => s.title.replace(/\s*\([^)]*\)$/, '')))],
    sourceText: segment.sourceText,
    allowedVerseRefs: script.allowedVerseRefs,
    previousLines: index > 0 ? lastLinesOf(script.segments[index - 1]) : [],
    ...(instruction?.trim() ? { instruction: instruction.trim() } : {}),
  };
}

export const usePodcastStore = create<PodcastStoreState>()(persist((set, get) => {
  const patchSegment = (segmentId: string, patch: (s: PodcastSegment) => Partial<PodcastSegment>) =>
    set(state => state.script ? {
      script: { ...state.script, segments: state.script.segments.map(s => (s.id === segmentId ? { ...s, ...patch(s) } : s)) },
    } : {});

  // One API call: the segment's lines, verse text from Tanzil
  async function writeSegment(index: number, signal: AbortSignal, instruction?: string): Promise<void> {
    const script = get().script!;
    const segment = script.segments[index];
    patchSegment(segment.id, () => ({ status: 'generating', error: undefined }));
    try {
      const result = await callApiWithKey<PodcastSegmentResponse>('/api/generate-podcast-script', requestFor(script, index, instruction), signal);
      const lines = await resolvePodcastVerses(result.lines.map(l => ({ ...l, id: newLineId() })));
      patchSegment(segment.id, () => ({ lines, status: 'done', rejectedRefs: result.rejectedRefs }));
    } catch (e) {
      const aborted = signal.aborted;
      patchSegment(segment.id, s => ({ status: s.lines.length ? 'done' : aborted ? 'pending' : 'error', error: aborted ? undefined : aiErrorMessage(e, 'كتابة هذا المقطع') }));
      throw e;
    }
  }

  async function writePending(): Promise<void> {
    const script = get().script;
    if (!script || get().isGenerating) return;
    const todo = script.segments.map((s, i) => (s.status === 'done' ? -1 : i)).filter(i => i >= 0);
    if (!todo.length) return;
    controller = new AbortController();
    const signal = controller.signal;
    set({ isGenerating: true, error: null });
    useBlogStore.getState().setLeftPanelView('podcast');
    try {
      for (const [k, index] of todo.entries()) {
        set({ progress: { step: k + 1, total: todo.length, label: get().script!.segments[index].title } });
        await writeSegment(index, signal);
      }
    } catch (e) {
      if (!signal.aborted) set({ error: aiErrorMessage(e, 'كتابة السكريبت') });
    } finally {
      controller = null;
      set({ isGenerating: false, progress: null });
    }
  }

  return {
    script: null,
    settings: { programName: DEFAULT_PROGRAM_NAME, nextEpisodeNumber: DEFAULT_EPISODE_NUMBER, leadHost: DEFAULT_LEAD_HOST },
    isModalOpen: false,
    isGenerating: false,
    progress: null,
    error: null,

    openModal: () => set({ isModalOpen: true }),
    closeModal: () => set({ isModalOpen: false }),
    updateSettings: (patch) => set(state => ({ settings: { ...state.settings, ...patch } })),

    generate: async (source, episode) => {
      if (get().isGenerating) return;
      let title = '';
      let split: { segments: PodcastSegment[]; refs: string[] };
      if (source.kind === 'draft') {
        const draft = useArticleStore.getState().draft;
        if (!draft?.sections.length) {
          set({ error: 'لا توجد مسودة مكتوبة بعد.' });
          return;
        }
        title = draft.title;
        const d = draftSegments(draft);
        split = { segments: d.segments, refs: d.allowedVerseRefs };
      } else {
        const article = useReferenceStore.getState().getArticle(source.id);
        if (!article) {
          set({ error: 'المقال المرجعي غير موجود.' });
          return;
        }
        title = article.title;
        const r = referenceSegments(article);
        split = { segments: r.segments, refs: await validVerseRefs(r.refCandidates) };
      }
      set(state => ({
        isModalOpen: false,
        error: null,
        script: {
          id: `podcast-${Date.now()}`,
          source: { kind: source.kind, id: source.id, title },
          // The disclaimer is fixed: inserted by the app, never written by the model
          episode: { ...episode, disclaimer: PODCAST_DISCLAIMER },
          segments: split.segments,
          allowedVerseRefs: split.refs,
          generatedAt: new Date().toISOString(),
        },
        settings: {
          ...state.settings,
          programName: episode.programName,
          leadHost: episode.leadHost ?? DEFAULT_LEAD_HOST,
          nextEpisodeNumber: episode.episodeNumber + 1,
        },
      }));
      await writePending();
    },

    resume: writePending,

    regenerateSegment: async (segmentId, instruction) => {
      const script = get().script;
      if (!script || get().isGenerating) return;
      const index = script.segments.findIndex(s => s.id === segmentId);
      if (index < 0) return;
      controller = new AbortController();
      const signal = controller.signal;
      set({ isGenerating: true, error: null, progress: { step: 1, total: 1, label: script.segments[index].title } });
      try {
        await writeSegment(index, signal, instruction);
      } catch (e) {
        if (!signal.aborted) set({ error: aiErrorMessage(e, 'إعادة كتابة المقطع') });
      } finally {
        controller = null;
        set({ isGenerating: false, progress: null });
      }
    },

    cancel: () => controller?.abort(),

    updateEpisode: (patch) => set(state => state.script ? { script: { ...state.script, episode: { ...state.script.episode, ...patch } } } : {}),

    updateLine: (segmentId, lineId, patch) =>
      patchSegment(segmentId, s => ({ lines: s.lines.map(l => (l.id === lineId ? { ...l, ...patch } : l)) })),

    deleteLine: (segmentId, lineId) =>
      patchSegment(segmentId, s => ({ lines: s.lines.filter(l => l.id !== lineId) })),

    // A new empty line for Dr. Rasheed after the given one (null: at the start)
    insertLineAfter: (segmentId, lineId) =>
      patchSegment(segmentId, s => {
        const at = lineId ? s.lines.findIndex(l => l.id === lineId) + 1 : 0;
        const line: PodcastLine = { id: newLineId(), type: 'speech', speaker: 'rasheed', text: '' };
        return { lines: [...s.lines.slice(0, at), line, ...s.lines.slice(at)] };
      }),

    clearError: () => set({ error: null }),
  };
}, {
  name: 'idea-builder-podcast-script',
  version: 2,
  // v2: fixed disclaimer, lead host (settings.disclaimer is gone)
  migrate: (persisted: any) => {
    if (persisted?.settings) {
      delete persisted.settings.disclaimer;
      persisted.settings.leadHost ??= DEFAULT_LEAD_HOST;
    }
    if (persisted?.script) persisted.script.episode = { ...persisted.script.episode, disclaimer: PODCAST_DISCLAIMER };
    return persisted;
  },
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ script: state.script, settings: state.settings }),
  // A segment cut off by closing the page is written again on «استئناف»
  onRehydrateStorage: () => (state) => {
    if (!state?.script) return;
    state.script.segments = state.script.segments.map(s => (s.status === 'generating' ? { ...s, status: s.lines.length ? 'done' : 'pending' } : s));
  },
}));
