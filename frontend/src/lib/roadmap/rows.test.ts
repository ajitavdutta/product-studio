import { describe, expect, it } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import type { RoadmapDocument } from '../../api/useRoadmap';
import { timelineRows, type TimelineRow } from './rows';

const DOCUMENT = example as RoadmapDocument;

function describeRow(row: TimelineRow): string {
  return row.kind === 'team' ? `${row.lane.name} (${String(row.epicCount)})` : row.item.key;
}

describe('timelineRows', () => {
  it('RM-3 groups scheduled epics under their team by position', () => {
    const rows = timelineRows(DOCUMENT.lanes, DOCUMENT.items, 'team');

    expect(rows.map(describeRow)).toEqual([
      'Checkout (3)',
      'PAY-142',
      'PAY-155',
      'PAY-161',
      'Risk & Fraud (2)',
      'RSK-031',
      'RSK-036',
      'Platform (2)',
      'PLT-190',
      'PLT-208',
      'Merchant Experience (3)',
      'MX-070',
      'MX-077',
      'MX-081',
    ]);
  });

  it('RM-3 orders lanes and items by position, not array order', () => {
    const lanes = [...DOCUMENT.lanes].reverse();
    const items = [...DOCUMENT.items].reverse();

    const rows = timelineRows(lanes, items, 'team');

    expect(rows.slice(0, 4).map(describeRow)).toEqual([
      'Checkout (3)',
      'PAY-142',
      'PAY-155',
      'PAY-161',
    ]);
  });

  it('RM-3 keeps the header of a lane with no scheduled epics', () => {
    const items = DOCUMENT.items.filter((item) => item.laneId !== 'platform');

    const rows = timelineRows(DOCUMENT.lanes, items, 'team');

    expect(rows.map(describeRow)).toContain('Platform (0)');
  });

  it('RM-1 epic grouping is one flat list by start date with no headers', () => {
    const rows = timelineRows(DOCUMENT.lanes, DOCUMENT.items, 'epic');

    expect(rows.map(describeRow)).toEqual([
      'PLT-190',
      'MX-070',
      'RSK-031',
      'PAY-142',
      'PAY-155',
      'RSK-036',
      'PLT-208',
      'PAY-161',
      'MX-077',
      'MX-081',
    ]);
  });

  it('RM-11 leaves unscheduled items out of the rows', () => {
    const rows = timelineRows(DOCUMENT.lanes, DOCUMENT.items, 'epic');

    expect(rows.map(describeRow)).not.toContain('PAY-170');
  });

  it('RM-3 returns no rows for an empty roadmap', () => {
    expect(timelineRows([], [], 'team')).toEqual([]);
  });
});
