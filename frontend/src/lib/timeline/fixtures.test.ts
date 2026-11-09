import { describe, expect, it } from 'vitest';
import monthsFixture from '../../../../docs/fixtures/timeline/months.json';
import pisFixture from '../../../../docs/fixtures/timeline/pis.json';
import sprintsFixture from '../../../../docs/fixtures/timeline/sprints.json';
import { type PiInput, programIncrements } from './cadence';
import { addDays, toDay } from './dates';
import { sprintDateLabel } from './labels';
import { boundaries, type Column, columns, type TimelineView } from './scale';

interface FixturePi {
  name: string;
  start: string;
  /** Inclusive last day of the PI. */
  end: string;
  sprints: number;
  ipSprint: boolean;
}

interface Fixture {
  today: string;
  view: string;
  range: { start: string; endExclusive: string };
  pis: FixturePi[];
  columns: Record<string, unknown>[];
  boundaries: { date: string; strong: boolean }[];
}

function sprintLength(pi: FixturePi): number {
  return (toDay(addDays(pi.end, 1)) - toDay(pi.start)) / pi.sprints;
}

function load(fixture: Fixture) {
  const first = fixture.pis[0];
  if (!first) throw new Error('fixture has no PIs');
  const inputs: PiInput[] = fixture.pis.map(({ name, start, sprints, ipSprint }) => ({
    name,
    start,
    sprints,
    ipSprint,
  }));
  return {
    pis: programIncrements(inputs, sprintLength(first)),
    view: fixture.view as TimelineView,
  };
}

/** Fixture columns omit `current`, `ip` and `clipped` when false, and leave out absent keys. */
function normalise(column: Record<string, unknown> | Column): Record<string, unknown> {
  const {
    current = false,
    ip = false,
    clipped = false,
    ...rest
  } = column as Record<string, unknown>;
  const defined = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  return { ...defined, current, ip, clipped };
}

function columnsMatch(fixture: Fixture) {
  const { pis, view } = load(fixture);
  return {
    actual: columns(view, fixture.range, pis, fixture.today).map(normalise),
    expected: fixture.columns.map(normalise),
  };
}

describe('timeline fixtures (ADR-3)', () => {
  it('RM-5 sprint columns match the fixture', () => {
    const { actual, expected } = columnsMatch(sprintsFixture);

    expect(actual).toEqual(expected);
  });

  it('RM-5 compact dates match the fixture', () => {
    // The fixture names the sprint in prose; S3 and S5 are the two sprints it covers.
    const sprintFor = (name: string) =>
      name.startsWith('PI 4 · 2026 S5')
        ? ['2026-11-30', '2026-12-14']
        : ['2026-11-02', '2026-11-16'];
    const actual = sprintsFixture.compactDates.map(({ colW, sprint }) => {
      const [start = '', end = ''] = sprintFor(sprint);
      return { colW, label: sprintDateLabel(start, end, colW) };
    });

    expect(actual).toEqual(sprintsFixture.compactDates.map(({ colW, label }) => ({ colW, label })));
  });

  it('RM-6 month columns match the fixture', () => {
    const { actual, expected } = columnsMatch(monthsFixture);

    expect(actual).toEqual(expected);
  });

  it('RM-7 PI columns and ticks match the fixture', () => {
    const { actual, expected } = columnsMatch(pisFixture);

    expect(actual).toEqual(expected);
  });

  it.each([
    ['sprints', sprintsFixture],
    ['months', monthsFixture],
    ['pis', pisFixture],
  ] as const)('RM-4 %s boundaries match the fixture (order-insensitive)', (_name, fixture) => {
    const { pis, view } = load(fixture);
    const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

    expect([...boundaries(view, fixture.range, pis)].sort(byDate)).toEqual(
      [...fixture.boundaries].sort(byDate),
    );
  });
});
