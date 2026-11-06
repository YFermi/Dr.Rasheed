import { useArticleStore } from './useArticleStore';
import { useIdeaStore } from './useIdeaStore';

// «مشروع جديد»: an empty project. The draft (with its generation state) is emptied
// first, then the tree and the project settings; both stores persist the empty
// state, so nothing of the previous project comes back after a reload. App-wide
// data stays: interface preferences, the tour, the API key, the reference articles
// and the story corpus (shared by the series' projects), and the recording script.
export function startNewProject(): void {
  useArticleStore.getState().resetDraftState();
  useIdeaStore.getState().resetToInitial();
}
