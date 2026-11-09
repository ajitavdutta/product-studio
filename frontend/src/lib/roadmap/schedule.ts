/**
 * Autosave ops for scheduling and hand edits on roadmap items (RM-11, RM-13). Pure.
 * Every hand edit also records the field in `editedFields`, so a re-sync keeps it (RM-15).
 */
import type { RoadmapDocument } from '../../api/useRoadmap';
import type { DocumentOp } from '../documentOps/applyOps';
import { addDays, allSprints, type Pi, type Sprint, toDay } from '../timeline';

type RoadmapItem = RoadmapDocument['items'][number];
export type EditableField = NonNullable<RoadmapItem['editedFields']>[number];

/** RFC 6901 escaping for one pointer segment. */
function segment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function itemPath(item: Pick<RoadmapItem, 'id'>, field: string): string {
  return `/items/${segment(item.id)}/${field}`;
}

/** The op that adds `fields` to the item's `editedFields`, or none when they are all there. */
function editedFieldsOps(item: RoadmapItem, fields: readonly EditableField[]): DocumentOp[] {
  const current = item.editedFields ?? [];
  const added = fields.filter(
    (field, index) => !current.includes(field) && fields.indexOf(field) === index,
  );
  if (added.length === 0) return [];
  return [{ op: 'set', path: itemPath(item, 'editedFields'), value: [...current, ...added] }];
}

/** The first sprint that starts after today, or null when the PIs run out. */
export function nextSprint(pis: readonly Pi[], today: string): Sprint | null {
  const todayDay = toDay(today);
  return allSprints(pis).find((sprint) => toDay(sprint.start) > todayDay) ?? null;
}

/** Schedule an item into one sprint: its start to its inclusive last day. */
export function scheduleOps(
  item: RoadmapItem,
  sprint: Pick<Sprint, 'start' | 'endExclusive'>,
): DocumentOp[] {
  return [
    { op: 'set', path: itemPath(item, 'start'), value: sprint.start },
    { op: 'set', path: itemPath(item, 'end'), value: addDays(sprint.endExclusive, -1) },
    ...editedFieldsOps(item, ['start', 'end']),
  ];
}

/** Move an item back to the tray by removing whichever dates it has. */
export function unscheduleOps(item: RoadmapItem): DocumentOp[] {
  const dated = (['start', 'end'] as const).filter((field) => item[field]);
  if (dated.length === 0) return [];
  return [
    ...dated.map((field): DocumentOp => ({ op: 'remove', path: itemPath(item, field) })),
    ...editedFieldsOps(item, ['start', 'end']),
  ];
}

/** Set one editable field by hand (every editable field holds a string). */
export function editOps(item: RoadmapItem, field: EditableField, value: string): DocumentOp[] {
  return [{ op: 'set', path: itemPath(item, field), value }, ...editedFieldsOps(item, [field])];
}
