import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImportPreview } from '../../../api/useImports';
import { PREVIEW } from '../../../test/importFixtures';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { ImportPreviewPanel } from './ImportPreviewPanel';

function renderPanel(props: {
  preview?: ImportPreview;
  refreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  render(
    <ImportPreviewPanel
      preview={props.preview}
      refreshing={props.refreshing ?? false}
      error={props.error ?? null}
      onRetry={props.onRetry ?? vi.fn()}
    />,
    { wrapper: providersFor(createTestQueryClient()) },
  );
}

describe('ImportPreviewPanel', () => {
  it('IMP-11 shows counts, warnings and the first five epics', () => {
    renderPanel({ preview: PREVIEW });

    const panel = screen.getByRole('region', { name: 'Preview' });
    expect({
      stats: ['Epics', 'Issues', 'Teams'].map(
        (label) => within(panel).getByText(label).nextSibling?.textContent,
      ),
      warnings: within(screen.getByRole('list', { name: 'Import warnings' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
      epics: within(screen.getByRole('list', { name: 'First epics' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
      more: within(panel).getByText('+ 7 more epics').textContent,
    }).toEqual({
      stats: ['12', '55', '4'],
      warnings: PREVIEW.warnings,
      epics: [
        'PAY-142Saved cards & one-click checkout16 Nov → 29 Jan',
        'PAY-155UPI AutoPay mandates1 Dec → 12 Mar',
        'PAY-161Checkout A/B framework1 Feb → 5 Mar',
        'RSK-031Real-time fraud scoring v29 Nov → 19 Feb',
        'RSK-0363DS2 frictionless flowUnscheduled',
      ],
      more: '+ 7 more epics',
    });
  });

  it('IMP-11 shows a skeleton before the first preview', () => {
    renderPanel({});

    expect(screen.getByLabelText('Loading the preview')).toBeInTheDocument();
  });

  it('IMP-11 keeps the previous preview with a progress bar while refreshing', () => {
    renderPanel({ preview: PREVIEW, refreshing: true });

    expect(screen.getByRole('progressbar', { name: 'Updating the preview' })).toBeInTheDocument();
  });

  it('IMP-11 shows the error with Retry', async () => {
    const onRetry = vi.fn();
    renderPanel({ error: "Couldn't build the preview.", onRetry });

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('IMP-11 explains an empty epic list', () => {
    renderPanel({ preview: { ...PREVIEW, firstEpics: [], moreEpics: 0, epics: 0 } });

    expect(
      screen.getByText('No epics yet. Map Key, Title and Epic to see them here.'),
    ).toBeVisible();
  });
});
