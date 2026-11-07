import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { RouteError } from './RouteError';

function ThrowingPage(): never {
  throw new Error('boom');
}

describe('RouteError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Reload when a route throws', () => {
    // React and the router log the thrown error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderApp('/', [{ path: '/', element: <ThrowingPage />, errorElement: <RouteError /> }]);

    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('offers a link home when a route throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderApp('/', [{ path: '/', element: <ThrowingPage />, errorElement: <RouteError /> }]);

    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });
});
