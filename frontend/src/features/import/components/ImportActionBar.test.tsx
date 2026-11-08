import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { RequiredField } from '../../../lib/importMapping/mapping';
import { createTestQueryClient, providersFor } from '../../../test/providers';
import { ImportActionBar } from './ImportActionBar';

const Providers = providersFor(createTestQueryClient());

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <MemoryRouter>{children}</MemoryRouter>
    </Providers>
  );
}

function renderBar(
  overrides: {
    name?: string;
    missingRequired?: RequiredField[];
    hasTemplate?: boolean;
    onCreate?: () => void;
    onNameChange?: (name: string) => void;
  } = {},
) {
  render(
    <ImportActionBar
      name={overrides.name ?? 'Payments export'}
      onNameChange={overrides.onNameChange ?? vi.fn()}
      fileName="payments-export.json"
      hasTemplate={overrides.hasTemplate ?? false}
      updateTemplate
      onUpdateTemplateChange={vi.fn()}
      missingRequired={overrides.missingRequired ?? []}
      previewReady
      onCreate={overrides.onCreate ?? vi.fn()}
    />,
    { wrapper: Wrapper },
  );
}

const CREATE = { name: 'Create roadmap & save JSON' };

describe('ImportActionBar', () => {
  it('IMP-10 disables create until Key and Title are mapped', () => {
    renderBar({ missingRequired: ['title'] });

    expect(screen.getByRole('button', CREATE)).toHaveAccessibleDescription(
      'Map Key and Title to continue',
    );
  });

  it('IMP-10 the disabled create button cannot be pressed', () => {
    renderBar({ missingRequired: ['key', 'title'] });

    expect(screen.getByRole('button', CREATE)).toBeDisabled();
  });

  it('IMP-12 create opens the confirmation once the mapping is complete', async () => {
    const onCreate = vi.fn();
    renderBar({ onCreate });

    await userEvent.click(screen.getByRole('button', CREATE));

    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('IMP-12 disables create while the name is blank', () => {
    renderBar({ name: '  ' });

    expect(screen.getByRole('button', CREATE)).toBeDisabled();
  });

  it('IMP-12 Save as is read-only and shows the server file name', () => {
    renderBar();

    expect(screen.getByRole('textbox', { name: 'Save as' })).toHaveAttribute('readonly');
  });

  it('IMP-12 Back returns to the upload step', () => {
    renderBar();

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/import');
  });

  it('IMP-9 offers to update the template when the upload used one', () => {
    renderBar({ hasTemplate: true });

    expect(screen.getByRole('checkbox', { name: 'Update mapping template' })).toBeChecked();
  });

  it('IMP-9 offers to save a template when the upload used none', () => {
    renderBar({ hasTemplate: false });

    expect(screen.getByRole('checkbox', { name: 'Save as mapping template' })).toBeInTheDocument();
  });
});
