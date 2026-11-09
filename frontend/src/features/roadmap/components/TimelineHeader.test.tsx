import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import example from '../../../../../docs/examples/roadmap.example.json';
import sprintsFixture from '../../../../../docs/fixtures/timeline/sprints.json';
import pisFixture from '../../../../../docs/fixtures/timeline/pis.json';
import { programIncrements, type TimelineView } from '../../../lib/timeline';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { TimelineHeader } from './TimelineHeader';

const PIS = programIncrements(example.timeline.pis, example.timeline.sprintLengthDays);
const TODAY = '2026-11-06';

function renderHeader(view: TimelineView, colW = 104) {
  const range = view === 'pis' ? pisFixture.range : sprintsFixture.range;
  render(<TimelineHeader view={view} range={range} pis={PIS} today={TODAY} colW={colW} />, {
    wrapper: providersFor(createTestQueryClient()),
  });
  return screen.getByRole('group', { name: 'Timeline header' });
}

function sprintCell(header: HTMLElement, label: string) {
  const cell = within(header).getAllByText(label)[0]?.parentElement;
  if (!cell) throw new Error(`no ${label} cell`);
  return cell;
}

describe('TimelineHeader', () => {
  it('RM-5 shows sprint dates on one line at 104px and compact at 70px', () => {
    const wide = sprintCell(renderHeader('sprints', 104), 'S3').textContent;
    document.body.innerHTML = '';
    const compact = sprintCell(renderHeader('sprints', 70), 'S3').textContent;

    expect([wide, compact]).toEqual(['S32 Nov – 15 Nov', 'S32–15 Nov']);
  });

  it('RM-5 sprint cell tooltip has the full dates', () => {
    expect(sprintCell(renderHeader('sprints', 30), 'S4')).toHaveAttribute(
      'title',
      'PI 4 · 2026 · S4 · 16 Nov – 29 Nov',
    );
  });

  it('RM-5 PI band and IP label render', () => {
    const header = renderHeader('sprints');

    expect([
      within(header).getByText('PI 1 · 2027'),
      within(header).getAllByText('S6 · IP')[0],
    ]).toHaveLength(2);
  });

  it('RM-7 highlights the current tick', () => {
    const header = renderHeader('pis');
    const current = header.querySelectorAll('[aria-current="date"]');

    expect([...current].map((cell) => cell.textContent)).toEqual(['S3']);
  });

  it('RM-7 shows the PI date range', () => {
    expect(within(renderHeader('pis')).getByText('5 Oct – 27 Dec')).toBeInTheDocument();
  });

  it('RM-6 corner names the view', () => {
    expect(within(renderHeader('months')).getByText('by month')).toBeInTheDocument();
  });
});
