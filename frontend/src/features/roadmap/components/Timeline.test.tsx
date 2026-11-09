import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { Timeline } from './Timeline';

function renderTimeline(view: 'sprints' | 'months', zoom: number) {
  render(
    <Timeline
      view={view}
      zoom={zoom}
      header={<div>header</div>}
      milestones={<div>milestones</div>}
      underlay={<div>underlay</div>}
      overlay={<div>overlay</div>}
    >
      <div>rows</div>
    </Timeline>,
    { wrapper: providersFor(createTestQueryClient()) },
  );
  return screen.getByTestId('timeline-content');
}

describe('Timeline', () => {
  it('RM-20 zooms only the track, never the 220px label column', () => {
    const content = renderTimeline('months', 1.5);

    // jsdom simplifies calc(220px + (100% - 220px) * 1.5) to its canonical form.
    expect(content.style.width).toBe('calc(150% - 110px)');
  });

  it('RM-5 keeps 13 sprints at 104px as the minimum width at 100%', () => {
    const content = renderTimeline('sprints', 1);

    expect(content.style.minWidth).toBe(`${String(220 + 13 * 104)}px`);
  });

  it('RM-20 scales the minimum width with zoom', () => {
    const content = renderTimeline('months', 0.5);

    expect(content.style.minWidth).toBe('560px');
  });

  it('RM-8 paints the underlay before the rows and the overlay after them', () => {
    const content = renderTimeline('months', 1);

    expect(Array.from(content.children, (child) => child.textContent)).toEqual([
      'underlay',
      'header',
      'milestones',
      'rows',
      'overlay',
    ]);
  });

  it('NF-2 the scroll box is a labelled region', () => {
    renderTimeline('months', 1);

    expect(screen.getByRole('region', { name: 'Roadmap timeline' })).toBeInTheDocument();
  });
});
