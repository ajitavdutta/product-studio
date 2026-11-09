import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useId, type ReactNode } from 'react';
import type { MappingTemplateRead } from '../../../api/useMappingTemplates';
import type { ResyncChange, RoadmapResyncRead } from '../../../api/useResync';
import {
  applyLabel,
  AUTOMATIC_MAPPING,
  changeText,
  groupChanges,
} from '../../../lib/roadmap/resync';
import { UploadDropZone } from '../../import/components/UploadDropZone';

interface ResyncDialogProps {
  // Step 1: upload.
  templates: readonly MappingTemplateRead[];
  templatesLoading: boolean;
  templatesError: string | null;
  onRetryTemplates: () => void;
  /** A template id, or `AUTOMATIC_MAPPING`. */
  templateId: string;
  onTemplateChange: (templateId: string) => void;
  /** The file being uploaded, while the diff is computed. */
  uploading: File | null;
  /** The server's reason the last upload or apply failed, shown on step 1. */
  uploadError: string | null;
  onFile: (file: File) => void;
  // Step 2: review. Null while on step 1.
  resync: RoadmapResyncRead | null;
  selected: ReadonlySet<string>;
  onToggle: (changeId: string) => void;
  applying: boolean;
  /** Autosave is still sending edits; the diff's base revision would be stale. */
  saving: boolean;
  /** An apply failure that keeps the review open (e.g. 422). */
  applyError: string | null;
  onApply: () => void;
  onBack: () => void;
  onClose: () => void;
}

const SELECT_SKELETON_HEIGHT = 40;
const ARROW = '→';

function ChangeLine({ change }: { change: ResyncChange }) {
  const { label, before, after } = changeText(change);
  return (
    <span>
      <b>{change.itemKey}</b> {label}:{' '}
      {before !== null && (
        <>
          {before} {ARROW}{' '}
        </>
      )}
      <b>{after}</b>
    </span>
  );
}

function ChangeCheckbox({
  change,
  checked,
  onToggle,
  note,
}: {
  change: ResyncChange;
  checked: boolean;
  onToggle: (changeId: string) => void;
  note?: ReactNode;
}) {
  return (
    <Box component="li">
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={checked}
            onChange={() => {
              onToggle(change.id);
            }}
          />
        }
        label={<ChangeLine change={change} />}
        slotProps={{ typography: { variant: 'body2' } }}
      />
      {note}
    </Box>
  );
}

const listSx = { m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' } as const;

function TemplateField(
  props: Pick<
    ResyncDialogProps,
    | 'templates'
    | 'templatesLoading'
    | 'templatesError'
    | 'onRetryTemplates'
    | 'templateId'
    | 'onTemplateChange'
  >,
) {
  if (props.templatesLoading) {
    return (
      <Skeleton
        variant="rounded"
        height={SELECT_SKELETON_HEIGHT}
        aria-label="Loading mapping templates"
      />
    );
  }
  if (props.templatesError !== null) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={props.onRetryTemplates}>
            Retry
          </Button>
        }
      >
        {props.templatesError}
      </Alert>
    );
  }
  const known = props.templates.some((template) => template.id === props.templateId);
  return (
    <TextField
      select
      fullWidth
      size="small"
      label="Mapping template"
      value={known ? props.templateId : AUTOMATIC_MAPPING}
      onChange={(event) => {
        props.onTemplateChange(event.target.value);
      }}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      {props.templates.map((template) => (
        <MenuItem key={template.id} value={template.id}>
          {template.name}
        </MenuItem>
      ))}
      <MenuItem value={AUTOMATIC_MAPPING}>Automatic — match columns by name</MenuItem>
    </TextField>
  );
}

function Review(props: ResyncDialogProps & { resync: RoadmapResyncRead }) {
  const { resync, selected, onToggle } = props;
  const groups = groupChanges(resync.changes);
  return (
    <>
      <Typography variant="body2">
        Comparing{' '}
        <Box component="span" sx={{ fontFamily: 'fontFamilyMono' }}>
          {resync.fileName}
        </Box>{' '}
        with your roadmap
        {resync.templateName ? ` using “${resync.templateName}”` : ''}:
      </Typography>
      {resync.changes.length === 0 ? (
        <Typography variant="body2">This export matches your roadmap.</Typography>
      ) : (
        <>
          {groups.updates.length > 0 && (
            <Box component="ul" aria-label="Changes from Jira" sx={listSx}>
              {groups.updates.map((change) => (
                <ChangeCheckbox
                  key={change.id}
                  change={change}
                  checked={selected.has(change.id)}
                  onToggle={onToggle}
                />
              ))}
            </Box>
          )}
          {groups.conflicts.length > 0 && (
            <Box component="section" aria-label="Conflicts">
              <Typography variant="subtitle2" component="h3">
                Conflicts
              </Typography>
              <Typography variant="caption" color="text.secondary">
                You edited these by hand. Tick one to take Jira's value instead.
              </Typography>
              <Box component="ul" sx={listSx}>
                {groups.conflicts.map((change) => (
                  <ChangeCheckbox
                    key={change.id}
                    change={change}
                    checked={selected.has(change.id)}
                    onToggle={onToggle}
                    note={
                      change.conflictReason ? (
                        <Typography
                          variant="caption"
                          component="p"
                          sx={{ m: 0, ml: 4, color: 'neutral.warningText' }}
                        >
                          {change.conflictReason}
                        </Typography>
                      ) : null
                    }
                  />
                ))}
              </Box>
            </Box>
          )}
          {groups.alreadyApplied.length > 0 && (
            <Box
              component="ul"
              aria-label="Already applied"
              sx={{ m: 0, pl: 2.25, typography: 'body2', lineHeight: 1.8 }}
            >
              {groups.alreadyApplied.map((change) => (
                <li key={change.id}>
                  <ChangeLine change={change} /> (already applied)
                </li>
              ))}
            </Box>
          )}
        </>
      )}
      {resync.unchanged > 0 && (
        <Typography variant="caption" color="text.secondary">
          {resync.unchanged === 1
            ? '1 item is unchanged.'
            : `${String(resync.unchanged)} items are unchanged.`}
        </Typography>
      )}
      {resync.warnings.length > 0 && (
        // Not role="alert": warnings come with the diff, they are not an interruption.
        <Alert severity="warning" role="status">
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {resync.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </Box>
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary">
        Your PM notes, milestones and manual edits are kept.
      </Typography>
    </>
  );
}

/**
 * RM-15: upload a newer Jira export (step 1), then review and apply the diff (step 2).
 * MUI's Dialog traps focus and returns it to the Re-sync button on close.
 */
export function ResyncDialog(props: ResyncDialogProps) {
  const titleId = useId();
  const { resync } = props;
  const empty = resync?.changes.length === 0;
  const count = props.selected.size;

  return (
    <Dialog open onClose={props.onClose} aria-labelledby={titleId} maxWidth="sm" fullWidth>
      <DialogTitle id={titleId}>Re-sync from a new Jira export</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {resync ? (
          <Review {...props} resync={resync} />
        ) : (
          <>
            <Typography variant="body2">
              Upload a newer export of the same Jira project. You choose which changes to apply.
            </Typography>
            <TemplateField {...props} />
            <UploadDropZone
              onFile={props.onFile}
              uploading={props.uploading}
              error={props.uploadError}
            />
          </>
        )}
      </DialogContent>
      {/* Outside the scrolling list, next to Apply, so a failure is never scrolled out of sight. */}
      {resync && props.applyError !== null && (
        <Alert severity="error" sx={{ mx: 3, mt: 1.5 }}>
          {props.applyError}
        </Alert>
      )}
      <DialogActions>
        {resync && !empty && (
          <Button onClick={props.onBack} sx={{ mr: 'auto' }}>
            Use another file
          </Button>
        )}
        <Button variant="outlined" onClick={props.onClose}>
          {empty ? 'Close' : 'Cancel'}
        </Button>
        {resync && !empty && (
          <Button
            variant="contained"
            disabled={count === 0 || props.saving || props.applying}
            onClick={props.onApply}
          >
            {props.applying ? 'Applying…' : props.saving ? 'Saving your edits…' : applyLabel(count)}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
