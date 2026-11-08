import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { formatFileSize } from '../../../lib/importMapping/previewFormat';

interface UploadDropZoneProps {
  onFile: (file: File) => void;
  /** The file being uploaded, shown with its size while the upload runs. */
  uploading: File | null;
  /** The server's reason for rejecting the last file (413 or 422), or null. */
  error: string | null;
}

/** IMP-1: the file types the importer reads (`.txt` for CSVs saved under another name). */
export const JIRA_EXPORT_ACCEPT = '.csv,.json,.xml,.txt';

// Prototype `.drop`.
const DROP_MIN_HEIGHT = 220;
const DROP_BORDER_WIDTH = 2;
const UPLOAD_ICON_SIZE = 40;
const PROGRESS_MAX_WIDTH = 320;
const FOCUS_RING_WIDTH = 2;
const FOCUS_RING_OFFSET = 2;
/** A labelled drop area around a real file input: drop a file, or click (or press Enter) to pick one. */
export function UploadDropZone({ onFile, uploading, error }: UploadDropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragOver, setDragOver] = useState(false);
  const busy = uploading !== null;

  const acceptDrag = (event: DragEvent) => {
    // Without preventDefault the browser opens the dropped file instead of firing drop.
    event.preventDefault();
    if (!busy) setDragOver(true);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) onFile(file);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        component="label"
        onDragEnter={acceptDrag}
        onDragOver={acceptDrag}
        onDragLeave={() => {
          setDragOver(false);
        }}
        onDrop={drop}
        aria-busy={busy || undefined}
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          minHeight: DROP_MIN_HEIGHT,
          p: 3,
          textAlign: 'center',
          cursor: busy ? 'progress' : 'pointer',
          border: `${String(DROP_BORDER_WIDTH)}px dashed`,
          borderColor: dragOver ? 'primary.main' : 'neutral.progressTrack',
          bgcolor: dragOver ? 'neutral.primaryTint' : 'neutral.primaryTintSoft',
          borderRadius: `${String(theme.custom.radius.lg)}px`,
          '&:hover': { borderColor: 'primary.main' },
          // The input is visually hidden, so its keyboard focus is shown on the drop area.
          '&:has(input:focus-visible)': {
            outline: `${String(FOCUS_RING_WIDTH)}px solid ${theme.palette.primary.main}`,
            outlineOffset: FOCUS_RING_OFFSET,
          },
        })}
      >
        <CloudUploadOutlined
          aria-hidden
          sx={{ fontSize: UPLOAD_ICON_SIZE, color: 'primary.main' }}
        />
        <Typography variant="subtitle1" component="span" sx={{ color: 'text.primary' }}>
          Drop your Jira export here
        </Typography>
        {busy ? (
          <Box sx={{ width: '100%', maxWidth: PROGRESS_MAX_WIDTH }}>
            <Typography
              variant="body2"
              component="span"
              id={hintId}
              sx={{ color: 'neutral.muted', display: 'block', mb: 1 }}
            >
              Uploading{' '}
              <Box component="span" sx={{ fontFamily: 'fontFamilyMono' }}>
                {uploading.name}
              </Box>{' '}
              · {formatFileSize(uploading.size)}
            </Typography>
            <LinearProgress aria-label={`Uploading ${uploading.name}`} />
          </Box>
        ) : (
          <Typography variant="body2" component="span" id={hintId} sx={{ color: 'neutral.muted' }}>
            or click to choose a file · CSV, JSON or XML
          </Typography>
        )}
        <Box
          component="input"
          ref={input}
          type="file"
          accept={JIRA_EXPORT_ACCEPT}
          disabled={busy}
          aria-describedby={hintId}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            // Clear it so choosing the same file again (after a rejection) still fires a change.
            event.target.value = '';
            if (file) onFile(file);
          }}
          sx={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        />
      </Box>
      {error !== null && !busy && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => input.current?.click()}>
              Choose another file
            </Button>
          }
        >
          {error}
        </Alert>
      )}
    </Box>
  );
}
