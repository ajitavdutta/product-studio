import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import example from '../../../../../docs/examples/roadmap.example.json';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { DetailPanel } from './DetailPanel';

const DOCUMENT = example as RoadmapDocument;
const FIRST_ITEM = DOCUMENT.items[0];
if (!FIRST_ITEM) throw new Error('example has no items');
// A typed const: narrowing from the guard above doesn't reach into the functions below.
const ITEM: RoadmapDocument['items'][number] = FIRST_ITEM;

/** The cache is not updated: the props stay as they were, like the tick before Query notifies. */
function renderPanel() {
  const onFieldChange = vi.fn();
  render(
    <DetailPanel
      item={ITEM}
      statuses={DOCUMENT.statuses}
      lanes={DOCUMENT.lanes}
      spanLabel=""
      jiraUrl={null}
      syncedLabel=""
      reloads={0}
      onTitleChange={vi.fn()}
      onFieldChange={onFieldChange}
      onNotesChange={vi.fn()}
      onUnschedule={vi.fn()}
      onCollapse={vi.fn()}
    />,
    { wrapper: providersFor(createTestQueryClient()) },
  );
  return { onFieldChange, start: screen.getByLabelText('Start') };
}

describe('DetailPanel dates', () => {
  it('RM-13 keeps what the user typed while the saved document lags behind', () => {
    const { start } = renderPanel();

    fireEvent.change(start, { target: { value: '2026-12-01' } });

    expect(start).toHaveValue('2026-12-01');
  });

  it('RM-13 saves each finished date once and skips partial years', () => {
    const { onFieldChange, start } = renderPanel();

    for (const value of ['0002-12-01', '0020-12-01', '0202-12-01', '2026-12-01']) {
      fireEvent.change(start, { target: { value } });
    }

    expect(onFieldChange.mock.calls).toEqual([['start', '2026-12-01']]);
  });

  it('RM-13 shows the saved date again after the field loses focus', () => {
    const { start } = renderPanel();

    fireEvent.change(start, { target: { value: '2026-12-01' } });
    fireEvent.blur(start);

    expect(start).toHaveValue(ITEM.start);
  });
});
