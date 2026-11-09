import { describe, expect, it } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import type { RoadmapDocument } from '../../api/useRoadmap';
import { newPi, piProblems, piSaveOps, type ProgramIncrement } from './pis';

const DOCUMENT = example as RoadmapDocument;
const PIS = DOCUMENT.timeline.pis;
const LENGTH = DOCUMENT.timeline.sprintLengthDays;
const CADENCE = { sprintsPerPi: 5, ipSprint: false };

function withPi(index: number, change: Partial<ProgramIncrement>): ProgramIncrement[] {
  return PIS.map((pi, position) => (position === index ? { ...pi, ...change } : pi));
}

describe('piProblems', () => {
  it('RM-4 the example PIs are valid', () => {
    expect(piProblems(PIS, LENGTH)).toEqual([]);
  });

  it('RM-4 reports a PI that starts before the previous one ends, by name', () => {
    const pis = withPi(1, { start: '2026-12-21' });

    expect(piProblems(pis, LENGTH)).toEqual([
      { index: 1, field: 'start', message: 'PI 1 · 2027 starts before PI 4 · 2026 ends' },
    ]);
  });

  it('RM-4 compares PIs in date order, not row order', () => {
    const pis = [...PIS].reverse();

    expect(piProblems(pis, LENGTH)).toEqual([]);
  });

  it('RM-4 allows a gap between PIs', () => {
    const pis = withPi(2, { start: '2027-05-03' });

    expect(piProblems(pis, LENGTH)).toEqual([]);
  });

  it('RM-4 a blank name blocks Save', () => {
    expect(piProblems(withPi(0, { name: '  ' }), LENGTH)).toEqual([
      { index: 0, field: 'name', message: 'Enter a name' },
    ]);
  });

  it('RM-4 a missing or impossible start date blocks Save', () => {
    const problems = [
      ...piProblems(withPi(0, { start: '' }), LENGTH),
      ...piProblems(withPi(0, { start: '2027-02-30' }), LENGTH),
    ];

    expect(problems.map((problem) => problem.message)).toEqual([
      'Enter a start date',
      'Enter a start date',
    ]);
  });

  it.each([0, 13, 2.5])('RM-4 %s sprints is out of range', (sprints) => {
    expect(piProblems(withPi(0, { sprints }), LENGTH)).toEqual([
      { index: 0, field: 'sprints', message: 'Use 1–12 sprints' },
    ]);
  });
});

describe('newPi', () => {
  it('RM-4 starts the new PI when the last one ends, with the Settings cadence', () => {
    expect(newPi(PIS, CADENCE, LENGTH, DOCUMENT.timeline.start)).toEqual({
      id: 'pi-4',
      name: 'PI 4',
      start: '2027-06-14',
      sprints: 5,
      ipSprint: false,
    });
  });

  it('RM-4 the first PI starts on the timeline start', () => {
    expect(newPi([], CADENCE, LENGTH, '2026-11-01').start).toBe('2026-11-01');
  });

  it('RM-4 picks an id that is not taken', () => {
    const pis = withPi(0, { id: 'pi-4' });

    expect(newPi(pis, CADENCE, LENGTH, DOCUMENT.timeline.start).id).toBe('pi-5');
  });
});

describe('piSaveOps', () => {
  it('RM-4 sends one set op with the PIs sorted by start', () => {
    const ops = piSaveOps(PIS, [...PIS].reverse());

    expect(ops).toEqual([{ op: 'set', path: '/timeline/pis', value: PIS }]);
  });

  it('RM-4 trims names', () => {
    const [op] = piSaveOps(PIS, withPi(0, { name: '  PI 4  ' }));

    expect((op?.value as ProgramIncrement[])[0]?.name).toBe('PI 4');
  });

  it('RM-4 drops custom sprint names when the sprint count changes', () => {
    const named = withPi(0, { sprintNames: ['A', 'B', 'C', 'D', 'E', 'F'] });

    const [op] = piSaveOps(
      named,
      named.map((pi, i) => (i === 0 ? { ...pi, sprints: 5 } : pi)),
    );

    expect((op?.value as ProgramIncrement[])[0]).not.toHaveProperty('sprintNames');
  });

  it('RM-4 keeps custom sprint names when the sprint count is unchanged', () => {
    const named = withPi(0, { sprintNames: ['A', 'B', 'C', 'D', 'E', 'F'] });

    const [op] = piSaveOps(named, named);

    expect((op?.value as ProgramIncrement[])[0]?.sprintNames).toHaveLength(6);
  });
});
