import ArrowForward from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import { useId } from 'react';
import { Link as RouterLink } from 'react-router';
import type { RequiredField } from '../../../lib/importMapping/mapping';

interface ImportActionBarProps {
  name: string;
  onNameChange: (name: string) => void;
  /** The server's file name for the current name (`preview.fileName`); empty until known. */
  fileName: string;
  /** The upload applied a mapping template, so the checkbox updates it rather than saving one. */
  hasTemplate: boolean;
  updateTemplate: boolean;
  onUpdateTemplateChange: (value: boolean) => void;
  /** IMP-10: required fields no column is mapped to. */
  missingRequired: readonly RequiredField[];
  /** False until a preview exists to confirm against. */
  previewReady: boolean;
  onCreate: () => void;
}

// Matches `ImportMapping.name` on the backend (1–200 characters).
const NAME_MAX_LENGTH = 200;
// Prototype `.actionbar`: the two fields grow from these widths, then wrap.
const NAME_FIELD_BASIS = 240;
const FILE_FIELD_BASIS = 260;

function blockingReason(name: string, missingRequired: readonly RequiredField[]): string | null {
  if (missingRequired.length > 0) return 'Map Key and Title to continue';
  if (name.trim() === '') return 'Enter a roadmap name to continue';
  return null;
}

/** IMP-12: roadmap name, Save as, the template checkbox, Back and Create. */
export function ImportActionBar({
  name,
  onNameChange,
  fileName,
  hasTemplate,
  updateTemplate,
  onUpdateTemplateChange,
  missingRequired,
  previewReady,
  onCreate,
}: ImportActionBarProps) {
  const reasonId = useId();
  const reason = blockingReason(name, missingRequired);

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label="Create the roadmap"
      sx={(theme) => ({
        p: 2,
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 2,
        borderRadius: `${String(theme.custom.radius.lg)}px`,
      })}
    >
      <TextField
        size="small"
        label="Roadmap name"
        value={name}
        onChange={(event) => {
          onNameChange(event.target.value);
        }}
        slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
        sx={{ flex: `1 1 ${String(NAME_FIELD_BASIS)}px` }}
      />
      {/* User decision 2026-11-08: Save as follows the roadmap name and can't be edited. */}
      <TextField
        size="small"
        label="Save as"
        value={fileName}
        helperText="Follows the roadmap name"
        slotProps={{
          htmlInput: { readOnly: true },
          input: { sx: { fontFamily: 'fontFamilyMono' } },
          inputLabel: { shrink: true },
        }}
        sx={{ flex: `1 1 ${String(FILE_FIELD_BASIS)}px` }}
      />
      <FormControlLabel
        label={hasTemplate ? 'Update mapping template' : 'Save as mapping template'}
        slotProps={{ typography: { variant: 'body2' } }}
        control={
          <Checkbox
            size="small"
            checked={updateTemplate}
            onChange={(event) => {
              onUpdateTemplateChange(event.target.checked);
            }}
          />
        }
        sx={{ mr: 0 }}
      />
      <Box sx={{ flex: '1 0 0', display: { xs: 'none', sm: 'block' } }} />
      <Box
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 0.5,
          // On a phone the buttons share one full-width row instead of wrapping apart.
          [theme.custom.media.mobile]: { width: '100%', '& .MuiButton-root': { flex: '1 1 auto' } },
        })}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            alignSelf: 'stretch',
          }}
        >
          <Button variant="outlined" size="large" component={RouterLink} to="/import">
            Back
          </Button>
          <Button
            variant="contained"
            size="large"
            endIcon={<ArrowForward />}
            disabled={reason !== null || !previewReady}
            aria-describedby={reason ? reasonId : undefined}
            onClick={onCreate}
          >
            Create roadmap &amp; save JSON
          </Button>
        </Box>
        {reason && <FormHelperText id={reasonId}>{reason}</FormHelperText>}
      </Box>
    </Paper>
  );
}
