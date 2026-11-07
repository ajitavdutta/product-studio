import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
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

  const handleUndo = () => {
    if (current?.kind === 'undo') current.onUndo();
    setOpen(false);
  };

  return (
    <SnackbarContext value={api}>
      {children}
      {current && (
        <Snackbar
          key={current.id}
          open={open}
          onClose={handleClose}
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
      )}
    </SnackbarContext>
  );
}

export function useSnackbar(): SnackbarApi {
  const api = useContext(SnackbarContext);
  if (api === null) throw new Error('useSnackbar must be used inside <SnackbarProvider>');
  return api;
}
