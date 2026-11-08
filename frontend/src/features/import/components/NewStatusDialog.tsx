import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useId, useState, type SyntheticEvent } from 'react';
import type { TeamColor } from '../../../lib/importMapping/mapping';

interface NewStatusDialogProps {
  /** The Jira status that will map to the new status; null keeps the dialog closed. */
  jiraStatus: string | null;
  /** Names already in use (defaults and custom), compared case-insensitively. */
  takenNames: readonly string[];
  onCreate: (name: string, color: TeamColor) => void;
  onClose: () => void;
}

/** The team colour tokens, in palette order, with their spoken names. */
export const TEAM_COLOR_LABELS: Readonly<Record<TeamColor, string>> = {
  blue: 'Blue',
  deepOrange: 'Deep orange',
  blueGrey: 'Blue grey',
  purple: 'Purple',
  teal: 'Teal',
  brown: 'Brown',
};
const TEAM_COLORS = Object.keys(TEAM_COLOR_LABELS) as TeamColor[];

// Matches `CustomStatus.name` on the backend (1–40 characters).
const NAME_MAX_LENGTH = 40;
const SWATCH_SIZE = 20;

/**
 * IMP-7 (user decision 2026-11-08): "New status…" asks for a name and a team colour.
 * MUI's Dialog traps focus and returns it to the select on close.
 */
export function NewStatusDialog({
  jiraStatus,
  takenNames,
  onCreate,
  onClose,
}: NewStatusDialogProps) {
  const titleId = useId();
  return (
    <Dialog
      open={jiraStatus !== null}
      onClose={onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id={titleId}>New status</DialogTitle>
      {/* Unmounted while closed, so each opening starts with an empty form. */}
      {jiraStatus !== null && (
        <NewStatusForm
          jiraStatus={jiraStatus}
          takenNames={takenNames}
          onCreate={onCreate}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function NewStatusForm({
  jiraStatus,
  takenNames,
  onCreate,
  onClose,
}: Omit<NewStatusDialogProps, 'jiraStatus'> & { jiraStatus: string }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<TeamColor>(TEAM_COLORS[0] ?? 'blue');
  const [submitted, setSubmitted] = useState(false);
  const colorLabelId = useId();

  const trimmed = name.trim();
  const duplicate = takenNames.some((taken) => taken.toLowerCase() === trimmed.toLowerCase());
  const problem =
    trimmed === ''
      ? 'Enter a name'
      : duplicate
        ? `There's already a status called “${trimmed}”`
        : null;

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (problem) return;
    onCreate(trimmed, color);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0 }}>
        <Typography variant="body2" sx={{ color: 'neutral.muted' }}>
          “{jiraStatus}” will map to this status.
        </Typography>
        <TextField
          autoFocus
          required
          label="Status name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          error={submitted && problem !== null}
          helperText={submitted ? problem : undefined}
          slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
        />
        <Box>
          <Typography id={colorLabelId} variant="body2" sx={{ mb: 0.75 }}>
            Colour
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={color}
            aria-labelledby={colorLabelId}
            onChange={(_event, next: TeamColor | null) => {
              // Exclusive groups report null when the chosen swatch is pressed again; keep it.
              if (next) setColor(next);
            }}
            sx={{ flexWrap: 'wrap' }}
          >
            {TEAM_COLORS.map((option) => (
              <ToggleButton key={option} value={option} aria-label={TEAM_COLOR_LABELS[option]}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: SWATCH_SIZE,
                    height: SWATCH_SIZE,
                    borderRadius: '50%',
                    bgcolor: `team.${option}`,
                  }}
                />
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" type="submit">
          Add status
        </Button>
      </DialogActions>
    </form>
  );
}
