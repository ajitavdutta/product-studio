import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Skeleton from '@mui/material/Skeleton';
import { useId } from 'react';

interface DeleteDocumentDialogProps {
  open: boolean;
  /** The document's name, for the title. */
  name: string;
  /** The server's sentence naming what deleting it unlinks; null until it loads. */
  message: string | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * The confirmation that names what a delete cascades to (CLAUDE.md: destructive actions).
 * Delete stays disabled until the message has loaded, so nobody confirms blind.
 * MUI's Dialog traps focus and restores it on close.
 */
export function DeleteDocumentDialog({
  open,
  name,
  message,
  loading,
  error,
  onRetry,
  onConfirm,
  onClose,
}: DeleteDocumentDialogProps) {
  const titleId = useId();
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={titleId} fullWidth maxWidth="xs">
      <DialogTitle id={titleId}>Delete “{name}”?</DialogTitle>
      <DialogContent>
        <ImpactMessage message={message} loading={loading} error={error} onRetry={onRetry} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" color="error" disabled={message === null} onClick={onConfirm}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ImpactMessage({
  message,
  loading,
  error,
  onRetry,
}: Pick<DeleteDocumentDialogProps, 'message' | 'loading' | 'error' | 'onRetry'>) {
  if (loading) {
    return <Skeleton variant="text" aria-label="Checking what this unlinks" />;
  }
  if (error || message === null) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        Couldn't check what this would unlink.
      </Alert>
    );
  }
  return <DialogContentText>{message}</DialogContentText>;
}
