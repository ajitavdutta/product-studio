import { describe, expect, it } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import type { RoadmapDocument } from '../../api/useRoadmap';
import { applyOps } from '../documentOps/applyOps';
import { programIncrements } from '../timeline';
import {
  insertMilestoneOp,
  type Milestone,
  milestoneOps,
  newMilestone,
  removeMilestoneOp,
  sortedMilestones,
  validateMilestone,
  withKind,
} from './milestones';

const DOCUMENT = example as RoadmapDocument;
const PIS = programIncrements(DOCUMENT.timeline.pis, DOCUMENT.timeline.sprintLengthDays);
const TODAY = '2026-11-06';
const BETA: Milestone = {
  id: 'ms-beta',
  name: 'Beta launch',
  kind: 'milestone',
  date: '2027-01-15',
};
const FREEZE: Milestone = {
  id: 'ms-freeze',
  name: 'Code freeze',
  kind: 'freeze',
  start: '2027-03-15',
  end: '2027-03-31',
};

describe('sortedMilestones', () => {
  it('RM-9-editor orders by date, freezes by their start', () => {
    expect(sortedMilestones(DOCUMENT.milestones).map(({ id }) => id)).toEqual([
      'ms-beta',
      'ms-freeze',
      'ms-ga',
    ]);
  });
});

describe('newMilestone', () => {
  it('RM-9-editor a milestone defaults to the next sprint start', () => {
    expect(newMilestone('milestone', PIS, TODAY, [])).toEqual({
      id: 'ms-new-milestone',
      name: 'New milestone',
      kind: 'milestone',
      date: '2026-11-16',
    });
  });

  it('RM-9-editor a freeze defaults to the next sprint, start to inclusive end', () => {
    expect(newMilestone('freeze', PIS, TODAY, [])).toEqual({
      id: 'ms-code-freeze',
      name: 'Code freeze',
      kind: 'freeze',
      start: '2026-11-16',
      end: '2026-11-29',
    });
  });

  it('RM-9-editor falls back to today when the PIs run out', () => {
    expect(newMilestone('freeze', PIS, '2027-09-01', [])).toMatchObject({
      start: '2027-09-01',
      end: '2027-09-01',
    });
  });

  it('RM-9-editor makes the id unique with a numeric suffix', () => {
    expect(
      newMilestone('milestone', PIS, TODAY, ['ms-new-milestone', 'ms-new-milestone-2']).id,
    ).toBe('ms-new-milestone-3');
  });
});

describe('validateMilestone', () => {
  it('RM-9-editor accepts a valid milestone and freeze', () => {
    expect([validateMilestone(BETA), validateMilestone(FREEZE)]).toEqual([null, null]);
  });

  it('RM-9-editor a blank name is rejected', () => {
    expect(validateMilestone({ ...BETA, name: '   ' })).toEqual({
      field: 'name',
      message: 'Give the milestone a name',
    });
  });

  it('RM-9-editor a milestone needs a date', () => {
    expect(validateMilestone({ ...BETA, date: undefined })?.message).toBe(
      'Milestone “Beta launch” needs a date',
    );
  });

  it('RM-9-editor a freeze needs a start and an end', () => {
    expect(validateMilestone({ ...FREEZE, end: undefined })).toEqual({
      field: 'end',
      message: 'Freeze “Code freeze” needs a start and an end date',
    });
  });

  it('RM-9-editor a partly typed or out-of-range year is invalid', () => {
    expect(validateMilestone({ ...BETA, date: '0007-11-01' })).toEqual({
      field: 'date',
      message: 'Enter a date between 1900 and 2999',
    });
  });

  it('RM-9-editor an out-of-range freeze end is flagged on the end field', () => {
    expect(validateMilestone({ ...FREEZE, end: '3001-01-01' })?.field).toBe('end');
  });

  it('RM-9-editor a freeze cannot end before it starts', () => {
    expect(validateMilestone({ ...FREEZE, end: '2027-03-01' })).toEqual({
      field: 'end',
      message: 'Freeze “Code freeze” ends before it starts',
    });
  });
});

describe('milestoneOps', () => {
  it('RM-9-editor a rename sets only the name', () => {
    expect(milestoneOps(BETA, { ...BETA, name: 'Pilot' })).toEqual([
      { op: 'set', path: '/milestones/ms-beta/name', value: 'Pilot' },
    ]);
  });

  it('RM-9-editor a kind change sets the kind, removes the date and sets the range', () => {
    expect(milestoneOps(BETA, withKind(BETA, 'freeze'))).toEqual([
      { op: 'set', path: '/milestones/ms-beta/kind', value: 'freeze' },
      { op: 'remove', path: '/milestones/ms-beta/date' },
      { op: 'set', path: '/milestones/ms-beta/start', value: '2027-01-15' },
      { op: 'set', path: '/milestones/ms-beta/end', value: '2027-01-15' },
    ]);
  });

  it('RM-9-editor a freeze switched back to a milestone leaves no range behind', () => {
    const document = applyOps(DOCUMENT, milestoneOps(FREEZE, withKind(FREEZE, 'milestone')));

    expect(document.milestones.find(({ id }) => id === 'ms-freeze')).toEqual({
      id: 'ms-freeze',
      name: 'Code freeze',
      kind: 'milestone',
      date: '2027-03-15',
    });
  });

  it('RM-9-editor escapes ids in the pointer', () => {
    expect(removeMilestoneOp({ id: 'ms-a/b~c' }).path).toBe('/milestones/ms-a~1b~0c');
  });

  it('RM-9-editor insert appends to the milestones list', () => {
    const added = newMilestone('milestone', PIS, TODAY, []);

    expect(applyOps(DOCUMENT, [insertMilestoneOp(added)]).milestones.at(-1)).toEqual(added);
  });
});
