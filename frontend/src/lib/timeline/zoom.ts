/** Horizontal timeline zoom: steps, wheel, Fit and anchor-preserving scroll (RM-20). */
import tokens from '../../../../shared/design-tokens.json';
import type { TimelineView } from './scale';

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

const LABEL_COLUMN_WIDTH = tokens.timeline.labelColumnWidth;
/** Steps closer than this count as equal, so float noise never skips a step. */
const STEP_EPSILON = 0.001;
/** Zoom is kept to three decimals. */
const PRECISION = 1000;
/** Ctrl/Cmd+wheel: `exp(-deltaY * WHEEL_RATE)`, with `deltaY` clamped to ±WHEEL_DELTA_MAX. */
const WHEEL_RATE = 0.004;
const WHEEL_DELTA_MAX = 60;
/** Sprint view keeps 13 sprints readable at 100%; other views need this much. */
const SPRINT_VIEW_COLUMNS = 13;
const OTHER_VIEW_MIN_WIDTH = 900;

/** Clamp to 0.5–3 and round to three decimals. */
export function clampZoom(zoom: number): number {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  return Math.round(clamped * PRECISION) / PRECISION;
}

/** The next step up (`direction` 1) or down (-1); stays put at the ends. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const next =
    direction > 0
      ? ZOOM_STEPS.find((step) => step > zoom + STEP_EPSILON)
      : [...ZOOM_STEPS].reverse().find((step) => step < zoom - STEP_EPSILON);
  return next ?? clampZoom(zoom);
}

/** Continuous Ctrl/Cmd+wheel zoom. */
export function wheelZoom(zoom: number, deltaY: number): number {
  const delta = Math.min(WHEEL_DELTA_MAX, Math.max(-WHEEL_DELTA_MAX, deltaY));
  return clampZoom(zoom * Math.exp(-delta * WHEEL_RATE));
}

/** Minimum timeline width at 100% for a view. */
export function baseMinWidth(view: TimelineView): number {
  if (view !== 'sprints') return OTHER_VIEW_MIN_WIDTH;
  return LABEL_COLUMN_WIDTH + SPRINT_VIEW_COLUMNS * tokens.timeline.sprintMinWidth;
}

/**
 * Zoom that fits every column into a container `containerWidth` px wide.
 * Rounded down: rounding up overflows by a few px and shows a scrollbar.
 */
export function fitZoom(containerWidth: number, baseMinW: number): number {
  const track = containerWidth - LABEL_COLUMN_WIDTH;
  const needed = Math.max(containerWidth, baseMinW) - LABEL_COLUMN_WIDTH;
  const fitted = Math.floor((track / needed) * PRECISION) / PRECISION;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fitted));
}

/**
 * The scrollLeft that keeps the date under the pointer still after a zoom.
 * `anchorX` is the pointer's x inside the scroll box.
 */
export function anchoredScrollLeft(
  oldWidth: number,
  newWidth: number,
  scrollLeft: number,
  anchorX: number,
): number {
  const position = Math.max(
    0,
    (scrollLeft + anchorX - LABEL_COLUMN_WIDTH) / Math.max(1, oldWidth - LABEL_COLUMN_WIDTH),
  );
  return Math.max(0, LABEL_COLUMN_WIDTH + position * (newWidth - LABEL_COLUMN_WIDTH) - anchorX);
}
