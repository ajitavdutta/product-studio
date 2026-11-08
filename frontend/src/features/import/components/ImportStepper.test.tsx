import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImportStepper } from './ImportStepper';

describe('ImportStepper', () => {
  it('marks the current step with aria-current="step"', () => {
    render(<ImportStepper active={1} />);

    const steps = within(screen.getByRole('list', { name: 'Import steps' }));
    const current = steps
      .getAllByRole('listitem')
      .filter((step) => step.hasAttribute('aria-current'));
    expect(current.map((step) => [step.textContent, step.getAttribute('aria-current')])).toEqual([
      ['2Map fields', 'step'],
    ]);
  });
});
