import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, providersFor } from '../test/providers';
import { ZoomControl } from './ZoomControl';

function renderControl(zoom: number) {
  const props = { zoom, min: 0.5, max: 3, onStep: vi.fn(), onReset: vi.fn(), onFit: vi.fn() };
  render(<ZoomControl {...props} />, { wrapper: providersFor(createTestQueryClient()) });
  return props;
}

describe('ZoomControl', () => {
  it('RM-20 shows the percentage as the reset button label', () => {
    renderControl(1.25);

    expect(screen.getByRole('button', { name: 'Zoom 125%, reset to 100%' })).toHaveTextContent(
      '125%',
    );
  });

  it('RM-20 + and − step in their direction', async () => {
    const props = renderControl(1);

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

    expect(props.onStep.mock.calls).toEqual([[1], [-1]]);
  });

  it('RM-20 percentage resets and Fit fits', async () => {
    const props = renderControl(2);

    await userEvent.click(screen.getByRole('button', { name: /reset to 100%/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Fit' }));

    expect([props.onReset, props.onFit].map((handler) => handler.mock.calls.length)).toEqual([
      1, 1,
    ]);
  });

  it('RM-20 zoom out is disabled at the minimum', () => {
    renderControl(0.5);

    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('RM-20 zoom in is disabled at the maximum', () => {
    renderControl(3);

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });
});
