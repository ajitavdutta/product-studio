/**
 * Milestones dialog logic (task 13, `RM-9-editor`): defaults, validation and autosave ops.
 * Pure: no React, no I/O. Validation messages match `backend/app/schemas/documents.py`.
 */
import type { RoadmapDocument } from '../../api/useRoadmap';
import type { DocumentOp } from '../documentOps/applyOps';
import { addDays, type Pi } from '../timeline';
import { nextSprint } from './schedule';

export type Milestone = RoadmapDocument['milestones'][number];
export type MilestoneKind = Milestone['kind'];
export type MilestoneField = 'name' | 'date' | 'start' | 'end';

export interface MilestoneProblem {
  field: MilestoneField;
  message: string;
}

/** Matches the backend's `MILESTONE_NAME_MAX_LENGTH`. */
export const MILESTONE_NAME_MAX_LENGTH = 120;
const DEFAULT_NAMES: Record<MilestoneKind, string> = {
  milestone: 'New milestone',
  freeze: 'Code freeze',
};
/**
 * Bounds for the dialog's date fields, matching the detail panel's. A browser date field
 * reports partial years (`0002-…`) while a year is typed, so only these count as finished.
 */
export const MILESTONE_DATE_MIN = '1900-01-01';
export const MILESTONE_DATE_MAX = '2999-12-31';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OUT_OF_RANGE_MESSAGE = 'Enter a date between 1900 and 2999';
const ID_PREFIX = 'ms-';
const FALLBACK_SLUG = 'milestone';
const DATE_FIELDS: Record<MilestoneKind, readonly ('date' | 'start' | 'end')[]> = {
  milestone: ['date'],
  freeze: ['start', 'end'],
};

/** RFC 6901 escaping for one pointer segment. */
function segment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function milestonePath(id: string, field?: string): string {
  const base = `/milestones/${segment(id)}`;
  return field ? `${base}/${field}` : base;
}

/** The date a milestone sorts by: its date, or a freeze's start. */
function sortDate(milestone: Milestone): string {
  return milestone.date ?? milestone.start ?? '';
}

/** Milestones in date order (freezes by their start); undated ones last. */
export function sortedMilestones(milestones: readonly Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => {
    const left = sortDate(a);
    const right = sortDate(b);
    if (!left || !right) return Number(!left) - Number(!right);
    return left.localeCompare(right);
  });
}

function uniqueId(name: string, takenIds: readonly string[]): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = `${ID_PREFIX}${slug || FALLBACK_SLUG}`;
  const taken = new Set(takenIds);
  let candidate = base;
  for (let suffix = 2; taken.has(candidate); suffix += 1) candidate = `${base}-${String(suffix)}`;
  return candidate;
}

/**
 * A valid new row. A milestone lands on the next sprint's start; a freeze spans the next
 * sprint. With no next sprint, both fall back to today.
 */
export function newMilestone(
  kind: MilestoneKind,
  pis: readonly Pi[],
  today: string,
  takenIds: readonly string[],
): Milestone {
  const name = DEFAULT_NAMES[kind];
  const id = uniqueId(name, takenIds);
  const sprint = nextSprint(pis, today);
  if (kind === 'milestone') return { id, name, kind, date: sprint?.start ?? today };
  return {
    id,
    name,
    kind,
    start: sprint?.start ?? today,
    end: sprint ? addDays(sprint.endExclusive, -1) : today,
  };
}

/** The same row as the other kind: a date becomes a one-day freeze, a freeze its start. */
export function withKind(milestone: Milestone, kind: MilestoneKind): Milestone {
  if (kind === milestone.kind) return milestone;
  const { id, name } = milestone;
  if (kind === 'milestone') return { id, name, kind, date: milestone.start ?? milestone.end };
  return { id, name, kind, start: milestone.date, end: milestone.date };
}

/** True for a complete ISO date inside the dialog's bounds. */
export function isFinishedDate(value: string): boolean {
  return ISO_DATE.test(value) && value >= MILESTONE_DATE_MIN && value <= MILESTONE_DATE_MAX;
}

function outOfRangeField(draft: Milestone): MilestoneField | null {
  const fields = DATE_FIELDS[draft.kind];
  return fields.find((field) => draft[field] && !isFinishedDate(draft[field])) ?? null;
}

/** The first problem with a row, worded like the server's 422, or null when it is valid. */
export function validateMilestone(draft: Milestone): MilestoneProblem | null {
  if (!draft.name.trim()) return { field: 'name', message: 'Give the milestone a name' };
  const unfinished = outOfRangeField(draft);
  if (unfinished) return { field: unfinished, message: OUT_OF_RANGE_MESSAGE };
  if (draft.kind === 'milestone') {
    return draft.date ? null : { field: 'date', message: `Milestone “${draft.name}” needs a date` };
  }
  if (!draft.start || !draft.end) {
    return {
      field: draft.start ? 'end' : 'start',
      message: `Freeze “${draft.name}” needs a start and an end date`,
    };
  }
  if (draft.end < draft.start) {
    return { field: 'end', message: `Freeze “${draft.name}” ends before it starts` };
  }
  return null;
}

/**
 * Ops that turn `before` into `after` for one row. A kind change is a single batch:
 * set the kind, remove the old date fields, set the new ones, so the saved row is never
 * both a milestone and a freeze.
 */
export function milestoneOps(before: Milestone, after: Milestone): DocumentOp[] {
  const id = before.id;
  const ops: DocumentOp[] = [];
  if (after.name !== before.name) {
    ops.push({ op: 'set', path: milestonePath(id, 'name'), value: after.name });
  }
  if (after.kind !== before.kind) {
    ops.push({ op: 'set', path: milestonePath(id, 'kind'), value: after.kind });
  }
  const oldFields = DATE_FIELDS[before.kind];
  const newFields = DATE_FIELDS[after.kind];
  for (const field of oldFields) {
    if (!newFields.includes(field) && before[field] !== undefined) {
      ops.push({ op: 'remove', path: milestonePath(id, field) });
    }
  }
  for (const field of newFields) {
    const value = after[field];
    if (value && value !== before[field]) {
      ops.push({ op: 'set', path: milestonePath(id, field), value });
    }
  }
  return ops;
}

export function insertMilestoneOp(milestone: Milestone): DocumentOp {
  return { op: 'insert', path: '/milestones', value: milestone };
}

export function removeMilestoneOp(milestone: Pick<Milestone, 'id'>): DocumentOp {
  return { op: 'remove', path: milestonePath(milestone.id) };
}
