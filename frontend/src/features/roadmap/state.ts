/**
 * Roadmap editor state that is not part of the document: view, zoom, selection and
 * panel/display toggles. The document itself lives only in the query cache.
 * View, per-view zoom and the detail panel are remembered per browser (RM-14, RM-20).
 */
import { create } from 'zustand';
import { readStored, writeStored } from '../../lib/storage';
import { clampZoom, type TimelineView } from '../../lib/timeline';

export type GroupBy = 'team' | 'epic';
export type ZoomByView = Record<TimelineView, number>;

export const VIEW_STORAGE_KEY = 'ps-roadmap-view';
export const ZOOM_STORAGE_KEY = 'ps-roadmap-zoom';
/** Shared with the swimlane editor, which adds its own `insp` entry (M4). */
export const PANELS_STORAGE_KEY = 'ps-panels';

const VIEWS: readonly TimelineView[] = ['sprints', 'months', 'pis'];
const DEFAULT_VIEW: TimelineView = 'months';
const DEFAULT_ZOOM: ZoomByView = { sprints: 1, months: 1, pis: 1 };

type Panels = Record<string, unknown>;

function isView(value: unknown): value is TimelineView {
  return VIEWS.includes(value as TimelineView);
}

function isZoomByView(value: unknown): value is ZoomByView {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return VIEWS.every((view) => typeof record[view] === 'number' && Number.isFinite(record[view]));
}

function isPanels(value: unknown): value is Panels {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPanels(): Panels {
  return readStored<Panels>(PANELS_STORAGE_KEY, {}, isPanels);
}

function readZoom(): ZoomByView {
  const stored = readStored(ZOOM_STORAGE_KEY, DEFAULT_ZOOM, isZoomByView);
  return {
    sprints: clampZoom(stored.sprints),
    months: clampZoom(stored.months),
    pis: clampZoom(stored.pis),
  };
}

export interface RoadmapEditorState {
  view: TimelineView;
  zoom: ZoomByView;
  selectedItemId: string | null;
  panelOpen: boolean;
  groupBy: GroupBy;
  showMilestoneLines: boolean;
  setView: (view: TimelineView) => void;
  setZoom: (view: TimelineView, zoom: number) => void;
  select: (itemId: string | null) => void;
  togglePanel: () => void;
  setGroupBy: (groupBy: GroupBy) => void;
  setShowMilestoneLines: (show: boolean) => void;
}

/** A fresh store reading the remembered preferences. Tests call it to simulate a reload. */
export function createRoadmapEditorStore() {
  const detail = readPanels().detail;
  return create<RoadmapEditorState>()((set, get) => ({
    view: readStored(VIEW_STORAGE_KEY, DEFAULT_VIEW, isView),
    zoom: readZoom(),
    selectedItemId: null,
    panelOpen: typeof detail === 'boolean' ? detail : true,
    groupBy: 'team',
    showMilestoneLines: true,
    setView: (view) => {
      writeStored(VIEW_STORAGE_KEY, view);
      set({ view });
    },
    setZoom: (view, zoom) => {
      const next = { ...get().zoom, [view]: clampZoom(zoom) };
      writeStored(ZOOM_STORAGE_KEY, next);
      set({ zoom: next });
    },
    select: (selectedItemId) => {
      set({ selectedItemId });
    },
    togglePanel: () => {
      const panelOpen = !get().panelOpen;
      // Merge so the other editors' panel entries survive.
      writeStored(PANELS_STORAGE_KEY, { ...readPanels(), detail: panelOpen });
      set({ panelOpen });
    },
    setGroupBy: (groupBy) => {
      set({ groupBy });
    },
    setShowMilestoneLines: (showMilestoneLines) => {
      set({ showMilestoneLines });
    },
  }));
}

export const useRoadmapEditor = createRoadmapEditorStore();
