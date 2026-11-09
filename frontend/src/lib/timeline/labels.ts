/** Human-readable date and sprint labels for the timeline header and panel. */
import type { components } from '../../api/types';
import { type Pi, type Sprint, sprintAt } from './cadence';
import { addDays, toDay } from './dates';

type Milestone = components['schemas']['Milestone'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EN_DASH = '–';

/** Column widths (CSS px, after zoom) at which each sprint date form still fits (RM-5). */
export const FULL_DATES_MIN_COL_W = 96;
export const COMPACT_DATES_MIN_COL_W = 70;
export const START_DATE_MIN_COL_W = 44;

function parts(iso: string): { year: number; month: string; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year ?? 0, month: MONTHS[(month ?? 1) - 1] ?? '', day: day ?? 0 };
}

/** Short month name: `Nov`. */
export function monthName(iso: string): string {
  return parts(iso).month;
}

/** `2 Nov`. */
export function formatDayMonth(iso: string): string {
  const { day, month } = parts(iso);
  return `${String(day)} ${month}`;
}

/** `15 Jan 2027`. */
export function formatDayMonthYear(iso: string): string {
  const { year } = parts(iso);
  return `${formatDayMonth(iso)} ${String(year)}`;
}

/** `2 Nov – 15 Nov` for a half-open range. */
export function fullRangeLabel(start: string, endExclusive: string): string {
  return `${formatDayMonth(start)} ${EN_DASH} ${formatDayMonth(addDays(endExclusive, -1))}`;
}

/** The widest sprint date label that fits a column `colW` CSS px wide (RM-5). */
export function sprintDateLabel(start: string, endExclusive: string, colW: number): string {
  if (colW >= FULL_DATES_MIN_COL_W) return fullRangeLabel(start, endExclusive);
  if (colW >= COMPACT_DATES_MIN_COL_W) {
    const last = addDays(endExclusive, -1);
    const first = parts(start);
    const end = parts(last);
    if (first.month === end.month && first.year === end.year) {
      return `${String(first.day)}${EN_DASH}${String(end.day)} ${end.month}`;
    }
    return `${formatDayMonth(start)}${EN_DASH}${formatDayMonth(last)}`;
  }
  if (colW >= START_DATE_MIN_COL_W) return formatDayMonth(start);
  return '';
}

/** Sprint header tooltip: `PI 4 · 2026 · S3 · 2 Nov – 15 Nov`. */
export function sprintTooltip(pi: Pick<Pi, 'name'>, sprint: Sprint): string {
  return `${pi.name} · ${sprint.label} · ${fullRangeLabel(sprint.start, sprint.endExclusive)}`;
}

/** The scheduled part of an item; `end` is inclusive. */
export interface DatedItem {
  start?: string | null;
  end?: string | null;
}

/**
 * Detail-panel span line: `Runs PI 4 · 2026 S4 → PI 1 · 2027 S3 · crosses Beta launch`.
 * The second PI name is left out when both ends fall in the same PI.
 * Returns '' when the item is unscheduled or either end is outside every sprint.
 */
export function spanText(
  item: DatedItem,
  pis: readonly Pi[],
  milestones: readonly Milestone[],
): string {
  if (!item.start || !item.end) return '';
  const first = sprintAt(pis, item.start);
  const last = sprintAt(pis, item.end);
  if (!first || !last) return '';
  const lastPi = last.piId === first.piId ? '' : `${last.piName} `;
  const runs = `Runs ${first.piName} ${first.shortLabel} → ${lastPi}${last.shortLabel}`;
  const startDay = toDay(item.start);
  const endDay = toDay(item.end);
  // A milestone is crossed when the item is running before it and still running on its day.
  const crossed = milestones
    .flatMap((milestone) =>
      milestone.kind === 'milestone' && milestone.date
        ? [{ name: milestone.name, day: toDay(milestone.date) }]
        : [],
    )
    .filter((milestone) => startDay < milestone.day && milestone.day <= endDay)
    .sort((a, b) => a.day - b.day);
  if (crossed.length === 0) return runs;
  return `${runs} · crosses ${crossed.map((milestone) => milestone.name).join(', ')}`;
}
