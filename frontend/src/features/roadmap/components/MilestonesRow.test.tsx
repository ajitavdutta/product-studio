import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import example from '../../../../../docs/examples/roadmap.example.json';
import monthsFixture from '../../../../../docs/fixtures/timeline/months.json';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import { fraction, programIncrements, toDay } from '../../../lib/timeline';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { MilestonesRow } from './MilestonesRow';
import { TimelineHeader } from './TimelineHeader';

const DOCUMENT = example as RoadmapDocument;
const PIS = programIncrements(DOCUMENT.timeline.pis, DOCUMENT.timeline.sprintLengthDays);
const TODAY = '2026-11-06';
const TRACK_WIDTH = 900;

function renderRow(overrides: Partial<Parameters<typeof MilestonesRow>[0]> = {}) {
  const onMilestoneClick = vi.fn();
  render(
    <div>
      <TimelineHeader
        view="months"
        range={monthsFixture.range}
        pis={PIS}
        today={TODAY}
        colW={104}
      />
      <MilestonesRow
        range={monthsFixture.range}
        milestones={DOCUMENT.milestones}
        items={DOCUMENT.items}
        today={TODAY}
        trackWidth={TRACK_WIDTH}
        onMilestoneClick={onMilestoneClick}
        {...overrides}
      />
    </div>,
    { wrapper: providersFor(createTestQueryClient()) },
  );
  return { onMilestoneClick, row: screen.getByRole('group', { name: 'Milestones' }) };
}

describe('MilestonesRow', () => {
  it('RM-9 labels each diamond with name and date', () => {
    renderRow();

    expect(screen.getByRole('button', { name: 'Beta launch · 15 Jan' })).toBeInTheDocument();
  });

  it('RM-9 right-aligns the last milestone label', () => {
    renderRow();
    const last = screen.getByRole('button', { name: 'General availability (GA) · 20 Apr' });

    expect([last.style.right !== '', last.style.left]).toEqual([true, '']);
  });

  it('RM-9 earlier milestone labels are left-anchored', () => {
    renderRow();

    expect(screen.getByRole('button', { name: 'Beta launch · 15 Jan' }).style.left).not.toBe('');
  });

  it('RM-9 clicking a milestone reports how many epics cross it', async () => {
    const { onMilestoneClick } = renderRow();

    await userEvent.click(screen.getByRole('button', { name: 'Beta launch · 15 Jan' }));

    expect(onMilestoneClick).toHaveBeenCalledWith('Beta launch · 15 Jan 2027 · 5 epics cross it');
  });

  it('RM-9 freeze chip says Code freeze when wide and Freeze when 76px or narrower', () => {
    const wide = within(renderRow().row).getByRole('img', { name: /Code freeze/ }).textContent;
    document.body.innerHTML = '';
    // 17 of 181 days on a 700px track is about 66px.
    const narrow = within(renderRow({ trackWidth: 700 }).row).getByRole('img', {
      name: /Code freeze/,
    }).textContent;

    expect([wide, narrow]).toEqual(['Code freeze', 'Freeze']);
  });

  it('RM-10 Today label is inside the milestones row, not the header', () => {
    const { row } = renderRow();
    const header = screen.getByRole('group', { name: 'Timeline header' });

    expect([within(row).queryByText('TODAY · 6 Nov'), within(header).queryByText(/TODAY/)]).toEqual(
      [expect.any(HTMLElement), null],
    );
  });

  it('RM-10 Today label hides when today is outside the range', () => {
    const { row } = renderRow({ today: '2030-01-01' });

    expect(within(row).queryByText(/TODAY/)).toBeNull();
  });

  it('RM-9-editor label and empty-row slots render', () => {
    renderRow({
      milestones: [],
      labelAction: <button type="button">Edit milestones</button>,
      emptyAction: <button type="button">Add a milestone</button>,
    });

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Edit milestones',
      'Add a milestone',
    ]);
  });

  it('RM-9 a milestone label never overlaps a freeze chip', () => {
    renderRow();
    const ga = screen.getByRole('button', { name: 'General availability (GA) · 20 Apr' });
    const label = ga.querySelector<HTMLElement>('[data-milestone-label]');
    const trackX = (date: string) => fraction(monthsFixture.range, toDay(date)) * TRACK_WIDTH;
    // GA grows leftwards from its diamond; its text starts 13px left of the diamond's centre.
    const labelLeft = trackX('2027-04-20') - 13 - parseFloat(label?.style.maxWidth ?? '');
    const freezeRight = trackX('2027-04-01');

    expect(labelLeft).toBeGreaterThanOrEqual(freezeRight);
  });

  it('RM-9 a shortened label keeps its full name for assistive tech and the tooltip', () => {
    renderRow();
    const ga = screen.getByRole('button', { name: 'General availability (GA) · 20 Apr' });

    expect(ga).toHaveAttribute('title', 'General availability (GA) · 20 Apr');
  });
});
