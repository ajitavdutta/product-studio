import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import type { MappingTemplateRead } from '../../../api/useMappingTemplates';

/** The select value for "None — map manually". */
export const NO_TEMPLATE = '';

interface MappingTemplateSelectProps {
  templates: readonly MappingTemplateRead[];
  /** A template id, or `NO_TEMPLATE`. */
  value: string;
  onChange: (templateId: string) => void;
  loading: boolean;
  /** The error message to show with Retry, or null when the templates loaded. */
  error: string | null;
  onRetry: () => void;
}

const SELECT_SKELETON_HEIGHT = 40;

/** IMP-9: which saved mapping template the upload applies first. */
export function MappingTemplateSelect({
  templates,
  value,
  onChange,
  loading,
  error,
  onRetry,
}: MappingTemplateSelectProps) {
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label="Mapping template"
      sx={(theme) => ({ p: 2, borderRadius: `${String(theme.custom.radius.lg)}px` })}
    >
      <TemplateField
        templates={templates}
        value={value}
        onChange={onChange}
        loading={loading}
        error={error}
        onRetry={onRetry}
      />
    </Paper>
  );
}

function TemplateField({
  templates,
  value,
  onChange,
  loading,
  error,
  onRetry,
}: MappingTemplateSelectProps) {
  if (loading) {
    return (
      <Skeleton
        variant="rounded"
        height={SELECT_SKELETON_HEIGHT}
        aria-label="Loading mapping templates"
      />
    );
  }
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
  return (
    <TextField
      select
      fullWidth
      size="small"
      label="Mapping template"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      helperText="Saved templates re-apply your field mapping next time."
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      {templates.map((template) => (
        <MenuItem key={template.id} value={template.id}>
          {template.name}
        </MenuItem>
      ))}
      <MenuItem value={NO_TEMPLATE}>None — map manually</MenuItem>
    </TextField>
  );
}
