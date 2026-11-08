import WarningAmber from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import type { ImportPreview } from '../../../api/useImports';
import { formatDateRange } from '../../../lib/importMapping/previewFormat';

interface ImportPreviewPanelProps {
  /** The latest preview, or the previous one while the next loads; undefined before the first. */
  preview: ImportPreview | undefined;
  /** A newer preview is loading while `preview` is still shown. */
  refreshing: boolean;
  /** The error message to show with Retry, or null. */
  error: string | null;
  onRetry: () => void;
}

// Prototype `.key`: epic keys sit in a fixed-width mono column.
const KEY_COLUMN_WIDTH = 62;
const WARNING_ICON_SIZE = 16;
const STAT_SKELETON_HEIGHT = 58;
const EPIC_SKELETON_ROWS = 5;

/** IMP-11: counts, warnings and the first five epics for the current mapping. */
export function ImportPreviewPanel({
  preview,
  refreshing,
  error,
  onRetry,
}: ImportPreviewPanelProps) {
  const headingId = useId();
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={headingId}
      aria-busy={refreshing || (preview === undefined && error === null)}
      sx={(theme) => ({
        position: 'relative',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        borderRadius: `${String(theme.custom.radius.lg)}px`,
        overflow: 'hidden',
      })}
    >
      {refreshing && (
        <LinearProgress
          aria-label="Updating the preview"
          sx={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        />
      )}
      <Typography id={headingId} variant="subtitle2" component="h2">
        Preview
      </Typography>
      <PreviewBody preview={preview} error={error} onRetry={onRetry} />
    </Paper>
  );
}

function PreviewBody({
  preview,
  error,
  onRetry,
}: Pick<ImportPreviewPanelProps, 'preview' | 'error' | 'onRetry'>) {
  if (error !== null) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }
  if (!preview) {
    return (
      <Box aria-label="Loading the preview">
        <Skeleton variant="rounded" height={STAT_SKELETON_HEIGHT} />
        {Array.from({ length: EPIC_SKELETON_ROWS }, (_unused, row) => (
          <Skeleton key={row} variant="text" />
        ))}
      </Box>
    );
  }
  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
        <Stat label="Epics" value={preview.epics} />
        <Stat label="Issues" value={preview.issues} />
        <Stat label="Teams" value={preview.teams} />
      </Box>
      <Warnings warnings={preview.warnings} />
      <EpicList preview={preview} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box
      sx={(theme) => ({
        border: 1,
        borderColor: 'divider',
        borderRadius: `${String(theme.custom.radius.lg)}px`,
        px: 1.5,
        py: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
      })}
    >
      <Typography
        variant="overline"
        component="span"
        sx={{ color: 'neutral.muted', letterSpacing: 0, textTransform: 'none' }}
      >
        {label}
      </Typography>
      <Typography variant="h2" component="span">
        {value}
      </Typography>
    </Box>
  );
}

function Warnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Box
      component="ul"
      aria-label="Import warnings"
      sx={(theme) => ({
        listStyle: 'none',
        m: 0,
        px: 1.5,
        py: 1.25,
        bgcolor: 'neutral.noticeTint',
        borderRadius: `${String(theme.custom.radius.md)}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      })}
    >
      {warnings.map((warning) => (
        <Typography
          key={warning}
          component="li"
          variant="caption"
          sx={{ display: 'flex', gap: 1, color: 'text.secondary' }}
        >
          <WarningAmber
            aria-hidden="true"
            sx={{ fontSize: WARNING_ICON_SIZE, color: 'warning.main', flex: 'none' }}
          />
          {warning}
        </Typography>
      ))}
    </Box>
  );
}

function EpicList({ preview }: { preview: ImportPreview }) {
  if (preview.firstEpics.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: 'neutral.muted' }}>
        No epics yet. Map Key, Title and Epic to see them here.
      </Typography>
    );
  }
  return (
    <div>
      <Box component="ul" aria-label="First epics" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {preview.firstEpics.map((epic) => (
          <Typography
            key={epic.key}
            component="li"
            variant="caption"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.75,
              borderBottom: 1,
              borderColor: 'neutral.borderSubtle',
            }}
          >
            <Box
              component="span"
              sx={{
                width: KEY_COLUMN_WIDTH,
                flex: 'none',
                fontFamily: 'fontFamilyMono',
                color: 'primary.dark',
              }}
            >
              {epic.key}
            </Box>
            <Box
              component="span"
              sx={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {epic.title}
            </Box>
            <Box component="span" sx={{ color: 'neutral.muted', whiteSpace: 'nowrap' }}>
              {formatDateRange(epic.start, epic.end)}
            </Box>
          </Typography>
        ))}
      </Box>
      {preview.moreEpics > 0 && (
        <Typography variant="caption" component="p" sx={{ color: 'neutral.muted', pt: 1, m: 0 }}>
          + {preview.moreEpics} more {preview.moreEpics === 1 ? 'epic' : 'epics'}
        </Typography>
      )}
    </div>
  );
}
