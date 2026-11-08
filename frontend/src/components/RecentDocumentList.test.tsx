import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, providersFor } from '../test/providers';
import { RecentDocumentList, type RecentDocument } from './RecentDocumentList';

const ITEM: RecentDocument = {
  id: 'r1',
  name: 'Payments Platform H1 2027',
  fileName: 'payments-platform-h1-2027.json',
  updatedAt: '2026-11-02T12:00:00Z',
};

function renderList(overrides: Partial<Parameters<typeof RecentDocumentList>[0]> = {}) {
  const props = {
    title: 'Recent roadmaps',
    items: [ITEM],
    onOpen: vi.fn(),
    emptyState: 'Nothing here',
    loading: false,
    error: null,
    onRetry: vi.fn(),
    ...overrides,
  };
  render(<RecentDocumentList {...props} />, { wrapper: providersFor(createTestQueryClient()) });
  return props;
}

describe('RecentDocumentList', () => {
  it('HOME-2 opens the row the user picks', async () => {
    const props = renderList();

    await userEvent.click(screen.getByRole('button', { name: `Open ${ITEM.name}` }));

    expect(props.onOpen).toHaveBeenCalledWith(ITEM);
  });

  it('has no Delete button unless onDelete is given', () => {
    renderList();

    expect(screen.queryByRole('button', { name: `Delete ${ITEM.name}` })).not.toBeInTheDocument();
  });

  it('shows a busy skeleton while loading', () => {
    renderList({ loading: true });

    expect(screen.getByLabelText('Loading recent roadmaps')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the error with Retry', async () => {
    const props = renderList({ error: "Couldn't load your roadmaps." });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it('shows the empty state when there are no items', () => {
    renderList({ items: [] });

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});
