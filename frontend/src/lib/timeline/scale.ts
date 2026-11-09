/** Date ranges, header columns, column boundaries and CSS positions per view (RM-4–RM-7). */
import tokens from '../../../../shared/design-tokens.json';
import { allSprints, currentSprint, type Pi, type PiInput, programIncrements } from './cadence';
import { addDays, fromDay, toDay } from './dates';
import { fullRangeLabel, monthName } from './labels';
import { baseMinWidth } from './zoom';

export type TimelineView = 'sprints' | 'months' | 'pis';

export interface DateRange {
  start: string;
  endExclusive: string;
}

export type ColumnRow = 'pi' | 'sprint' | 'month' | 'tick';

export interface Column {
  row: ColumnRow;
  label: string;
  start: string;
  endExclusive: string;
  /** Sprint row only: the full date range; the header picks a compact form from `colW`. */
  dates?: string;
  /** Month row: the PI containing the month's midpoint. PI view: the PI's date range. */
  sub?: string;
  /** The sprint (or tick) containing today. */
  current: boolean;
  ip: boolean;
  /** The column was cut by the visible range; centre its label on the visible part. */
  clipped: boolean;
}

export interface Boundary {
  date: string;
  /** PI starts draw a stronger line. */
  strong: boolean;
}

export interface TimelineInput {
  start: string;
  sprintLengthDays: number;
  pis: readonly PiInput[];
}

const LABEL_COLUMN_WIDTH = tokens.timeline.labelColumnWidth;
/** The Sprint view opens on this many sprints (RM-5). */
export const SPRINT_VIEW_SPRINTS = 13;

interface Span {
  start: number;
  end: number;
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

function spanOf(range: DateRange): Span {
  return { start: toDay(range.start), end: toDay(range.endExclusive) };
}

/** Scheduled items as `[start, end)` day spans; `end` in the document is inclusive. */
function itemSpans(items: readonly { start?: string | null; end?: string | null }[]): Span[] {
  return items.flatMap((item) =>
    item.start && item.end ? [{ start: toDay(item.start), end: toDay(item.end) + 1 }] : [],
  );
}

function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function firstOfNextMonth(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${String(nextYear)}-${String(nextMonth).padStart(2, '0')}-01`;
}

function monthsRange(timeline: TimelineInput, spans: Span[]): DateRange {
  // ASSUMPTION (matches timeline.py): with nothing scheduled, show the timeline start's month.
  if (spans.length === 0) {
    return { start: firstOfMonth(timeline.start), endExclusive: firstOfNextMonth(timeline.start) };
  }
  const earliest = Math.min(...spans.map((span) => span.start));
  const latestInclusive = Math.max(...spans.map((span) => span.end)) - 1;
  return {
    start: firstOfMonth(fromDay(earliest)),
    endExclusive: firstOfNextMonth(fromDay(latestInclusive)),
  };
}

/**
 * The range a view opens on.
 * - Sprints: the first sprint starting on or after `timeline.start`, then 13 sprints (fewer if the PIs
 *   run out); with no such sprint, 13 sprint lengths from `timeline.start`.
 * - Months: the month of the earliest scheduled start to the month after the latest end; with nothing
 *   scheduled, the month of `timeline.start`.
 * - PIs: whole PIs overlapping the scheduled items, else every PI; with no PIs, the Months range.
 * Edge cases mirror `backend/app/render/timeline.py` (ADR-3).
 */
export function defaultRange(
  view: TimelineView,
  timeline: TimelineInput,
  items: readonly { start?: string | null; end?: string | null }[],
): DateRange {
  const spans = itemSpans(items);
  const pis = programIncrements(timeline.pis, timeline.sprintLengthDays);
  if (view === 'sprints') {
    const timelineStart = toDay(timeline.start);
    const sprints = allSprints(pis).filter((sprint) => toDay(sprint.start) >= timelineStart);
    const shown = sprints.slice(0, SPRINT_VIEW_SPRINTS);
    const first = shown[0];
    const last = shown[shown.length - 1];
    if (first && last) return { start: first.start, endExclusive: last.endExclusive };
    return {
      start: timeline.start,
      endExclusive: addDays(timeline.start, SPRINT_VIEW_SPRINTS * timeline.sprintLengthDays),
    };
  }
  if (view === 'pis') {
    const touched = pis.filter((pi) => spans.some((span) => overlaps(span, spanOf(pi))));
    const chosen = touched.length > 0 ? touched : pis;
    const first = chosen[0];
    if (first) {
      const end = Math.max(...chosen.map((pi) => toDay(pi.endExclusive)));
      return { start: first.start, endExclusive: fromDay(end) };
    }
  }
  return monthsRange(timeline, spans);
}

/** Cut a column to the range and mark it clipped when anything was cut. */
function clip(
  range: Span,
  start: string,
  endExclusive: string,
): { start: string; endExclusive: string; clipped: boolean } {
  const from = Math.max(toDay(start), range.start);
  const to = Math.min(toDay(endExclusive), range.end);
  return {
    start: fromDay(from),
    endExclusive: fromDay(to),
    clipped: from !== toDay(start) || to !== toDay(endExclusive),
  };
}

function piContaining(pis: readonly Pi[], day: number): Pi | undefined {
  return pis.find((pi) => toDay(pi.start) <= day && day < toDay(pi.endExclusive));
}

function sprintColumns(range: Span, pis: readonly Pi[], currentStart: string | null): Column[] {
  const piRow: Column[] = pis
    .filter((pi) => overlaps(range, spanOf(pi)))
    .map((pi) => ({
      row: 'pi',
      label: pi.name,
      ...clip(range, pi.start, pi.endExclusive),
      current: false,
      ip: false,
    }));
  const sprintRow: Column[] = allSprints(pis)
    .filter((sprint) => overlaps(range, spanOf(sprint)))
    .map((sprint) => ({
      row: 'sprint',
      label: sprint.label,
      ...clip(range, sprint.start, sprint.endExclusive),
      dates: fullRangeLabel(sprint.start, sprint.endExclusive),
      current: sprint.start === currentStart,
      ip: sprint.ip,
    }));
  return [...piRow, ...sprintRow];
}

function monthColumns(range: Span, pis: readonly Pi[]): Column[] {
  const result: Column[] = [];
  let monthStart = firstOfMonth(fromDay(range.start));
  while (toDay(monthStart) < range.end) {
    const monthEnd = firstOfNextMonth(monthStart);
    const cell = clip(range, monthStart, monthEnd);
    // The PI under the midpoint of the visible part of the month.
    const visibleDays = toDay(cell.endExclusive) - toDay(cell.start);
    const midpointPi = piContaining(pis, toDay(cell.start) + Math.floor(visibleDays / 2));
    const withYear = result.length === 0 || monthStart.slice(5, 7) === '01';
    const label = withYear
      ? `${monthName(monthStart)} ${monthStart.slice(0, 4)}`
      : monthName(monthStart);
    result.push({
      row: 'month',
      label,
      ...cell,
      ...(midpointPi ? { sub: midpointPi.name } : {}),
      current: false,
      ip: false,
    });
    monthStart = monthEnd;
  }
  return result;
}

function piViewColumns(range: Span, pis: readonly Pi[], currentStart: string | null): Column[] {
  const visible = pis.filter((pi) => overlaps(range, spanOf(pi)));
  const piRow: Column[] = visible.map((pi) => ({
    row: 'pi',
    label: pi.name,
    ...clip(range, pi.start, pi.endExclusive),
    sub: fullRangeLabel(pi.start, pi.endExclusive),
    current: false,
    ip: false,
  }));
  const tickRow: Column[] = allSprints(visible)
    .filter((sprint) => overlaps(range, spanOf(sprint)))
    .map((sprint) => ({
      row: 'tick',
      label: sprint.tickLabel,
      ...clip(range, sprint.start, sprint.endExclusive),
      current: sprint.start === currentStart,
      ip: sprint.ip,
    }));
  return [...piRow, ...tickRow];
}

/** Header cells for a view, top row first, each row in date order. */
export function columns(
  view: TimelineView,
  range: DateRange,
  pis: readonly Pi[],
  today: string,
): Column[] {
  const span = spanOf(range);
  const currentStart = currentSprint(pis, today)?.start ?? null;
  if (view === 'months') return monthColumns(span, pis);
  if (view === 'sprints') return sprintColumns(span, pis, currentStart);
  return piViewColumns(span, pis, currentStart);
}

/**
 * Vertical column lines strictly inside the range, sorted by date.
 * Months: every month start, none strong. Sprints and PIs: the de-duplicated edges of the visible
 * sprint columns, strong when the edge is a PI start or end.
 */
export function boundaries(view: TimelineView, range: DateRange, pis: readonly Pi[]): Boundary[] {
  const span = spanOf(range);
  const edges = new Map<string, boolean>();
  if (view === 'months') {
    for (const column of monthColumns(span, pis)) edges.set(column.start, false);
  } else {
    const piEdges = new Set(pis.flatMap((pi) => [pi.start, pi.endExclusive]));
    for (const column of sprintColumns(span, pis, null).filter((cell) => cell.row === 'sprint')) {
      for (const date of [column.start, column.endExclusive]) edges.set(date, piEdges.has(date));
    }
  }
  return [...edges]
    .filter(([date]) => span.start < toDay(date) && toDay(date) < span.end)
    .sort(([a], [b]) => toDay(a) - toDay(b))
    .map(([date, strong]) => ({ date, strong }));
}

/** Position of `day` (a day number, may be fractional) across the range, clamped to 0–1. */
export function fraction(range: DateRange, day: number): number {
  const { start, end } = spanOf(range);
  const clamped = Math.min(Math.max(day, start), end);
  return (clamped - start) / (end - start);
}

/** Round to keep CSS strings short and free of float noise. */
function cssNumber(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

function pxTerm(offsetPx: number): string {
  if (offsetPx === 0) return '';
  return offsetPx > 0 ? ` + ${cssNumber(offsetPx)}px` : ` - ${cssNumber(-offsetPx)}px`;
}

/** CSS `left` for `day`: `calc(220px + (100% - 220px) * f + n px)`. */
export function leftCss(range: DateRange, day: number, offsetPx = 0): string {
  const f = cssNumber(fraction(range, day));
  return `calc(${String(LABEL_COLUMN_WIDTH)}px + (100% - ${String(LABEL_COLUMN_WIDTH)}px) * ${f}${pxTerm(offsetPx)})`;
}

/** CSS `width` for the half-open day span `[startDay, endDay)`, plus `offsetPx` (negative to inset). */
export function widthCss(range: DateRange, startDay: number, endDay: number, offsetPx = 0): string {
  const f = cssNumber(fraction(range, endDay) - fraction(range, startDay));
  return `calc((100% - ${String(LABEL_COLUMN_WIDTH)}px) * ${f}${pxTerm(offsetPx)})`;
}

/** Rendered timeline width in px: `220 + max(cw - 220, baseMinW - 220) * zoom`. */
export function timelineWidth(containerWidth: number, view: TimelineView, zoom: number): number {
  const minTrack = baseMinWidth(view) - LABEL_COLUMN_WIDTH;
  return LABEL_COLUMN_WIDTH + Math.max(containerWidth - LABEL_COLUMN_WIDTH, minTrack) * zoom;
}

/** Width in px of one sprint column, which picks the sprint date label (RM-5). */
export function sprintColumnWidth(
  containerWidth: number,
  view: TimelineView,
  zoom: number,
  range: DateRange,
  sprintLengthDays: number,
): number {
  const { start, end } = spanOf(range);
  const track = timelineWidth(containerWidth, view, zoom) - LABEL_COLUMN_WIDTH;
  return (track * sprintLengthDays) / (end - start);
}
