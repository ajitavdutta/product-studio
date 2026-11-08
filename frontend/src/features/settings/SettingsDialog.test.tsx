import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, type HttpMethod } from '../../api/client';
import { settingsKeys, type SettingsRead } from '../../api/useSettings';
import type { WatermarkPresetRead } from '../../api/useWatermarkPresets';
import { createTestQueryClient, seedEmptyDocumentLists } from '../../test/providers';
import { renderApp } from '../../test/renderApp';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const SAVED_SETTINGS: SettingsRead = {
  displayName: 'Ajitav',
  jiraBaseUrl: 'https://acme.atlassian.net/',
  piCadence: { sprintsPerPi: 6, ipSprint: true },
};

const CONFIDENTIAL: WatermarkPresetRead = {
  id: 'p-1',
  name: 'Confidential',
  type: 'text',
  text: 'CONFIDENTIAL · {user}',
  position: 'diagonal',
  opacity: 0.14,
  color: 'red',
  isDefault: false,
};

type PutHandler = (body: unknown) => Promise<unknown>;

function mockServer({
  presets = [],
  onPut = (body) => Promise.resolve({ ...SAVED_SETTINGS, ...(body as object) }),
}: { presets?: WatermarkPresetRead[]; onPut?: PutHandler } = {}) {
  apiRequestMock.mockImplementation((method: HttpMethod, path: string, body?: unknown) => {
    if (path === '/settings' && method === 'GET') return Promise.resolve(SAVED_SETTINGS);
    if (path === '/settings' && method === 'PUT') return onPut(body);
    if (path === '/watermark-presets') return Promise.resolve(presets);
    return Promise.reject(new ApiError(404, 'Not found'));
  });
}

async function openSettings() {
  const user = userEvent.setup();
  const queryClient = seedEmptyDocumentLists(createTestQueryClient());
  renderApp('/', undefined, queryClient);
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  const dialog = await screen.findByRole('dialog', { name: 'Settings' });
  await within(dialog).findByLabelText('Display name');
  return { user, queryClient, dialog };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('SettingsDialog', () => {
  it('G-4 opens from the gear and focuses the dialog', async () => {
    mockServer();

    const { dialog } = await openSettings();

    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('G-4 shows the saved settings', async () => {
    mockServer();

    const { dialog } = await openSettings();

    expect({
      displayName: within(dialog).getByLabelText('Display name'),
      jira: within(dialog).getByLabelText('Jira site URL'),
    }).toEqual({
      displayName: expect.objectContaining({ value: 'Ajitav' }) as unknown,
      jira: expect.objectContaining({ value: 'https://acme.atlassian.net/' }) as unknown,
    });
  });

  it('G-4 saves the display name and shows "Settings saved"', async () => {
    mockServer();
    const { user, dialog } = await openSettings();
    const field = within(dialog).getByLabelText('Display name');

    await user.clear(field);
    await user.type(field, 'Priya');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledWith(
      'PUT',
      '/settings',
      expect.objectContaining({ displayName: 'Priya' }),
    );
  });

  it('G-4 sends an empty Jira site URL as null to reset it', async () => {
    mockServer();
    const { user, dialog } = await openSettings();

    await user.clear(within(dialog).getByLabelText('Jira site URL'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        'PUT',
        '/settings',
        expect.objectContaining({ jiraBaseUrl: null }),
      );
    });
  });

  it('G-4 rolls back and shows the server detail on 422', async () => {
    mockServer({
      onPut: () => Promise.reject(new ApiError(422, 'Display name is too long')),
    });
    const { user, dialog, queryClient } = await openSettings();
    const field = within(dialog).getByLabelText('Display name');

    await user.clear(field);
    await user.type(field, 'Priya');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Display name is too long');
    expect(queryClient.getQueryData<SettingsRead>(settingsKeys)?.displayName).toBe('Ajitav');
  });

  it('G-4 lists presets in the default preset select', async () => {
    mockServer({ presets: [CONFIDENTIAL] });
    const { user, dialog } = await openSettings();

    await user.click(within(dialog).getByRole('combobox', { name: 'Default watermark preset' }));

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['None', 'Confidential']);
  });

  it('G-4 disables the preset select when there are no presets', async () => {
    mockServer();

    const { dialog } = await openSettings();

    expect(within(dialog).getByText('Save a preset from the Exports page')).toBeInTheDocument();
  });

  it('G-4 shows an error with Retry when the settings fail to load', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(500, 'Boom'));
    const user = userEvent.setup();
    renderApp('/', undefined, seedEmptyDocumentLists(createTestQueryClient()));

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    expect(await within(dialog).findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
