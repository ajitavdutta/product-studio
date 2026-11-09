import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import example from '../../../../../docs/examples/roadmap.example.json';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { ManagePisDialog } from './ManagePisDialog';

const DOCUMENT = example as RoadmapDocument;
const { timeline } = DOCUMENT;

function renderDialog() {
  const props = { onSave: vi.fn(), onClose: vi.fn() };
  render(
    <ManagePisDialog
      open
      pis={timeline.pis}
      sprintLengthDays={timeline.sprintLengthDays}
      cadence={{ sprintsPerPi: 4, ipSprint: false }}
      timelineStart={timeline.start}
      today="2026-11-06"
      {...props}
    />,
    { wrapper: providersFor(createTestQueryClient()) },
  );
  return props;
}

function preview() {
  return within(screen.getByRole('region', { name: 'Preview' }));
}

describe('ManagePisDialog', () => {
  it('RM-4 Manage PIs preview updates live', async () => {
    renderDialog();
    const name = screen.getByLabelText('PI 1 name');

    await userEvent.clear(name);
    await userEvent.type(name, 'Winter PI');

    expect(preview().getByText('Winter PI')).toBeInTheDocument();
  });

  it('RM-4 preview shows the IP tick only while IP is on', async () => {
    renderDialog();

    await userEvent.click(screen.getByLabelText('PI 1 IP sprint'));

    expect(preview().getAllByText('IP')).toHaveLength(2);
  });

  it('RM-4 overlapping PIs block Save', async () => {
    renderDialog();
    const start = screen.getByLabelText('PI 2 start');

    await userEvent.clear(start);
    await userEvent.type(start, '2026-12-21');

    expect({
      startError: start.getAttribute('aria-invalid'),
      saveDisabled: screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
    }).toEqual({ startError: 'true', saveDisabled: true });
    expect(screen.getByText('PI 1 · 2027 starts before PI 4 · 2026 ends')).toBeInTheDocument();
  });

  it('RM-4 an empty name blocks Save', async () => {
    renderDialog();

    await userEvent.clear(screen.getByLabelText('PI 3 name'));

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('RM-4 Save sends one set op', async () => {
    const { onSave } = renderDialog();

    await userEvent.clear(screen.getByLabelText('PI 3 sprints'));
    await userEvent.type(screen.getByLabelText('PI 3 sprints'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith([
      {
        op: 'set',
        path: '/timeline/pis',
        value: timeline.pis.map((pi) => (pi.id === 'pi-3' ? { ...pi, sprints: 5 } : pi)),
      },
    ]);
  });

  it('RM-4 Add PI starts after the last PI with the Settings cadence', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Add PI' }));

    expect({
      name: screen.getByLabelText<HTMLInputElement>('PI 4 name').value,
      start: screen.getByLabelText<HTMLInputElement>('PI 4 start').value,
      sprints: screen.getByLabelText<HTMLInputElement>('PI 4 sprints').value,
    }).toEqual({ name: 'PI 4', start: '2027-06-14', sprints: '4' });
  });

  it('RM-4 removes a PI by its labelled button', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Remove PI 2 · 2027' }));

    expect(preview().queryByText('PI 2 · 2027')).not.toBeInTheDocument();
  });
});
