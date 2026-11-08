import { describe, expect, it } from 'vitest';
import type { components } from '../../api/types';
import { abbreviateDocument } from './abbreviateJson';
import { formatDateRange, formatFileSize, formatSizeEstimate } from './previewFormat';

type RoadmapDocument = components['schemas']['RoadmapDocument'];

function item(key: string): RoadmapDocument['items'][number] {
  return {
    id: key,
    key,
    title: key,
    type: 'Epic',
    laneId: 'checkout',
    statusId: 'done',
    progress: 0,
    position: 1000,
    issues: { total: 1, done: 0, inProgress: 0 },
  };
}

const DOCUMENT: RoadmapDocument = {
  schemaVersion: 1,
  kind: 'roadmap',
  id: 'doc-1',
  name: 'Payments "H1"',
  source: { type: 'jira-csv', file: 'payments-export.csv', importedAt: '2026-11-06T10:00:00Z' },
  timeline: {
    start: '2026-11-02',
    sprintLengthDays: 14,
    pis: [
      { id: 'pi-1', name: 'PI 1', start: '2026-11-02', sprints: 6, ipSprint: true },
      { id: 'pi-2', name: 'PI 2', start: '2027-01-25', sprints: 6, ipSprint: true },
    ],
  },
  lanes: [{ id: 'checkout', name: 'Checkout', color: 'blue', position: 1000 }],
  statuses: [],
  items: [item('PAY-1'), item('PAY-2'), item('PAY-3')],
  milestones: [],
  linkedDiagrams: [],
};

describe('abbreviateDocument', () => {
  it('IMP-11 abbreviates items as a count of epics', () => {
    expect(abbreviateDocument(DOCUMENT)).toContain('"items": [ … 3 epics ]');
  });

  it('IMP-11 abbreviates PIs as a count', () => {
    expect(abbreviateDocument(DOCUMENT)).toContain('"pis": [ … 2 PIs ]');
  });

  it('IMP-11 uses the singular for one epic', () => {
    expect(abbreviateDocument({ ...DOCUMENT, items: [item('PAY-1')] })).toContain(
      '"items": [ … 1 epic ]',
    );
  });

  it('IMP-11 keeps the rest of the document escaped and indented', () => {
    expect(abbreviateDocument(DOCUMENT)).toContain('  "name": "Payments \\"H1\\"",');
  });
});

describe('formatDateRange', () => {
  it('IMP-11 formats a range as day and short month', () => {
    expect(formatDateRange('2026-11-16', '2027-01-29')).toBe('16 Nov → 29 Jan');
  });

  it('IMP-11 shows an open end with an ellipsis', () => {
    expect(formatDateRange('2026-11-16', null)).toBe('16 Nov → …');
  });

  it('IMP-11 shows Unscheduled when there are no dates', () => {
    expect(formatDateRange(null, undefined)).toBe('Unscheduled');
  });
});

describe('formatFileSize', () => {
  it('IMP-1 shows bytes below 1 KB', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('IMP-1 rounds kilobytes to a whole number', () => {
    expect(formatFileSize(10_304)).toBe('10 KB');
  });

  it('IMP-1 shows megabytes with one decimal from 1 MB', () => {
    expect(formatFileSize(2_202_010)).toBe('2.1 MB');
  });
});

describe('formatSizeEstimate', () => {
  it('IMP-12 rounds to whole kilobytes', () => {
    expect(formatSizeEstimate(24_300)).toBe('about 24 KB');
  });

  it('IMP-12 never shows less than 1 KB', () => {
    expect(formatSizeEstimate(0)).toBe('about 1 KB');
  });

  it('IMP-12 switches to megabytes from 1024 KB', () => {
    expect(formatSizeEstimate(1_572_864)).toBe('about 1.5 MB');
  });
});
