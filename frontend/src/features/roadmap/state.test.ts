import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRoadmapEditorStore,
  PANELS_STORAGE_KEY,
  VIEW_STORAGE_KEY,
  ZOOM_STORAGE_KEY,
} from './state';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRoadmapEditor', () => {
  it('RM-1 opens on Months with nothing selected', () => {
    const state = createRoadmapEditorStore().getState();

    expect([state.view, state.selectedItemId, state.panelOpen, state.groupBy]).toEqual([
      'months',
      null,
      true,
      'team',
    ]);
  });

  it('RM-14 collapsed panel survives a store re-create', () => {
    createRoadmapEditorStore().getState().togglePanel();

    expect(createRoadmapEditorStore().getState().panelOpen).toBe(false);
  });

  it('RM-14 keeps other editors’ panel entries', () => {
    window.localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify({ insp: false }));

    createRoadmapEditorStore().getState().togglePanel();

    expect(JSON.parse(window.localStorage.getItem(PANELS_STORAGE_KEY) ?? '{}')).toEqual({
      insp: false,
      detail: false,
    });
  });

  it('RM-20 each view remembers its zoom across a re-create', () => {
    const store = createRoadmapEditorStore();
    store.getState().setZoom('sprints', 0.665);
    store.getState().setZoom('pis', 2);

    expect(createRoadmapEditorStore().getState().zoom).toEqual({
      sprints: 0.665,
      months: 1,
      pis: 2,
    });
  });

  it('RM-20 zoom is clamped to 50–300%', () => {
    const store = createRoadmapEditorStore();
    store.getState().setZoom('months', 9);

    expect(store.getState().zoom.months).toBe(3);
  });

  it('RM-1 view survives a re-create', () => {
    createRoadmapEditorStore().getState().setView('pis');

    expect(createRoadmapEditorStore().getState().view).toBe('pis');
  });

  it('RM-1 a malformed stored value falls back to the default', () => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, '"weeks"');
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '{not json');

    const state = createRoadmapEditorStore().getState();

    expect([state.view, state.zoom]).toEqual(['months', { sprints: 1, months: 1, pis: 1 }]);
  });

  it('RM-14 a throwing localStorage falls back and still toggles', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = createRoadmapEditorStore();

    store.getState().togglePanel();

    expect(store.getState().panelOpen).toBe(false);
  });
});
