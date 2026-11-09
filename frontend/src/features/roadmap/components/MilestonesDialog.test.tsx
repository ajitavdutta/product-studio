import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import example from '../../../../../docs/examples/roadmap.example.json';
import { ApiError, apiRequest, type HttpMethod } from '../../../api/client';
import type { RoadmapDocument, RoadmapRead } from '../../../api/useRoadmap';
import { useSaveStateStore } from '../../../app/saveState';
import { createTestQueryClient, seedEmptyDocumentLists } from '../../../test/providers';
import { renderApp } from '../../../test/renderApp';
import { useRoadmapEditor } from '../state';

vi.mock('../../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/client')>()),
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

const ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31';
const DOCUMENT = example as RoadmapDocument;
const FILE_NAME = 'payments-platform-h1-2027.json';
const ROADMAP: RoadmapRead = {
  id: ROADMAP_ID,
  name: DOCUMENT.name,
  fileName: FILE_NAME,
  revision: 1,
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-06T09:00:00Z',
  document: DOCUMENT,
};

type PatchReply = () => Promise<unknown>;

/** GET answers with `roadmap`; each PATCH with the next reply, then a plain success. */
function mockServer(roadmap: RoadmapRead = ROADMAP, replies: PatchReply[] = []) {
  let revision = roadmap.revision;
  apiRequestMock.mockImplementation((method: HttpMethod) => {
    if (method === 'GET') return Promise.resolve(roadmap);
    const reply = replies.shift();
    if (reply) return reply();
    revision += 1;
    return Promise.resolve({ revision, fileName: FILE_NAME });
  });
}

function patchBodies() {
  return apiRequestMock.mock.calls
    .filter(([method]) => method === 'PATCH')
    .map(([, , body]) => body as { ops: unknown[] });
}

async function openDialog() {
  renderApp(`/roadmaps/${ROADMAP_ID}`, undefined, seedEmptyDocumentLists(createTestQueryClient()));
  const trigger = await screen.findByRole('button', { name: 'Edit milestones' });
  await userEvent.click(trigger);
  return { trigger, dialog: await screen.findByRole('dialog', { name: 'Milestones' }) };
}

function rowNamed(dialog: HTMLElement, name: string) {
  return within(within(dialog).getByRole('list', { name: 'Milestones' })).getByRole('listitem', {
    name,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T12:00:00'));
  window.localStorage.clear();
  useRoadmapEditor.setState({
    view: 'months',
    groupBy: 'team',
    selectedItemId: null,
    showMilestoneLines: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  useSaveStateStore.getState().set(null);
});

describe('MilestonesDialog', () => {
  it('RM-9-editor adds a milestone and autosaves one insert op', async () => {
    mockServer();
    const { dialog } = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }));

    await waitFor(() => {
      expect(patchBodies()).toEqual([
        expect.objectContaining({
          ops: [
            {
              op: 'insert',
              path: '/milestones',
              value: {
                id: 'ms-new-milestone',
                name: 'New milestone',
                kind: 'milestone',
                date: '2026-11-16',
              },
            },
          ],
        }),
      ]);
    });
  });

  it('RM-9-editor focuses the Name field of an added row', async () => {
    mockServer();
    const { dialog } = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add freeze window' }));

    const freezes = within(dialog).getAllByRole('listitem', { name: 'Code freeze' });
    expect(
      within(freezes[freezes.length - 1] as HTMLElement).getByRole('textbox', { name: 'Name' }),
    ).toBe(document.activeElement);
  });

  it('RM-9-editor renaming saves after the text debounce', async () => {
    mockServer();
    const { dialog } = await openDialog();
    const name = within(rowNamed(dialog, 'Beta launch')).getByRole('textbox', { name: 'Name' });

    await userEvent.clear(name);
    await userEvent.type(name, 'Pilot');

    expect(patchBodies()).toEqual([]);
    await waitFor(() => {
      expect(patchBodies()).toEqual([
        expect.objectContaining({
          ops: [{ op: 'set', path: '/milestones/ms-beta/name', value: 'Pilot' }],
        }),
      ]);
    });
  });

  it('RM-9-editor shows the blank-name message and sends nothing', async () => {
    mockServer();
    const { dialog } = await openDialog();

    await userEvent.clear(
      within(rowNamed(dialog, 'Beta launch')).getByRole('textbox', { name: 'Name' }),
    );

    expect(within(dialog).getByText('Give the milestone a name')).toBeInTheDocument();
  });

  it('RM-9-editor switching to Freeze window sends one batch', async () => {
    mockServer();
    const { dialog } = await openDialog();

    await userEvent.click(within(rowNamed(dialog, 'Beta launch')).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Freeze window' }));

    await waitFor(() => {
      expect(patchBodies()).toEqual([
        expect.objectContaining({
          ops: [
            { op: 'set', path: '/milestones/ms-beta/kind', value: 'freeze' },
            { op: 'remove', path: '/milestones/ms-beta/date' },
            { op: 'set', path: '/milestones/ms-beta/start', value: '2027-01-15' },
            { op: 'set', path: '/milestones/ms-beta/end', value: '2027-01-15' },
          ],
        }),
      ]);
    });
  });

  it('RM-9-editor rejects a freeze ending before it starts and sends nothing', async () => {
    mockServer();
    const { dialog } = await openDialog();
    const end = within(rowNamed(dialog, 'Code freeze')).getByLabelText('End');

    await userEvent.clear(end);
    await userEvent.type(end, '2027-03-01');

    expect({
      message: within(dialog).getByText('Freeze “Code freeze” ends before it starts'),
      patches: patchBodies(),
    }).toEqual({ message: expect.anything() as unknown, patches: [] });
  });

  it('RM-9-editor delete asks for confirmation; Cancel keeps the row', async () => {
    mockServer();
    const { dialog } = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Beta launch' }));
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toBe(document.activeElement);
    await userEvent.click(cancel);

    expect({
      row: rowNamed(dialog, 'Beta launch'),
      focused: document.activeElement,
      patches: patchBodies(),
    }).toEqual({
      row: expect.anything() as unknown,
      focused: within(dialog).getByRole('button', { name: 'Delete Beta launch' }),
      patches: [],
    });
  });

  it('RM-9-editor Esc cancels the confirmation without closing the dialog', async () => {
    mockServer();
    const { dialog } = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Beta launch' }));
    await userEvent.keyboard('{Escape}');

    expect(within(dialog).getByRole('button', { name: 'Delete Beta launch' })).toBeVisible();
  });

  it('RM-9-editor confirmed delete removes the diamond from the timeline', async () => {
    mockServer();
    const { dialog } = await openDialog();
    // The open dialog hides the page from the accessibility tree.
    const milestonesRow = screen.getByRole('group', { name: 'Milestones', hidden: true });
    expect(within(milestonesRow).getByText('Beta launch · 15 Jan')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Beta launch' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(patchBodies()).toEqual([
        expect.objectContaining({ ops: [{ op: 'remove', path: '/milestones/ms-beta' }] }),
      ]);
    });
    expect({
      diamond: within(milestonesRow).queryByText('Beta launch · 15 Jan'),
      // Announced by the app snackbar, which stays visible to screen readers over the dialog.
      snackbar: screen.getByRole('alert').textContent,
    }).toEqual({ diamond: null, snackbar: 'Deleted Beta launch' });
  });

  it('RM-9-editor dialog traps focus and returns it to the trigger', async () => {
    mockServer();
    const { trigger, dialog } = await openDialog();

    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(trigger).toBe(document.activeElement);
    });
  });

  it('RM-9-editor the empty row offers Add a milestone, which opens the dialog with it', async () => {
    mockServer({ ...ROADMAP, document: { ...DOCUMENT, milestones: [] } });
    renderApp(
      `/roadmaps/${ROADMAP_ID}`,
      undefined,
      seedEmptyDocumentLists(createTestQueryClient()),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Add a milestone' }));

    const dialog = await screen.findByRole('dialog', { name: 'Milestones' });
    expect(within(rowNamed(dialog, 'New milestone')).getByRole('textbox', { name: 'Name' })).toBe(
      document.activeElement,
    );
  });

  it('RM-9-editor shows the empty state when there are no milestones', async () => {
    mockServer({ ...ROADMAP, document: { ...DOCUMENT, milestones: [] } });
    const { dialog } = await openDialog();

    expect(
      within(dialog).getByText('No milestones yet. Add one to mark a launch or a code freeze.'),
    ).toBeInTheDocument();
  });

  it('RM-9-editor typing a name quickly keeps every character', async () => {
    mockServer();
    const { dialog } = await openDialog();
    const name = within(rowNamed(dialog, 'Beta launch')).getByRole('textbox', { name: 'Name' });
    const fastUser = userEvent.setup({ delay: null });

    await fastUser.type(name, ' pilot', { initialSelectionStart: 11, initialSelectionEnd: 11 });

    expect(name).toHaveValue('Beta launch pilot');
  });

  it('RM-9-editor a partly typed year is kept in the field and not saved', async () => {
    mockServer();
    const { dialog } = await openDialog();
    const date = within(rowNamed(dialog, 'Beta launch')).getByLabelText('Date');
    date.focus();

    fireEvent.change(date, { target: { value: '0002-02-10' } });
    fireEvent.change(date, { target: { value: '2027-02-10' } });

    await waitFor(() => {
      expect(patchBodies()).toEqual([
        expect.objectContaining({
          ops: [{ op: 'set', path: '/milestones/ms-beta/date', value: '2027-02-10' }],
        }),
      ]);
    });
  });

  it('RM-9-editor an out-of-range year shows a message on blur and sends nothing', async () => {
    mockServer();
    const { dialog } = await openDialog();
    const date = within(rowNamed(dialog, 'Beta launch')).getByLabelText('Date');
    date.focus();

    fireEvent.change(date, { target: { value: '0007-11-01' } });
    fireEvent.blur(date);

    expect({
      message: within(dialog).queryByText('Enter a date between 1900 and 2999'),
      patches: patchBodies(),
    }).toEqual({ message: expect.anything() as unknown, patches: [] });
  });

  it('RM-9-editor date fields are bounded like the detail panel', async () => {
    mockServer();
    const { dialog } = await openDialog();

    expect(within(rowNamed(dialog, 'Code freeze')).getByLabelText('End')).toMatchObject({
      min: '1900-01-01',
      max: '2999-12-31',
    });
  });

  it('RM-9-editor a failed save rolls back and shows the snackbar', async () => {
    mockServer(ROADMAP, [() => Promise.reject(new ApiError(500, 'Boom'))]);
    const { dialog } = await openDialog();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add milestone' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that change");
    expect(within(dialog).queryByRole('listitem', { name: 'New milestone' })).toBeNull();
  });
});
