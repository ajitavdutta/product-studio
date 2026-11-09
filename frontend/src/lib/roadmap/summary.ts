/**
 * Summary-card figures for the roadmap editor (RM-2). Pure: no React, no clock.
 * Item progress is stored by the importer and is never recomputed here.
 */
import type { RoadmapDocument } from '../../api/useRoadmap';
import { currentSprint, fullRangeLabel, type Pi, toDay } from '../timeline';

type RoadmapItem = RoadmapDocument['items'][number];
type Milestone = RoadmapDocument['milestones'][number];

/** The status id the importer gives at-risk work. */
export const AT_RISK_STATUS_ID = 'at-risk';
const PERCENT = 100;

/**
 * Round to the nearest integer, ties to even, like Python's `round()`.
 * The backend stores progress with that rule, so derived percentages must agree.
 */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  // Float noise (e.g. 2.4999999) must not decide a tie.
  const EPSILON = 1e-9;
  if (Math.abs(diff - 0.5) < EPSILON) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(value);
}

/** Issues done %: each item's stored progress weighted by its issue count; 0 with no issues. */
export function issuesDonePercent(items: readonly RoadmapItem[]): number {
  const totalIssues = items.reduce((sum, item) => sum + item.issues.total, 0);
  if (totalIssues === 0) return 0;
  const weighted = items.reduce((sum, item) => sum + item.progress * item.issues.total, 0);
  return roundHalfEven(weighted / totalIssues);
}

/** Items whose status is At risk, in document order. */
export function atRisk(items: readonly RoadmapItem[]): RoadmapItem[] {
  return items.filter((item) => item.statusId === AT_RISK_STATUS_ID);
}

/** Items without both a start and an end date (they sit in the tray). */
export function unscheduled(items: readonly RoadmapItem[]): RoadmapItem[] {
  return items.filter((item) => !item.start || !item.end);
}

export interface NextMilestone {
  name: string;
  date: string;
  daysToGo: number;
}

/** The earliest milestone (not freeze window) on or after today, or null. */
export function nextMilestone(
  milestones: readonly Milestone[],
  today: string,
): NextMilestone | null {
  const todayDay = toDay(today);
  const upcoming = milestones
    .flatMap((milestone) =>
      milestone.kind === 'milestone' && milestone.date
        ? [
            {
              name: milestone.name,
              date: milestone.date,
              daysToGo: toDay(milestone.date) - todayDay,
            },
          ]
        : [],
    )
    .filter((milestone) => milestone.daysToGo >= 0)
    .sort((a, b) => a.daysToGo - b.daysToGo);
  return upcoming[0] ?? null;
}

export interface CurrentSprintSummary {
  /** `PI 4 · 2026 · S3` */
  label: string;
  /** `2 Nov – 15 Nov` */
  dates: string;
  /** Days after today until the sprint ends. */
  daysLeft: number;
  /** Share of the sprint elapsed, counting today. */
  percent: number;
}

/** The current sprint card, or null when today is outside every PI. */
export function currentSprintSummary(
  pis: readonly Pi[],
  today: string,
): CurrentSprintSummary | null {
  const sprint = currentSprint(pis, today);
  if (!sprint) return null;
  const start = toDay(sprint.start);
  const end = toDay(sprint.endExclusive);
  const todayDay = toDay(today);
  return {
    label: `${sprint.piName} · ${sprint.label}`,
    dates: fullRangeLabel(sprint.start, sprint.endExclusive),
    daysLeft: end - todayDay - 1,
    percent: roundHalfEven(((todayDay - start + 1) / (end - start)) * PERCENT),
  };
}
