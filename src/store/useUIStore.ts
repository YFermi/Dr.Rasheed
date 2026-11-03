import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Interface preferences of this browser: font size and family (the A4 sheets
// keep their own), and whether the guided tour was completed.

export type UIFontFamily = 'adobe' | 'amiri' | 'tajawal';

// Latin letters and digits always in Dosis; the Arabic font is the choice
export const UI_FONTS: Record<UIFontFamily, { label: string; stack: string }> = {
  adobe: { label: 'Adobe Arabic', stack: "'Dosis', 'Adobe Arabic', 'Amiri', serif" },
  amiri: { label: 'Amiri (أميري)', stack: "'Dosis', 'Amiri', serif" },
  tajawal: { label: 'Tajawal (تجوال)', stack: "'Dosis', 'Tajawal', sans-serif" },
};

// Percent of the original sizes; 125 = two steps up (Adobe Arabic is small).
// Same default as --ui-scale in src/index.css.
export const UI_FONT_SIZE_DEFAULT = 125;
export const UI_FONT_SIZE_MIN = 90;
export const UI_FONT_SIZE_MAX = 160;
const UI_FONT_SIZE_STEP = 10;
// From this size on, the navbar drops its secondary items (.nav-secondary in index.css)
const UI_FONT_SIZE_LARGE = 140;

interface UIStoreState {
  uiFontSize: number;
  uiFontFamily: UIFontFamily;
  tourCompleted: boolean;
  isTourRunning: boolean;

  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  setFontFamily: (family: UIFontFamily) => void;
  startTour: () => void;
  finishTour: () => void;
}

const clampSize = (size: number) => Math.min(UI_FONT_SIZE_MAX, Math.max(UI_FONT_SIZE_MIN, size));

// The sizes and fonts in index.css read these variables on <html>
function applyPreferences({ uiFontSize, uiFontFamily }: Pick<UIStoreState, 'uiFontSize' | 'uiFontFamily'>) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  root.setProperty('--ui-scale', String(uiFontSize / 100));
  root.setProperty('--ui-font', (UI_FONTS[uiFontFamily] ?? UI_FONTS.adobe).stack);
  document.documentElement.toggleAttribute('data-ui-large', uiFontSize >= UI_FONT_SIZE_LARGE);
}

export const useUIStore = create<UIStoreState>()(persist((set) => ({
  uiFontSize: UI_FONT_SIZE_DEFAULT,
  uiFontFamily: 'adobe',
  tourCompleted: false,
  isTourRunning: false,

  increaseFont: () => set(state => ({ uiFontSize: clampSize(state.uiFontSize + UI_FONT_SIZE_STEP) })),
  decreaseFont: () => set(state => ({ uiFontSize: clampSize(state.uiFontSize - UI_FONT_SIZE_STEP) })),
  resetFont: () => set({ uiFontSize: UI_FONT_SIZE_DEFAULT }),
  setFontFamily: (uiFontFamily) => set({ uiFontFamily }),
  startTour: () => set({ isTourRunning: true }),
  finishTour: () => set({ isTourRunning: false, tourCompleted: true }),
}), {
  name: 'idea-builder-ui',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    uiFontSize: state.uiFontSize,
    uiFontFamily: state.uiFontFamily,
    tourCompleted: state.tourCompleted,
  }),
  onRehydrateStorage: () => (state) => {
    if (state) applyPreferences(state);
  },
}));

applyPreferences(useUIStore.getState());
useUIStore.subscribe(applyPreferences);
