/**
 * The timeline's row list: team headers and epic rows in display order (RM-3). Pure.
 * Only scheduled items get a row; unscheduled ones live in the tray (RM-11).
 */
import type { RoadmapDocument } from '../../api/useRoadmap';

type RoadmapItem = RoadmapDocument['items'][number];
type RoadmapLane = RoadmapDocument['lanes'][number];

/** `team`: a header per lane with its epics under it. `epic`: one flat list by start date. */
export type RowGrouping = 'team' | 'epic';

export type TimelineRow =
  { kind: 'team'; lane: RoadmapLane; epicCount: number } | { kind: 'epic'; item: RoadmapItem };

function isScheduled(item: RoadmapItem): boolean {
  return Boolean(item.start && item.end);
}

function byPosition(a: { position: number }, b: { position: number }): number {
  return a.position - b.position;
}

/** ISO dates sort as strings; ties keep the user's order. */
function byStart(a: RoadmapItem, b: RoadmapItem): number {
  const start = (a.start ?? '').localeCompare(b.start ?? '');
  return start !== 0 ? start : byPosition(a, b);
}

/**
 * Rows for the timeline body.
 * - `team`: lanes by `position`, each followed by its scheduled items by `position`. A lane with no
 *   scheduled items still gets its header (count 0).
 * - `epic`: every scheduled item, sorted by start date, with no headers.
 */
export function timelineRows(
  lanes: readonly RoadmapLane[],
  items: readonly RoadmapItem[],
  grouping: RowGrouping,
): TimelineRow[] {
  const scheduled = items.filter(isScheduled);
  if (grouping === 'epic') {
    return [...scheduled].sort(byStart).map((item) => ({ kind: 'epic', item }));
  }
  return [...lanes].sort(byPosition).flatMap((lane): TimelineRow[] => {
    const laneItems = scheduled.filter((item) => item.laneId === lane.id).sort(byPosition);
    return [
      { kind: 'team', lane, epicCount: laneItems.length },
      ...laneItems.map((item): TimelineRow => ({ kind: 'epic', item })),
    ];
  });
}
