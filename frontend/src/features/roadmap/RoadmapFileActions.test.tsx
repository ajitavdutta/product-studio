import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import example from '../../../../docs/examples/roadmap.example.json';
import { ApiError, apiUpload } from '../../api/client';
import type { RoadmapDocument, RoadmapRead } from '../../api/useRoadmap';
import { AppProviders } from '../../app/AppProviders';
import { createTestQueryClient } from '../../test/providers';
import { RoadmapFileActions } from './RoadmapFileActions';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiUpload: vi.fn(),
}));

const apiUploadMock = vi.mocked(apiUpload);
const DOCUMENT = example as RoadmapDocument;
const ROADMAP: RoadmapRead = {
  id: DOCUMENT.id,
  name: DOCUMENT.name,
  fileName: 'payments-platform-h1-2027.json',
  revision: 3,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-06T09:00:00Z',
  document: DOCUMENT,
};

function renderActions({ saving = false, flush = vi.fn() } = {}) {
  render(
    <AppProviders queryClient={createTestQueryClient()}>
      <MemoryRouter>
        <RoadmapFileActions roadmap={ROADMAP} saving={saving} flush={flush} />
      </MemoryRouter>
    </AppProviders>,
  );
  return { flush };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('RoadmapFileActions', () => {
  it('RM-16 Save JSON shows the exact document and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Save JSON' }));
    const dialog = screen.getByRole('dialog', { name: 'Save roadmap JSON' });
    const shown = within(dialog).getByLabelText('Roadmap JSON').textContent;
    await user.click(within(dialog).getByRole('button', { name: 'Copy JSON' }));

    expect({ shown: JSON.parse(shown) as unknown, copied: writeText.mock.calls[0]?.[0] }).toEqual({
      shown: DOCUMENT,
      copied: shown,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON copied');
  });

  it('RM-16 Save JSON names the file and sends pending edits first', async () => {
    const { flush } = renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Save JSON' }));

    expect(flush).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toHaveTextContent('Saves payments-platform-h1-2027.json.');
  });

  it('RM-16 Download is the backend file and waits while autosave is saving', async () => {
    renderActions({ saving: true });

    await userEvent.click(screen.getByRole('button', { name: 'Save JSON' }));
    const download = screen.getByRole('link', { name: 'Saving…' });

    expect({
      href: download.getAttribute('href'),
      disabled: download.getAttribute('aria-disabled'),
    }).toEqual({ href: `/api/roadmaps/${DOCUMENT.id}/document`, disabled: 'true' });
  });

  it('RM-16 a blocked copy says so', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Save JSON' }));
    await user.click(screen.getByRole('button', { name: 'Copy JSON' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Copy was blocked');
  });

  it('RM-16 Open JSON error shows the plain message', async () => {
    apiUploadMock.mockRejectedValue(
      new ApiError(422, 'This file was saved by a newer version of Product Studio.'),
    );
    renderActions();

    await userEvent.upload(
      screen.getByLabelText('Open JSON'),
      new File(['{}'], 'roadmap.json', { type: 'application/json' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file was saved by a newer version of Product Studio.',
    );
  });
});
