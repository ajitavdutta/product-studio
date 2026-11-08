import { describe, expect, it } from 'vitest';
import type { ImportColumn, ImportSessionRead } from '../../api/useImports';
import {
  addCustomStatus,
  assignField,
  customStatusId,
  DEFAULT_ROLLUP,
  initialMapping,
  mappingStats,
  missingRequired,
} from './mapping';

function column(id: string, suggestedField: ImportColumn['suggestedField'] = null): ImportColumn {
  return { id, name: id, label: id, samples: [], fill: 1, repeatCount: 1, suggestedField };
}

const SESSION: ImportSessionRead = {
  id: '6a0c1f1e-1d2b-4c3a-9e8f-7a6b5c4d3e2f',
  fileName: 'payments-export.csv',
  size: 12_345,
  format: 'csv',
  formatLabel: 'Jira CSV',
  encoding: 'utf-8-sig',
  rowCount: 55,
  columns: [column('issue key', 'key'), column('summary', 'title'), column('components')],
  ignoredColumns: ['Priority'],
  statuses: [
    { jiraStatus: 'To Do', count: 20, statusId: 'not-started' },
    { jiraStatus: 'Blocked', count: 2, statusId: 'at-risk' },
  ],
  templateId: null,
  suggestedName: 'Payments export',
  createdAt: '2026-11-06T11:40:00Z',
};

describe('mappingStats', () => {
  it('IMP-5 counts Auto-mapped N of M', () => {
    const stats = mappingStats(SESSION.columns, { 'issue key': 'key', summary: 'title' });

    expect(stats).toEqual({ mapped: 2, total: 3 });
  });

  it("IMP-4 counts Don't import as mapped", () => {
    const stats = mappingStats(SESSION.columns, {
      'issue key': 'key',
      summary: 'title',
      components: 'ignore',
    });

    expect(stats).toEqual({ mapped: 3, total: 3 });
  });

  it('counts nothing for an export with no listed columns', () => {
    expect(mappingStats([], {})).toEqual({ mapped: 0, total: 0 });
  });
});

describe('assignField', () => {
  it('IMP-5 assigning a used field frees the other column', () => {
    const next = assignField({ start: 'start', target: 'end' }, 'target', 'start');

    expect(next).toEqual({ target: 'start' });
  });

  it('IMP-5 Epic can be used twice', () => {
    const next = assignField({ parent: 'epic' }, 'epic link', 'epic');

    expect(next).toEqual({ parent: 'epic', 'epic link': 'epic' });
  });

  it("IMP-4 Don't import can be used twice", () => {
    const next = assignField({ priority: 'ignore' }, 'components', 'ignore');

    expect(next).toEqual({ priority: 'ignore', components: 'ignore' });
  });

  it('replaces the field of the column being changed', () => {
    const next = assignField({ components: 'team' }, 'components', 'tags');

    expect(next).toEqual({ components: 'tags' });
  });

  it('does not change the input', () => {
    const columns = { start: 'start' as const };

    assignField(columns, 'other', 'start');

    expect(columns).toEqual({ start: 'start' });
  });
});

describe('missingRequired', () => {
  it('IMP-10 reports missing Key and Title', () => {
    expect(missingRequired({ components: 'team' })).toEqual(['key', 'title']);
  });

  it('IMP-10 reports nothing once Key and Title are mapped', () => {
    expect(missingRequired({ a: 'key', b: 'title' })).toEqual([]);
  });

  it("IMP-10 reports Title when it is set to Don't import", () => {
    expect(missingRequired({ a: 'key', b: 'ignore' })).toEqual(['title']);
  });
});

describe('initialMapping', () => {
  it('IMP-5 starts from the suggested fields, leaving unsuggested columns unmapped', () => {
    expect(initialMapping(SESSION).columns).toEqual({ 'issue key': 'key', summary: 'title' });
  });

  it('IMP-7 starts from the suggested status map', () => {
    expect(initialMapping(SESSION).statusMap).toEqual({
      'To Do': 'not-started',
      Blocked: 'at-risk',
    });
  });

  it('IMP-8 starts with the default roll-up rules and the suggested name', () => {
    const mapping = initialMapping(SESSION);

    expect([mapping.rollup, mapping.name]).toEqual([DEFAULT_ROLLUP, 'Payments export']);
  });
});

describe('custom statuses', () => {
  it('IMP-7 adds a custom status and maps the Jira status to it', () => {
    const next = addCustomStatus(
      initialMapping(SESSION),
      'Blocked',
      ' Waiting on vendor ',
      'purple',
    );

    expect([next.customStatuses, next.statusMap.Blocked]).toEqual([
      [{ id: 'custom-waiting-on-vendor', name: 'Waiting on vendor', color: 'purple' }],
      'custom-waiting-on-vendor',
    ]);
  });

  it('IMP-7 makes a repeated name unique', () => {
    expect(customStatusId('Parked', ['custom-parked', 'custom-parked-2'])).toBe('custom-parked-3');
  });

  it('IMP-7 keeps an id within 40 characters', () => {
    expect(customStatusId('x'.repeat(40), []).length).toBe(40);
  });

  it('IMP-7 gives a name with no letters or digits a fallback id', () => {
    expect(customStatusId('!!!', [])).toBe('custom-status');
  });
});
