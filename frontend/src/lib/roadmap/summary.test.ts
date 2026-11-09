import { describe, expect, it } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import type { RoadmapDocument } from '../../api/useRoadmap';
import { programIncrements } from '../timeline';
import {
  atRisk,
  currentSprintSummary,
  issuesDonePercent,
  nextMilestone,
  roundHalfEven,
  unscheduled,
} from './summary';

const DOCUMENT = example as RoadmapDocument;
const TODAY = '2026-11-06';
const PIS = programIncrements(DOCUMENT.timeline.pis, DOCUMENT.timeline.sprintLengthDays);
const ITEM = DOCUMENT.items[0];
if (!ITEM) throw new Error('example has no items');

describe('roundHalfEven', () => {
  it('RM-2 rounds ties to even like Python', () => {
    expect([0.5, 1.5, 2.5, 3.5, -1.5].map(roundHalfEven)).toEqual([0, 2, 2, 4, -2]);
  });

  it('RM-2 rounds non-ties to nearest', () => {
    expect([27.96, 2.49, 2.51].map(roundHalfEven)).toEqual([28, 2, 3]);
  });
});

describe('summary cards', () => {
  it('RM-2 Issues done is weighted by issue count from stored progress', () => {
    expect(issuesDonePercent(DOCUMENT.items)).toBe(28);
  });

  it('RM-2 Issues done is 0 when there are no issues', () => {
    expect(issuesDonePercent([{ ...ITEM, issues: { total: 0, done: 0, inProgress: 0 } }])).toBe(0);
  });

  it('RM-2 Issues done uses half-to-even on a tie', () => {
    // (1 × 1 + 2 × 1) / 2 = 1.5, so the tie goes to 2; (3 + 2) / 2 = 2.5 goes to 2 as well.
    const items = [1, 2].map((progress) => ({
      ...ITEM,
      progress,
      issues: { total: 1, done: 0, inProgress: 0 },
    }));
    const tieDown = [3, 2].map((progress) => ({
      ...ITEM,
      progress,
      issues: { total: 1, done: 0, inProgress: 0 },
    }));

    expect([issuesDonePercent(items), issuesDonePercent(tieDown)]).toEqual([2, 2]);
  });

  it('RM-2 At risk lists the at-risk epics', () => {
    expect(atRisk(DOCUMENT.items).map((item) => item.key)).toEqual(['RSK-031', 'MX-070']);
  });

  it('RM-2 Unscheduled counts items without both dates', () => {
    expect(unscheduled(DOCUMENT.items)).toHaveLength(5);
  });

  it('RM-2 next milestone is Beta launch in 70 days', () => {
    expect(nextMilestone(DOCUMENT.milestones, TODAY)).toEqual({
      name: 'Beta launch',
      date: '2027-01-15',
      daysToGo: 70,
    });
  });

  it('RM-2 next milestone skips past ones and freeze windows', () => {
    expect(nextMilestone(DOCUMENT.milestones, '2027-03-01')?.name).toBe(
      'General availability (GA)',
    );
  });

  it('RM-2 next milestone is null when none is ahead', () => {
    expect(nextMilestone(DOCUMENT.milestones, '2027-12-01')).toBeNull();
  });

  it('RM-2 current sprint is PI 4 · 2026 · S3 with 9 days left at 36%', () => {
    expect(currentSprintSummary(PIS, TODAY)).toEqual({
      label: 'PI 4 · 2026 · S3',
      dates: '2 Nov – 15 Nov',
      daysLeft: 9,
      percent: 36,
    });
  });

  it('RM-2 current sprint is null outside every PI', () => {
    expect(currentSprintSummary(PIS, '2030-01-01')).toBeNull();
  });
});
