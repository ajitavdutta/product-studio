import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SNACKBAR_DURATION_MS,
  SnackbarProvider,
  UNDO_SNACKBAR_DURATION_MS,
  useSnackbar,
} from './SnackbarProvider';

// Long enough for MUI's exit transition to finish and unmount the snackbar. It is advanced
// in its own act(): the transition timer only exists once React has re-rendered with open=false.
const EXIT_TRANSITION_MS = 500;

type Trigger = (api: ReturnType<typeof useSnackbar>) => void;

function Trigger({ onClick }: { onClick: Trigger }) {
  const api = useSnackbar();
  return (
    <button
      type="button"
      onClick={() => {
        onClick(api);
      }}
    >
      Trigger
    </button>
  );
}

function renderAndTrigger(onClick: Trigger) {
  render(
    <SnackbarProvider>
      <Trigger onClick={onClick} />
    </SnackbarProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('SnackbarProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('G-3 hides a plain snackbar after 2.8 s', () => {
    renderAndTrigger((api) => {
      api.notify('Opened payments.json');
    });
    advance(SNACKBAR_DURATION_MS - 1);
    expect(screen.getByText('Opened payments.json')).toBeInTheDocument();

    advance(1);
    advance(EXIT_TRANSITION_MS);

    expect(screen.queryByText('Opened payments.json')).not.toBeInTheDocument();
  });

  it('G-3 keeps an undo snackbar for 6 s and calls onUndo', () => {
    const onUndo = vi.fn();
    renderAndTrigger((api) => {
      api.undoable('Deleted “Approve refund” and 2 connectors', onUndo);
    });

    advance(UNDO_SNACKBAR_DURATION_MS - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('G-3 hides an undo snackbar after 6 s', () => {
    renderAndTrigger((api) => {
      api.undoable('Deleted “Approve refund”', vi.fn());
    });

    advance(UNDO_SNACKBAR_DURATION_MS);
    advance(EXIT_TRANSITION_MS);

    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('shows errors in an error alert', () => {
    renderAndTrigger((api) => {
      api.error("Couldn't save that change");
    });

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save that change");
  });

  it('replaces the current message with a new one', () => {
    let calls = 0;
    renderAndTrigger((api) => {
      calls += 1;
      api.notify(`Message ${String(calls)}`);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    advance(EXIT_TRANSITION_MS);

    expect(screen.queryByText('Message 1')).not.toBeInTheDocument();
  });

  it('throws when useSnackbar is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Trigger onClick={vi.fn()} />)).toThrow(/inside <SnackbarProvider>/);
  });
});
