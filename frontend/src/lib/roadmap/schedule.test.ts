import { describe, expect, it } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import type { RoadmapDocument } from '../../api/useRoadmap';
import { applyOps } from '../documentOps/applyOps';
import { programIncrements } from '../timeline';
import { editOps, nextSprint, scheduleOps, unscheduleOps } from './schedule';

const DOCUMENT = example as RoadmapDocument;
const PIS = programIncrements(DOCUMENT.timeline.pis, DOCUMENT.timeline.sprintLengthDays);

function item(key: string) {
  const found = DOCUMENT.items.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`example has no ${key}`);
  return found;
}

function itemAfter(ops: Parameters<typeof applyOps>[1], key: string) {
  return applyOps(DOCUMENT, ops).items.find((candidate) => candidate.key === key);
}

describe('nextSprint', () => {
  it('RM-11 is the first sprint starting after today', () => {
    expect(nextSprint(PIS, '2026-11-06')).toMatchObject({
      piName: 'PI 4 · 2026',
      label: 'S4',
      start: '2026-11-16',
    });
  });

  it('RM-11 skips a sprint starting today', () => {
    expect(nextSprint(PIS, '2026-11-16')?.start).toBe('2026-11-30');
  });

  it('RM-11 is null when the PIs run out', () => {
    expect(nextSprint(PIS, '2027-06-01')).toBeNull();
  });
});

describe('scheduleOps', () => {
  it('RM-11 schedules an unscheduled item into one sprint and records the edit', () => {
    const sprint = nextSprint(PIS, '2026-11-06');
    if (!sprint) throw new Error('no next sprint');

    expect(itemAfter(scheduleOps(item('PAY-170'), sprint), 'PAY-170')).toMatchObject({
      start: '2026-11-16',
      end: '2026-11-29',
      editedFields: ['start', 'end'],
    });
  });
});

describe('unscheduleOps', () => {
  it('RM-11 removes both dates and records the edit', () => {
    const after = itemAfter(unscheduleOps(item('PAY-142')), 'PAY-142');

    expect([after?.start, after?.end, after?.editedFields]).toEqual([
      undefined,
      undefined,
      ['start', 'end'],
    ]);
  });

  it('RM-11 does nothing for an item that is already unscheduled', () => {
    expect(unscheduleOps(item('PAY-170'))).toEqual([]);
  });
});

describe('editOps', () => {
  it('RM-13 sets the field and adds it to editedFields', () => {
    expect(editOps(item('PAY-142'), 'start', '2026-11-23')).toEqual([
      { op: 'set', path: '/items/it-pay-142/start', value: '2026-11-23' },
      { op: 'set', path: '/items/it-pay-142/editedFields', value: ['start'] },
    ]);
  });

  it('RM-13 does not repeat a field already in editedFields', () => {
    const edited = { ...item('PAY-142'), editedFields: ['statusId' as const] };

    expect(editOps(edited, 'statusId', 'done')).toEqual([
      { op: 'set', path: '/items/it-pay-142/statusId', value: 'done' },
    ]);
  });

  it('RM-13 keeps existing edited fields when adding one', () => {
    const edited = { ...item('PAY-142'), editedFields: ['title' as const] };

    expect(editOps(edited, 'laneId', 'platform')[1]).toEqual({
      op: 'set',
      path: '/items/it-pay-142/editedFields',
      value: ['title', 'laneId'],
    });
  });

  it('RM-13 escapes ids that contain a slash', () => {
    const odd = { ...item('PAY-142'), id: 'a/b~c' };

    expect(editOps(odd, 'title', 'X')[0]?.path).toBe('/items/a~1b~0c/title');
  });
});
