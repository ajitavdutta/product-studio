import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Portal from '@mui/material/Portal';
import Snackbar, { type SnackbarCloseReason } from '@mui/material/Snackbar';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** G-3: plain snackbars stay 2.8 s; ones that carry Undo stay 6 s. */
export const SNACKBAR_DURATION_MS = 2800;
export const UNDO_SNACKBAR_DURATION_MS = 6000;

interface SnackbarApi {
  notify: (message: string) => void;
  error: (message: string) => void;
  undoable: (message: string, onUndo: () => void) => void;
}

type SnackbarMessage =
  | { kind: 'info'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'undo'; message: string; onUndo: () => void };

const SnackbarContext = createContext<SnackbarApi | null>(null);

/**
 * One bottom-centre snackbar for the whole app.
 * ASSUMPTION: one at a time; a new message replaces the current one.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(SnackbarMessage & { id: number }) | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((message: SnackbarMessage) => {
    setCurrent((previous) => ({ ...message, id: (previous?.id ?? 0) + 1 }));
    setOpen(true);
  }, []);

  const api = useMemo<SnackbarApi>(
    () => ({
      notify: (message) => {
        show({ kind: 'info', message });
      },
      error: (message) => {
        show({ kind: 'error', message });
      },
      undoable: (message, onUndo) => {
        show({ kind: 'undo', message, onUndo });
      },
    }),
    [show],
  );

  const handleClose = (_event: unknown, reason?: SnackbarCloseReason) => {
    // A click elsewhere on the page must not dismiss an Undo before the user can reach it.
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  const handleExited = (id: number) => {
    // A newer message may already have replaced this one.
    setCurrent((previous) => (previous?.id === id ? null : previous));
  };

  const handleUndo = () => {
    if (current?.kind === 'undo') current.onUndo();
    setOpen(false);
  };

  return (
    <SnackbarContext value={api}>
      {children}
      {/*
        A fresh portal per message, removed once it has closed. Created after any open
        dialog, it is not among the elements MUI hides from screen readers behind that
        dialog, so messages raised inside a dialog are still announced (NF-2).
      */}
      {current && (
        <Portal key={current.id}>
          <Snackbar
            open={open}
            onClose={handleClose}
            slotProps={{
              transition: {
                onExited: () => {
                  handleExited(current.id);
                },
              },
            }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            autoHideDuration={
              current.kind === 'undo' ? UNDO_SNACKBAR_DURATION_MS : SNACKBAR_DURATION_MS
            }
            message={current.kind === 'error' ? undefined : current.message}
            action={
              current.kind === 'undo' ? (
                <Button
                  size="small"
                  onClick={handleUndo}
                  sx={{
                    typography: 'caption',
                    color: 'neutral.snackbarAction',
                    textTransform: 'uppercase',
                    fontWeight: 'fontWeightBold',
                  }}
                >
                  Undo
                </Button>
              ) : undefined
            }
          >
            {current.kind === 'error' ? (
              <Alert severity="error" variant="filled" onClose={handleClose}>
                {current.message}
              </Alert>
            ) : undefined}
          </Snackbar>
        </Portal>
      )}
    </SnackbarContext>
  );
}

export function useSnackbar(): SnackbarApi {
  const api = useContext(SnackbarContext);
  if (api === null) throw new Error('useSnackbar must be used inside <SnackbarProvider>');
  return api;
}
