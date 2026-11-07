import { create } from 'zustand';
import type { SaveState } from '../components/SaveStateIndicator';

interface SaveStateStore {
  /** `null` while no document is open, which hides the indicator. */
  state: SaveState | null;
  fileName: string | null;
  set: (state: SaveState | null, fileName?: string | null) => void;
}

/** Feeds the top bar's save-state slot (G-1). M1's autosave writes to it. */
export const useSaveStateStore = create<SaveStateStore>()((setStore) => ({
  state: null,
  fileName: null,
  set: (state, fileName = null) => {
    setStore({ state, fileName });
  },
}));
