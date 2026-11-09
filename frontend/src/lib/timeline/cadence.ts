/** PI cadence: program increments split into fixed-length sprints (RM-4). */
import type { components } from '../../api/types';
import { addDays, toDay } from './dates';

type ProgramIncrement = components['schemas']['ProgramIncrement'];

/** The PI fields the cadence needs; `id` is optional so plain fixtures fit. */
export type PiInput = Pick<ProgramIncrement, 'name' | 'start' | 'sprints' | 'ipSprint'> & {
  id?: string;
  sprintNames?: string[] | null;
};

export interface Sprint {
  /** 0-based index inside its PI. */
  index: number;
  /** Header label: `S3`, `S6 · IP` or a custom sprint name. */
  label: string;
  /** PI-view tick label: `IP` for the IP sprint, otherwise the base name. */
  tickLabel: string;
  /** Name without the IP suffix: `S6` or the custom name. */
  shortLabel: string;
  start: string;
  endExclusive: string;
  ip: boolean;
  /** First sprint of its PI (draws a stronger column line). */
  first: boolean;
  piId: string;
  piName: string;
}

export interface Pi {
  id: string;
  name: string;
  start: string;
  endExclusive: string;
  sprints: Sprint[];
}

const IP_SUFFIX = ' · IP';
const IP_TICK = 'IP';

/** Expand PIs into sprints, sorted by start. Sprint `j` starts at `start + j * len`. */
export function programIncrements(pis: readonly PiInput[], sprintLengthDays: number): Pi[] {
  const sorted = [...pis].sort((a, b) => toDay(a.start) - toDay(b.start));
  return sorted.map((pi) => {
    const id = pi.id ?? pi.name;
    const sprints: Sprint[] = Array.from({ length: pi.sprints }, (_, index) => {
      const shortLabel = pi.sprintNames?.[index] ?? `S${String(index + 1)}`;
      const ip = pi.ipSprint && index === pi.sprints - 1;
      return {
        index,
        label: ip ? shortLabel + IP_SUFFIX : shortLabel,
        tickLabel: ip ? IP_TICK : shortLabel,
        shortLabel,
        start: addDays(pi.start, index * sprintLengthDays),
        endExclusive: addDays(pi.start, (index + 1) * sprintLengthDays),
        ip,
        first: index === 0,
        piId: id,
        piName: pi.name,
      };
    });
    return {
      id,
      name: pi.name,
      start: pi.start,
      endExclusive: addDays(pi.start, pi.sprints * sprintLengthDays),
      sprints,
    };
  });
}

/** Every sprint of every PI, in date order. */
export function allSprints(pis: readonly Pi[]): Sprint[] {
  return pis.flatMap((pi) => pi.sprints);
}

/** The sprint whose `[start, endExclusive)` contains `date`, or null. */
export function sprintAt(pis: readonly Pi[], date: string): Sprint | null {
  const day = toDay(date);
  return (
    allSprints(pis).find(
      (sprint) => toDay(sprint.start) <= day && day < toDay(sprint.endExclusive),
    ) ?? null
  );
}

/** The sprint containing today, or null when today is outside every PI. */
export function currentSprint(pis: readonly Pi[], today: string): Sprint | null {
  return sprintAt(pis, today);
}
