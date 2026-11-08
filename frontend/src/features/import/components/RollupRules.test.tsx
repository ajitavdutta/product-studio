import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLLUP } from '../../../lib/importMapping/mapping';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { RollupRules } from './RollupRules';

function renderRules() {
  const onChange = vi.fn();
  render(<RollupRules rules={DEFAULT_ROLLUP} onChange={onChange} />, {
    wrapper: providersFor(createTestQueryClient()),
  });
  return onChange;
}

describe('RollupRules', () => {
  it('IMP-8 defaults match the spec', () => {
    renderRules();

    const checked = screen.getAllByRole('checkbox').map((box) => (box as HTMLInputElement).checked);
    expect(checked).toEqual([true, true, true, false]);
  });

  it('IMP-8 turns Fix versions into milestones on', async () => {
    const onChange = renderRules();

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Turn Fix versions into milestones' }),
    );

    expect(onChange).toHaveBeenCalledWith('fixVersionsAsMilestones', true);
  });
});
