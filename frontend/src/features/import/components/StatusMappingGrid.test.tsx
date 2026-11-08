import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImportSessionRead } from '../../../api/useImports';
import type { CustomStatus } from '../../../lib/importMapping/mapping';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { StatusMappingGrid } from './StatusMappingGrid';

const STATUSES: ImportSessionRead['statuses'] = [
  { jiraStatus: 'To Do', count: 20, statusId: 'not-started' },
  { jiraStatus: 'Blocked', count: 2, statusId: 'at-risk' },
];
const STATUS_MAP = { 'To Do': 'not-started', Blocked: 'at-risk' };

function renderGrid(customStatuses: CustomStatus[] = [], statuses = STATUSES) {
  const onChange = vi.fn();
  const onAddCustomStatus = vi.fn();
  render(
    <StatusMappingGrid
      statuses={statuses}
      statusMap={STATUS_MAP}
      customStatuses={customStatuses}
      onChange={onChange}
      onAddCustomStatus={onAddCustomStatus}
    />,
    { wrapper: providersFor(createTestQueryClient()) },
  );
  return { onChange, onAddCustomStatus };
}

describe('StatusMappingGrid', () => {
  it('IMP-7 shows the suggested status for each Jira status', () => {
    renderGrid();

    expect(screen.getByRole('combobox', { name: 'Roadmap status for Blocked' })).toHaveDisplayValue(
      'At risk',
    );
  });

  it('IMP-7 remaps a status', async () => {
    const { onChange } = renderGrid();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Roadmap status for Blocked' }),
      'Done',
    );

    expect(onChange).toHaveBeenCalledWith('Blocked', 'done');
  });

  it('IMP-7 adds a custom status', async () => {
    const { onChange, onAddCustomStatus } = renderGrid();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Roadmap status for Blocked' }),
      'New status…',
    );
    const dialog = screen.getByRole('dialog', { name: 'New status' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Status name' }),
      'Waiting on vendor',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Purple' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add status' }));

    expect([onAddCustomStatus.mock.calls, onChange.mock.calls]).toEqual([
      [['Blocked', 'Waiting on vendor', 'purple']],
      [],
    ]);
  });

  it('IMP-7 marks the chosen colour as pressed', async () => {
    renderGrid();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Roadmap status for To Do' }),
      'New status…',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Teal' }));

    expect(screen.getByRole('button', { name: 'Teal' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('IMP-7 refuses a new status without a name', async () => {
    const { onAddCustomStatus } = renderGrid();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Roadmap status for To Do' }),
      'New status…',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add status' }));

    expect([screen.getByText('Enter a name'), onAddCustomStatus.mock.calls]).toEqual([
      expect.anything(),
      [],
    ]);
  });

  it('IMP-7 refuses a name that is already a status', async () => {
    renderGrid();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Roadmap status for To Do' }),
      'New status…',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Status name' }), 'done{Enter}');

    expect(screen.getByText("There's already a status called “done”")).toBeInTheDocument();
  });

  it('IMP-7 offers custom statuses in every select', () => {
    renderGrid([{ id: 'custom-parked', name: 'Parked', color: 'brown' }]);

    const select = screen.getByRole('combobox', { name: 'Roadmap status for To Do' });
    expect(within(select).getByRole('option', { name: 'Parked' })).toBeInTheDocument();
  });

  it('IMP-7 explains an export with no statuses', () => {
    renderGrid([], []);

    expect(screen.getByText(/This export has no Status values/)).toBeInTheDocument();
  });
});
