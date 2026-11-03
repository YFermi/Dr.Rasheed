import { create } from 'zustand';
import { getApiKey, setApiKey, removeApiKey, maskKey, fetchServerHasKey, getModel, setModel } from '../utils/apiKey';

// Reactive view of the API key state for the Navbar, the key modal and the AI
// features. The key itself lives only in localStorage (see utils/apiKey.ts).
interface ApiKeyStoreState {
  hasKey: boolean;
  maskedKey: string;
  // Whether the server has its own GEMINI_API_KEY (null until checked)
  serverHasKey: boolean | null;
  isModalOpen: boolean;
  model: string; // '' = the server's default

  saveKey: (key: string) => void;
  deleteKey: () => void;
  checkServerKey: () => Promise<void>;
  chooseModel: (model: string) => void;
  openModal: () => void;
  closeModal: () => void;
}

const snapshot = () => {
  const key = getApiKey();
  return { hasKey: Boolean(key), maskedKey: key ? maskKey(key) : '' };
};

export const useApiKeyStore = create<ApiKeyStoreState>((set) => ({
  ...snapshot(),
  serverHasKey: null,
  isModalOpen: false,
  model: getModel(),

  saveKey: (key) => {
    setApiKey(key);
    set(snapshot());
  },
  deleteKey: () => {
    removeApiKey();
    set(snapshot());
  },
  checkServerKey: async () => set({ serverHasKey: await fetchServerHasKey() }),
  chooseModel: (model) => {
    setModel(model);
    set({ model: getModel() });
  },
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));

// AI features work with the browser's key or the server's own key.
export const selectAiAvailable = (s: ApiKeyStoreState) => s.hasKey || s.serverHasKey === true;
