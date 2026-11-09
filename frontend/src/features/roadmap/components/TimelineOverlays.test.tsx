import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import example from '../../../../../docs/examples/roadmap.example.json';
import monthsFixture from '../../../../../docs/fixtures/timeline/months.json';
import sprintsFixture from '../../../../../docs/fixtures/timeline/sprints.json';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import { programIncrements, type TimelineView } from '../../../lib/timeline';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { TimelineOverlays } from './TimelineOverlays';

const DOCUMENT = example as RoadmapDocument;
const PIS = programIncrements(DOCUMENT.timeline.pis, DOCUMENT.timeline.sprintLengthDays);

function renderLayer(layer: 'grid' | 'markers', view: TimelineView, showMilestoneLines = true) {
  const range = view === 'months' ? monthsFixture.range : sprintsFixture.range;
  const { container } = render(
    <TimelineOverlays
      layer={layer}
      view={view}
      range={range}
      pis={PIS}
      today="2026-11-06"
      milestones={DOCUMENT.milestones}
      showMilestoneLines={showMilestoneLines}
    />,
    { wrapper: providersFor(createTestQueryClient()) },
  );
  const count = (kind: string) => container.querySelectorAll(`[data-overlay="${kind}"]`).length;
  return { container, count };
}

describe('TimelineOverlays', () => {
  it('RM-9 draws a line per milestone and a freeze band', () => {
    const { count } = renderLayer('markers', 'months');

    expect([count('milestone'), count('freeze')]).toEqual([2, 1]);
  });

  it('RM-9 milestone lines hide when the checkbox is off', () => {
    const { count } = renderLayer('markers', 'months', false);

    expect([count('milestone'), count('freeze')]).toEqual([0, 0]);
  });

  it('RM-10 Today line stays when milestone lines are off', () => {
    expect(renderLayer('markers', 'months', false).count('today')).toBe(1);
  });

  it('RM-5 sprint view draws strong PI lines and IP bands', () => {
    const { count } = renderLayer('grid', 'sprints');

    expect([count('pi-line'), count('column-line'), count('ip')]).toEqual([2, 10, 2]);
  });

  it('RM-12 Months view has no IP bands', () => {
    expect(renderLayer('grid', 'months').count('ip')).toBe(0);
  });

  it('NF-2 overlays are hidden from assistive tech', () => {
    const { container } = renderLayer('markers', 'months');

    expect(
      [...container.querySelectorAll('[data-overlay]')].every(
        (node) => node.getAttribute('aria-hidden') === 'true',
      ),
    ).toBe(true);
  });
});
