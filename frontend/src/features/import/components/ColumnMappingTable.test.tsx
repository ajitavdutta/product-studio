import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ImportColumn } from '../../../api/useImports';
import type { ColumnFields } from '../../../lib/importMapping/mapping';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { ColumnMappingTable } from './ColumnMappingTable';

function column(
  overrides: Partial<ImportColumn> & Pick<ImportColumn, 'id' | 'label'>,
): ImportColumn {
  return { name: overrides.label, samples: [], fill: 1, repeatCount: 1, ...overrides };
}

const COLUMNS: ImportColumn[] = [
  column({
    id: 'issue key',
    label: 'Issue key',
    samples: ['PAY-142'],
    suggestedField: 'key',
    confidence: 'exact',
  }),
  column({
    id: 'epic link',
    label: 'Epic Link',
    samples: ['PAY-100'],
    suggestedField: 'epic',
    confidence: 'exact',
    note: 'Used when Parent is empty',
  }),
  column({
    id: 'estimate',
    label: 'Estimate',
    samples: ['8'],
    suggestedField: 'points',
    confidence: 'sniffed',
  }),
  column({ id: 'components', label: 'Components', samples: ['Wallet'] }),
];
const FIELDS: ColumnFields = { 'issue key': 'key', 'epic link': 'epic', estimate: 'points' };

function renderTable(fields: ColumnFields = FIELDS, ignoredCount = 7) {
  const onChange = vi.fn();
  render(
    <ColumnMappingTable
      columns={COLUMNS}
      fields={fields}
      ignoredCount={ignoredCount}
      onChange={onChange}
    />,
    { wrapper: providersFor(createTestQueryClient()) },
  );
  return onChange;
}

function rowOf(label: string): HTMLElement {
  const row = screen.getByText(label).closest('tr');
  if (!row) throw new Error(`No table row for ${label}`);
  return row;
}

describe('ColumnMappingTable', () => {
  it('IMP-5 counts Auto-mapped N of M in the badge', () => {
    renderTable();

    expect(screen.getByRole('status')).toHaveTextContent('Auto-mapped 3 of 4');
  });

  it('IMP-5 highlights sniffed rows', () => {
    renderTable();

    expect(rowOf('Estimate')).toHaveTextContent('Check this');
  });

  it('IMP-5 does not flag exact matches for checking', () => {
    renderTable();

    expect(rowOf('Issue key')).not.toHaveTextContent('Check this');
  });

  it('IMP-5 unmapped rows show Choose a field…', () => {
    renderTable();

    const select = screen.getByRole('combobox', { name: 'Roadmap field for Components' });
    expect(select).toHaveDisplayValue('Choose a field…');
  });

  it('IMP-5 shows the column note as a caption', () => {
    renderTable();

    expect(rowOf('Epic Link')).toHaveTextContent('Used when Parent is empty');
  });

  it('IMP-4 shows the ignored column count', () => {
    renderTable();

    expect(
      screen.getByText("+ 7 other columns aren't needed and will be ignored"),
    ).toBeInTheDocument();
  });

  it('IMP-4 hides the ignored row when nothing was ignored', () => {
    renderTable(FIELDS, 0);

    expect(screen.queryByText(/other columns aren't needed/)).not.toBeInTheDocument();
  });

  it("IMP-4 reports Don't import picked for a column", async () => {
    const onChange = renderTable();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Roadmap field for Components' }),
      "Don't import",
    );

    expect(onChange).toHaveBeenCalledWith('components', 'ignore');
  });

  it('IMP-4 lists every roadmap field with its label', () => {
    renderTable();

    const select = screen.getByRole('combobox', { name: 'Roadmap field for Issue key' });
    const labels = Array.from(select.querySelectorAll('option'), (option) => option.textContent);
    expect(labels).toEqual([
      'Key',
      'Title',
      'Type',
      'Epic',
      'Swimlane / Team',
      'Status',
      'Sprint',
      'Release',
      'Points',
      'Start',
      'End',
      'Tags',
      "Don't import",
    ]);
  });
});
