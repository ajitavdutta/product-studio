import DownloadIcon from '@mui/icons-material/Download';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useId, useMemo } from 'react';
import type { RoadmapDocument } from '../../../api/useRoadmap';

interface SaveJsonDialogProps {
  open: boolean;
  document: RoadmapDocument;
  fileName: string;
  /** The backend's `.json` for this roadmap (ADR-1: the browser never builds the file). */
  downloadUrl: string;
  /** Autosave still has edits in flight; the server's file would miss them. */
  saving: boolean;
  onCopy: (json: string) => void;
  onClose: () => void;
}

// Prototype `.code`: scrolls inside itself rather than growing the dialog.
const CODE_MAX_HEIGHT = 360;
const CODE_LINE_HEIGHT = 1.55;
const JSON_INDENT = 2;

/** RM-16: the exact document, with Copy JSON and a Download served by the backend. */
export function SaveJsonDialog({
  open,
  document,
  fileName,
  downloadUrl,
  saving,
  onCopy,
  onClose,
}: SaveJsonDialogProps) {
  const titleId = useId();
  const json = useMemo(() => JSON.stringify(document, null, JSON_INDENT), [document]);

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={titleId} maxWidth="md" fullWidth>
      <DialogTitle id={titleId}>Save roadmap JSON</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="body2">
          Saves{' '}
          <Box component="span" sx={{ fontFamily: 'fontFamilyMono' }}>
            {fileName}
          </Box>
          . Everything below comes back when you open the file again.
        </Typography>
        <Box
          component="pre"
          tabIndex={0}
          aria-label="Roadmap JSON"
          sx={(theme) => ({
            m: 0,
            px: 2,
            py: 1.75,
            bgcolor: 'neutral.codeBackground',
            color: 'neutral.codeText',
            borderRadius: `${String(theme.custom.radius.lg)}px`,
            fontFamily: 'fontFamilyMono',
            fontSize: theme.typography.caption.fontSize,
            lineHeight: CODE_LINE_HEIGHT,
            whiteSpace: 'pre',
            overflow: 'auto',
            maxHeight: CODE_MAX_HEIGHT,
          })}
        >
          {json}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="outlined"
          onClick={() => {
            onCopy(json);
          }}
        >
          Copy JSON
        </Button>
        <Button
          variant="contained"
          component="a"
          href={downloadUrl}
          download={fileName}
          disabled={saving}
          startIcon={<DownloadIcon />}
        >
          {saving ? 'Saving…' : 'Download'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
