import { describe, expect, it } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import monthsFixture from '../../../../docs/fixtures/timeline/months.json';
import pisFixture from '../../../../docs/fixtures/timeline/pis.json';
import sprintsFixture from '../../../../docs/fixtures/timeline/sprints.json';
import { programIncrements } from './cadence';
import { toDay } from './dates';
import {
  boundaries,
  columns,
  defaultRange,
  fraction,
  leftCss,
  sprintColumnWidth,
  timelineWidth,
  widthCss,
} from './scale';

const TIMELINE = example.timeline;
const PIS = programIncrements(TIMELINE.pis, TIMELINE.sprintLengthDays);

describe('defaultRange', () => {
  it.each([
    ['sprints', sprintsFixture.range],
    ['months', monthsFixture.range],
    ['pis', pisFixture.range],
  ] as const)(
    'RM-4 %s range from roadmap.example.json equals the fixture range',
    (view, expected) => {
      expect(defaultRange(view, TIMELINE, example.items)).toEqual(expected);
    },
  );

  it('RM-6 months show only the timeline start month when nothing is scheduled', () => {
    expect(defaultRange('months', TIMELINE, [])).toEqual({
      start: '2026-11-01',
      endExclusive: '2026-12-01',
    });
  });

  it('RM-6 an item with only a start is not scheduled', () => {
    expect(defaultRange('months', TIMELINE, [{ start: '2027-09-01', end: null }])).toEqual({
      start: '2026-11-01',
      endExclusive: '2026-12-01',
    });
  });

  it('RM-7 PI view shows every PI when no item overlaps a PI', () => {
    expect(defaultRange('pis', TIMELINE, [{ start: '2030-01-01', end: '2030-02-01' }])).toEqual({
      start: '2026-10-05',
      endExclusive: '2027-06-14',
    });
  });

  it('RM-7 PI view without PIs falls back to the months range', () => {
    expect(defaultRange('pis', { ...TIMELINE, pis: [] }, example.items)).toEqual(
      monthsFixture.range,
    );
  });

  it('RM-5 sprint view stops when the PIs run out', () => {
    const shortTimeline = { ...TIMELINE, pis: TIMELINE.pis.slice(0, 1) };

    expect(defaultRange('sprints', shortTimeline, example.items)).toEqual({
      start: '2026-11-02',
      endExclusive: '2026-12-28',
    });
  });

  it('RM-5 sprint view with no sprint after the start shows 13 sprint lengths from the start', () => {
    expect(defaultRange('sprints', { ...TIMELINE, pis: [] }, example.items)).toEqual({
      start: '2026-11-01',
      endExclusive: '2027-05-02',
    });
  });
});

describe('columns', () => {
  it('RM-5 marks no sprint current when today is outside every PI', () => {
    const cells = columns('sprints', sprintsFixture.range, PIS, '2030-01-01');

    expect(cells.some((cell) => cell.current)).toBe(false);
  });

  it('RM-6 clips a month cut by the range', () => {
    const [first] = columns(
      'months',
      { start: '2026-11-16', endExclusive: '2027-01-01' },
      PIS,
      '2026-11-06',
    );

    expect(first).toMatchObject({ label: 'Nov 2026', start: '2026-11-16', clipped: true });
  });

  it('RM-5 clips a sprint cut by an unaligned range', () => {
    const [, firstSprint] = columns(
      'sprints',
      { start: '2026-11-09', endExclusive: '2026-11-30' },
      PIS,
      '2026-11-06',
    );

    expect(firstSprint).toMatchObject({
      label: 'S3',
      start: '2026-11-09',
      clipped: true,
      dates: '2 Nov – 15 Nov',
    });
  });
});

describe('boundaries', () => {
  it('RM-4 a gap after a PI makes its end a strong edge', () => {
    const gapped = programIncrements(
      [
        { name: 'PI A', start: '2027-01-04', sprints: 2, ipSprint: false },
        { name: 'PI B', start: '2027-02-15', sprints: 2, ipSprint: false },
      ],
      14,
    );

    expect(
      boundaries('sprints', { start: '2027-01-04', endExclusive: '2027-03-15' }, gapped),
    ).toEqual([
      { date: '2027-01-18', strong: false },
      { date: '2027-02-01', strong: true },
      { date: '2027-02-15', strong: true },
      { date: '2027-03-01', strong: false },
    ]);
  });
});

describe('positions', () => {
  const range = sprintsFixture.range;

  it('RM-8 fraction clamps outside the range', () => {
    expect([fraction(range, toDay('2026-01-01')), fraction(range, toDay('2030-01-01'))]).toEqual([
      0, 1,
    ]);
  });

  it('RM-8 leftCss offsets from the label column', () => {
    expect(leftCss(range, toDay('2026-11-16'), 2)).toBe(
      'calc(220px + (100% - 220px) * 0.076923 + 2px)',
    );
  });

  it('RM-8 widthCss insets the bar', () => {
    expect(widthCss(range, toDay('2026-11-02'), toDay('2026-11-16'), -4)).toBe(
      'calc((100% - 220px) * 0.076923 - 4px)',
    );
  });

  it('RM-20 timeline width grows with zoom above the minimum', () => {
    expect(timelineWidth(1120, 'months', 2)).toBe(220 + 900 * 2);
  });

  it('RM-5 colW is 104 at 100% in a 1120px container', () => {
    expect(sprintColumnWidth(1120, 'sprints', 1, range, 14)).toBe(104);
  });
});
