import { describe, expect, it } from 'vitest';
import opCases from '../../../../shared/document-ops.cases.json';
import { applyOps, DocumentOpError, type DocumentOp } from './applyOps';

interface OpCase {
  name: string;
  before: Record<string, unknown>;
  ops: DocumentOp[];
  after?: Record<string, unknown>;
  error?: { path: string };
}

const cases = opCases.cases as OpCase[];
const successCases = cases.filter((opCase) => opCase.error === undefined);
const errorCases = cases.filter((opCase) => opCase.error !== undefined);

describe('applyOps shared cases', () => {
  it.each(successCases.map((opCase) => [opCase.name, opCase] as const))(
    'G-2 op case: %s',
    (_name, opCase) => {
      expect(applyOps(opCase.before, opCase.ops)).toEqual(opCase.after);
    },
  );

  it.each(errorCases.map((opCase) => [opCase.name, opCase] as const))(
    'G-2 op case: %s',
    (_name, opCase) => {
      const error: unknown = (() => {
        try {
          applyOps(opCase.before, opCase.ops);
        } catch (caught) {
          return caught;
        }
        return undefined;
      })();

      expect(error).toBeInstanceOf(DocumentOpError);
      expect((error as DocumentOpError).path).toBe(opCase.error?.path);
    },
  );
});

describe('applyOps', () => {
  it('G-2 never mutates the input document', () => {
    const before = { name: 'Plan', items: [{ id: 'it-1', title: 'One' }] };
    const snapshot = structuredClone(before);

    applyOps(before, [{ op: 'set', path: '/items/it-1/title', value: 'Changed' }]);

    expect(before).toEqual(snapshot);
  });

  it('G-2 rejects a move without a position', () => {
    expect(() => applyOps({ items: [{ id: 'a' }, { id: 'b' }] }, [{ op: 'move', path: '/items/b' }])).toThrow(
      'Move needs a position inside the list',
    );
  });

  it('G-2 rejects replacing the whole document', () => {
    expect(() => applyOps({ name: 'Plan' }, [{ op: 'set', path: '', value: {} }])).toThrow(
      "The whole document can't be replaced",
    );
  });
});
