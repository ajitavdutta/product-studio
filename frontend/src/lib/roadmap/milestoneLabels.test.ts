import { describe, expect, it } from 'vitest';
import { type MilestoneMark, milestoneLabelWidths } from './milestoneLabels';

const GEOMETRY = {
  trackWidth: 900,
  labelOffset: 13,
  diamondHalfWidth: 9,
  padding: 4,
  minWidth: 16,
};

function widths(marks: MilestoneMark[], obstacles: { start: number; end: number }[] = []) {
  return Object.fromEntries(milestoneLabelWidths(marks, obstacles, GEOMETRY));
}

describe('milestoneLabelWidths', () => {
  it('RM-9 a lone rightward label runs to the track edge', () => {
    expect(widths([{ id: 'a', x: 100, anchor: 'start' }])).toEqual({ a: 900 - 4 - 113 });
  });

  it('RM-9 a leftward label stops before a freeze chip on its left', () => {
    expect(widths([{ id: 'ga', x: 800, anchor: 'end' }], [{ start: 600, end: 700 }])).toEqual({
      ga: 800 - 13 - 4 - 700,
    });
  });

  it('RM-9 a rightward label stops before the next diamond', () => {
    const result = widths([
      { id: 'a', x: 100, anchor: 'start' },
      { id: 'b', x: 300, anchor: 'start' },
    ]);

    expect(result.a).toBe(300 - 9 - 4 - 113);
  });

  it('RM-9 facing labels split the gap at the midpoint', () => {
    expect(
      widths([
        { id: 'a', x: 100, anchor: 'start' },
        { id: 'b', x: 500, anchor: 'end' },
      ]),
    ).toEqual({ a: 300 - 4 - 113, b: 500 - 13 - 4 - 300 });
  });

  it('RM-9 a diamond inside a freeze chip gets no label room', () => {
    expect(widths([{ id: 'a', x: 650, anchor: 'start' }], [{ start: 600, end: 700 }])).toEqual({
      a: 0,
    });
  });

  it('RM-9 room under the minimum hides the label', () => {
    expect(widths([{ id: 'a', x: 100, anchor: 'start' }], [{ start: 130, end: 200 }])).toEqual({
      a: 0,
    });
  });

  it('RM-9 obstacles behind a label do not limit it', () => {
    expect(widths([{ id: 'a', x: 300, anchor: 'start' }], [{ start: 100, end: 200 }])).toEqual({
      a: 900 - 4 - 313,
    });
  });
});
