import { describe, expect, it } from 'vitest';
import type { components } from '../../api/types';
import {
  applyLabel,
  changeText,
  groupChanges,
  initialSelection,
  resyncMappingFields,
} from './resync';

type ResyncChange = components['schemas']['ResyncChange'];

function change(id: string, extra: Partial<ResyncChange> = {}): ResyncChange {
  return {
    id,
    kind: 'dates',
    itemKey: 'PAY-155',
    itemTitle: 'UPI AutoPay mandates',
    before: '12 Mar 2027',
    after: '26 Mar 2027',
    conflict: false,
    alreadyApplied: false,
    ...extra,
  };
}

const CHANGES = [
  change('dates:PAY-155'),
  change('dates:PAY-142', { conflict: true, conflictReason: 'You changed the dates by hand' }),
  change('status:RSK-031', { kind: 'status', alreadyApplied: true }),
];

describe('re-sync review', () => {
  it('RM-15 pre-selects changes that are neither conflicts nor already applied', () => {
    expect([...initialSelection(CHANGES)]).toEqual(['dates:PAY-155']);
  });

  it('RM-15 groups updates, conflicts and already-applied rows', () => {
    const groups = groupChanges(CHANGES);

    expect({
      updates: groups.updates.map((item) => item.id),
      conflicts: groups.conflicts.map((item) => item.id),
      alreadyApplied: groups.alreadyApplied.map((item) => item.id),
    }).toEqual({
      updates: ['dates:PAY-155'],
      conflicts: ['dates:PAY-142'],
      alreadyApplied: ['status:RSK-031'],
    });
  });

  it('RM-15 shows the server display strings as they are', () => {
    expect(changeText(change('dates:PAY-155'))).toEqual({
      label: 'dates',
      before: '12 Mar 2027',
      after: '26 Mar 2027',
    });
  });

  it('RM-15 a new item shows its title', () => {
    expect(changeText(change('new:PAY-200', { kind: 'new', itemTitle: 'Wallet top-up' }))).toEqual({
      label: 'new in Jira',
      before: null,
      after: 'Wallet top-up',
    });
  });

  it('RM-15 an empty diff selects nothing', () => {
    expect(initialSelection([]).size).toBe(0);
  });

  it('RM-15 the Apply label counts the selection', () => {
    expect([applyLabel(1), applyLabel(3)]).toEqual(['Apply 1 change', 'Apply 3 changes']);
  });
});

describe('resyncMappingFields', () => {
  const LOADED = ['tpl-1', 'tpl-2'];

  it('RM-15 a chosen template is sent as templateId', () => {
    expect(resyncMappingFields('tpl-2', LOADED)).toEqual({ templateId: 'tpl-2' });
  });

  it('RM-15 Automatic sends mapping=auto and no templateId', () => {
    expect(resyncMappingFields('', LOADED)).toEqual({ mapping: 'auto' });
  });

  it('RM-15 a template that no longer exists counts as Automatic, as the select shows', () => {
    expect(resyncMappingFields('tpl-deleted', LOADED)).toEqual({ mapping: 'auto' });
  });

  it('RM-15 before the templates load, the server uses the roadmap’s own template', () => {
    expect(resyncMappingFields('tpl-1', null)).toEqual({});
  });
});
