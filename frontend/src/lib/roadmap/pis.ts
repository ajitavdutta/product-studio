/**
 * Manage PIs (RM-4): validate edited program increments, add one, and build the save op. Pure.
 * The overlap rule mirrors `_check_pis_do_not_overlap` in backend/app/schemas/documents.py.
 */
import type { components } from '../../api/types';
import type { DocumentOp } from '../documentOps/applyOps';
import { addDays, toDay } from '../timeline';

export type ProgramIncrement = components['schemas']['ProgramIncrement'];
type PiCadence = components['schemas']['PiCadence'];

export const PI_SPRINTS_MIN = 1;
export const PI_SPRINTS_MAX = 12;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PI_ID_PREFIX = 'pi-';
const PIS_PATH = '/timeline/pis';

export type PiField = 'name' | 'start' | 'sprints';

/** One problem on one row of the dialog; `index` is the row in the order given. */
export interface PiProblem {
  index: number;
  field: PiField;
  message: string;
}

function hasValidSprints(pi: ProgramIncrement): boolean {
  return (
    Number.isInteger(pi.sprints) && pi.sprints >= PI_SPRINTS_MIN && pi.sprints <= PI_SPRINTS_MAX
  );
}

function hasValidStart(pi: ProgramIncrement): boolean {
  if (!ISO_DATE.test(pi.start)) return false;
  // `toDay` rolls an impossible date such as 2027-02-30 over, so the round trip catches it.
  return addDays(pi.start, 0) === pi.start;
}

/** Whether the PI has a real start date and 1–12 sprints, so it can be drawn and compared. */
export function isDatablePi(pi: ProgramIncrement): boolean {
  return hasValidStart(pi) && hasValidSprints(pi);
}

/** The first day after the PI's last sprint. */
export function piEndExclusive(pi: ProgramIncrement, sprintLengthDays: number): string {
  return addDays(pi.start, pi.sprints * sprintLengthDays);
}

/**
 * Every problem that blocks Save: a blank name, a missing date, a sprint count outside 1–12,
 * and a PI that starts before the previous one (by start date) ends. Gaps are allowed.
 */
export function piProblems(
  pis: readonly ProgramIncrement[],
  sprintLengthDays: number,
): PiProblem[] {
  const problems: PiProblem[] = [];
  pis.forEach((pi, index) => {
    if (pi.name.trim() === '') problems.push({ index, field: 'name', message: 'Enter a name' });
    if (!hasValidStart(pi)) {
      problems.push({ index, field: 'start', message: 'Enter a start date' });
    }
    if (!hasValidSprints(pi)) {
      problems.push({
        index,
        field: 'sprints',
        message: `Use ${String(PI_SPRINTS_MIN)}–${String(PI_SPRINTS_MAX)} sprints`,
      });
    }
  });
  const ordered = pis
    .map((pi, index) => ({ pi, index }))
    .filter(({ pi }) => isDatablePi(pi))
    .sort((a, b) => toDay(a.pi.start) - toDay(b.pi.start));
  for (let position = 1; position < ordered.length; position += 1) {
    const previous = ordered[position - 1];
    const current = ordered[position];
    if (!previous || !current) continue;
    if (toDay(current.pi.start) < toDay(piEndExclusive(previous.pi, sprintLengthDays))) {
      problems.push({
        index: current.index,
        field: 'start',
        message: `${current.pi.name} starts before ${previous.pi.name} ends`,
      });
    }
  }
  return problems;
}

function unusedId(pis: readonly ProgramIncrement[]): string {
  const taken = new Set(pis.map((pi) => pi.id));
  let number = pis.length + 1;
  while (taken.has(`${PI_ID_PREFIX}${String(number)}`)) number += 1;
  return `${PI_ID_PREFIX}${String(number)}`;
}

/**
 * A new PI right after the latest one ends (or on `fallbackStart` when there are none),
 * named "PI n", with the sprint count and IP setting from Settings.
 */
export function newPi(
  pis: readonly ProgramIncrement[],
  cadence: PiCadence,
  sprintLengthDays: number,
  fallbackStart: string,
): ProgramIncrement {
  const datable = pis.filter(isDatablePi);
  const ends = datable.map((pi) => piEndExclusive(pi, sprintLengthDays));
  const start = ends.reduce(
    (latest, end) => (end > latest ? end : latest),
    ends[0] ?? fallbackStart,
  );
  return {
    id: unusedId(pis),
    name: `PI ${String(pis.length + 1)}`,
    start,
    sprints: cadence.sprintsPerPi,
    ipSprint: cadence.ipSprint,
  };
}

/**
 * The single op that saves the dialog: `set /timeline/pis`, sorted by start, names trimmed.
 * Custom sprint names only fit the count they were written for, so a PI whose sprint count
 * changed loses them (ASSUMPTION 12).
 */
export function piSaveOps(
  original: readonly ProgramIncrement[],
  edited: readonly ProgramIncrement[],
): DocumentOp[] {
  const originalById = new Map(original.map((pi) => [pi.id, pi]));
  const value = [...edited]
    .sort((a, b) => toDay(a.start) - toDay(b.start))
    .map((pi) => {
      const { sprintNames, ...rest } = pi;
      const keepNames = sprintNames && originalById.get(pi.id)?.sprints === pi.sprints;
      return { ...rest, name: pi.name.trim(), ...(keepNames ? { sprintNames } : {}) };
    });
  return [{ op: 'set', path: PIS_PATH, value }];
}
