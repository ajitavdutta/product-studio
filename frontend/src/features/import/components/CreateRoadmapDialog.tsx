import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import WarningAmber from '@mui/icons-material/WarningAmber';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useId } from 'react';
import type { ImportPreview } from '../../../api/useImports';
import { formatSizeEstimate } from '../../../lib/importMapping/previewFormat';

interface CreateRoadmapDialogProps {
  open: boolean;
  name: string;
  /** Rows in the Jira file (`session.rowCount`). */
  issueCount: number;
  preview: ImportPreview;
  /** The preview is out of date with the mapping; confirming waits for the fresh one. */
  previewStale: boolean;
  creating: boolean;
  /** The server's reason the commit failed, or null. */
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const ICON_SIZE = 20;

function plural(amount: number, singular: string, pluralForm: string): string {
  return `${String(amount)} ${amount === 1 ? singular : pluralForm}`;
}

function unmappedMessage(count: number): string {
  return count === 1
    ? '1 column is still unmapped and will be ignored.'
    : `${String(count)} columns are still unmapped and will be ignored.`;
}

/**
 * IMP-12: confirm the file name, size estimate and unmapped columns before creating.
 * MUI's Dialog traps focus and returns it to the Create button on close.
 */
export function CreateRoadmapDialog({
  open,
  name,
  issueCount,
  preview,
  previewStale,
  creating,
  error,
  onConfirm,
  onCancel,
}: CreateRoadmapDialogProps) {
  const titleId = useId();
  const unmapped = preview.unmappedColumns.length;
  const summary = [
    plural(preview.epics, 'epic', 'epics'),
    plural(preview.document.lanes.length, 'lane', 'lanes'),
    plural(preview.milestones, 'milestone', 'milestones'),
    formatSizeEstimate(preview.sizeEstimateBytes),
  ].join(' · ');

  return (
    <Dialog
      open={open}
      onClose={creating ? undefined : onCancel}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle
        id={titleId}
        sx={{ typography: 'subtitle1', borderBottom: 1, borderColor: 'divider' }}
      >
        Create roadmap
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, '&&': { pt: 2 } }}>
        <Typography variant="body2">
          This creates <b>{name}</b> from {issueCount} Jira issues and saves it as:
        </Typography>
        <Box
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 1.5,
            py: 1.25,
            border: 1,
            borderColor: 'divider',
            borderRadius: `${String(theme.custom.radius.md)}px`,
          })}
        >
          <InsertDriveFileOutlined
            aria-hidden="true"
            sx={{ fontSize: ICON_SIZE, color: 'neutral.muted' }}
          />
          <div>
            <Typography variant="body2" sx={{ fontFamily: 'fontFamilyMono' }}>
              {preview.fileName}
            </Typography>
            <Typography variant="caption" sx={{ color: 'neutral.muted' }}>
              {summary}
            </Typography>
          </div>
        </Box>
        {unmapped > 0 && (
          <Typography
            variant="caption"
            sx={(theme) => ({
              display: 'flex',
              gap: 1,
              px: 1.5,
              py: 1.25,
              bgcolor: 'neutral.noticeTint',
              color: 'text.secondary',
              borderRadius: `${String(theme.custom.radius.md)}px`,
            })}
          >
            <WarningAmber
              aria-hidden="true"
              sx={{ fontSize: ICON_SIZE, color: 'warning.main', flex: 'none' }}
            />
            {unmappedMessage(unmapped)}
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: 'neutral.muted' }}>
          The JSON downloads now. Reopen it later with “Load .json from computer…” to carry on where
          you left off.
        </Typography>
        {error !== null && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button variant="outlined" onClick={onCancel} disabled={creating}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={creating || previewStale}
          loading={creating}
        >
          Create &amp; save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
