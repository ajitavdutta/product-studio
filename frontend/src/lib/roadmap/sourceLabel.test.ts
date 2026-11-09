import { describe, expect, it } from 'vitest';
import { formatStamp, sourceChipLabel } from './sourceLabel';

const JIRA_SOURCE = {
  type: 'jira-csv' as const,
  file: 'jira-export-payments-2026-11-06.csv',
  importedAt: '2026-11-06T17:10:00+05:30',
};

describe('sourceChipLabel', () => {
  it('RM-1 names the Jira import time as written in the stamp', () => {
    expect(sourceChipLabel(JIRA_SOURCE)).toBe('From Jira · imported 6 Nov 2026, 17:10');
  });

  it('RM-1 names the file for a JSON source', () => {
    expect(sourceChipLabel({ ...JIRA_SOURCE, type: 'json', file: 'roadmap.json' })).toBe(
      'opened from roadmap.json',
    );
  });
});

describe('formatStamp', () => {
  it('RM-13 drops the year on request', () => {
    expect(formatStamp('2026-11-06T17:10:00Z', false)).toBe('6 Nov, 17:10');
  });

  it('RM-13 returns a malformed stamp unchanged', () => {
    expect(formatStamp('yesterday')).toBe('yesterday');
  });
});
