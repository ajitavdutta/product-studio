import { describe, expect, it } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import type { components } from '../../api/types';
import { programIncrements } from './cadence';
import {
  formatDayMonth,
  formatDayMonthYear,
  spanText,
  sprintDateLabel,
  sprintTooltip,
} from './labels';

type Milestone = components['schemas']['Milestone'];

const PIS = programIncrements(example.timeline.pis, example.timeline.sprintLengthDays);
const MILESTONES = example.milestones as Milestone[];

describe('spanText', () => {
  it('RM-13 names both PIs and the milestone an item crosses', () => {
    const item = { start: '2026-11-16', end: '2027-01-29' };

    expect(spanText(item, PIS, MILESTONES)).toBe(
      'Runs PI 4 · 2026 S4 → PI 1 · 2027 S3 · crosses Beta launch',
    );
  });

  it('RM-13 leaves out the second PI name and the crossing when there is none', () => {
    const item = { start: '2026-11-02', end: '2026-12-18' };

    expect(spanText(item, PIS, MILESTONES)).toBe('Runs PI 4 · 2026 S3 → S6');
  });

  it('RM-13 ignores freeze windows and a milestone on the start day', () => {
    const item = { start: '2027-01-15', end: '2027-03-20' };

    expect(spanText(item, PIS, MILESTONES)).toBe('Runs PI 1 · 2027 S2 → S6');
  });

  it('RM-13 is empty for an unscheduled item', () => {
    expect(spanText({ start: null, end: null }, PIS, MILESTONES)).toBe('');
  });

  it('RM-13 is empty when the item ends after the last PI', () => {
    expect(spanText({ start: '2027-05-01', end: '2027-07-01' }, PIS, MILESTONES)).toBe('');
  });
});

describe('labels', () => {
  it('RM-5 tooltip has the PI, sprint and full dates', () => {
    const pi = PIS[0];
    const sprint = pi?.sprints[2];
    if (!pi || !sprint) throw new Error('example PIs missing');

    expect(sprintTooltip(pi, sprint)).toBe('PI 4 · 2026 · S3 · 2 Nov – 15 Nov');
  });

  it('RM-4 IP sprint and custom sprint names', () => {
    const [pi] = programIncrements(
      [
        {
          name: 'PI 9',
          start: '2027-01-04',
          sprints: 3,
          ipSprint: true,
          sprintNames: ['Alpha', 'Bravo', 'Charlie'],
        },
      ],
      14,
    );

    expect(pi?.sprints.map((sprint) => [sprint.label, sprint.tickLabel])).toEqual([
      ['Alpha', 'Alpha'],
      ['Bravo', 'Bravo'],
      ['Charlie · IP', 'IP'],
    ]);
  });

  it('RM-5 compact label crosses a year boundary without spaces', () => {
    expect(sprintDateLabel('2026-12-28', '2027-01-11', 80)).toBe('28 Dec–10 Jan');
  });

  it('RM-9 formats day-month and day-month-year', () => {
    expect([formatDayMonth('2027-01-15'), formatDayMonthYear('2027-01-15')]).toEqual([
      '15 Jan',
      '15 Jan 2027',
    ]);
  });
});
