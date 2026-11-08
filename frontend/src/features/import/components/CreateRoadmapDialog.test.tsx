import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW } from '../../../test/importFixtures';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { CreateRoadmapDialog } from './CreateRoadmapDialog';

function renderDialog(
  overrides: {
    preview?: typeof PREVIEW;
    error?: string | null;
    creating?: boolean;
    previewStale?: boolean;
    onConfirm?: () => void;
  } = {},
) {
  render(
    <CreateRoadmapDialog
      open
      name="Payments export"
      issueCount={55}
      preview={overrides.preview ?? PREVIEW}
      previewStale={overrides.previewStale ?? false}
      creating={overrides.creating ?? false}
      error={overrides.error ?? null}
      onConfirm={overrides.onConfirm ?? vi.fn()}
      onCancel={vi.fn()}
    />,
    { wrapper: providersFor(createTestQueryClient()) },
  );
}

describe('CreateRoadmapDialog', () => {
  it('IMP-12 confirms file name, size estimate and unmapped count', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Create roadmap' });
    expect(dialog).toHaveTextContent(
      'This creates Payments export from 55 Jira issues and saves it as:' +
        'payments-export.json12 epics · 4 lanes · 3 milestones · about 24 KB' +
        '1 column is still unmapped and will be ignored.',
    );
  });

  it('IMP-12 pluralises several unmapped columns', () => {
    renderDialog({ preview: { ...PREVIEW, unmappedColumns: ['Components', 'Labels'] } });

    expect(
      screen.getByText('2 columns are still unmapped and will be ignored.'),
    ).toBeInTheDocument();
  });

  it('IMP-12 hides the unmapped warning when every column is mapped', () => {
    renderDialog({ preview: { ...PREVIEW, unmappedColumns: [] } });

    expect(screen.queryByText(/still unmapped/)).not.toBeInTheDocument();
  });

  it('IMP-12 Create & save confirms', async () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    await userEvent.click(screen.getByRole('button', { name: 'Create & save' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('IMP-12 waits for a fresh preview before confirming', () => {
    renderDialog({ previewStale: true });

    expect(screen.getByRole('button', { name: 'Create & save' })).toBeDisabled();
  });

  it('IMP-12 shows the server reason on failure', () => {
    renderDialog({ error: 'Map Key and Title before creating the roadmap' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Map Key and Title before creating the roadmap',
    );
  });
});
