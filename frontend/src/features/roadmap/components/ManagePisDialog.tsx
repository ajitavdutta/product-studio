import AddIcon from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useId, useState } from 'react';
import type { components } from '../../../api/types';
import type { DocumentOp } from '../../../lib/documentOps/applyOps';
import {
  isDatablePi,
  newPi,
  PI_SPRINTS_MAX,
  PI_SPRINTS_MIN,
  type PiField,
  piProblems,
  piSaveOps,
  type ProgramIncrement,
} from '../../../lib/roadmap/pis';
import { type DateRange, programIncrements, toDay } from '../../../lib/timeline';
import { TimelineHeader } from './TimelineHeader';

type PiCadence = components['schemas']['PiCadence'];

interface ManagePisDialogProps {
  open: boolean;
  /** The document's PIs when the dialog opened; the dialog edits a draft copy. */
  pis: readonly ProgramIncrement[];
  sprintLengthDays: number;
  /** Settings' cadence for a new PI. */
  cadence: PiCadence;
  /** Where the first PI starts when there are none. */
  timelineStart: string;
  today: string;
  onSave: (ops: DocumentOp[]) => void;
  onClose: () => void;
}

/** The preview header is drawn at this width and scrolls if the dialog is narrower. */
const PREVIEW_WIDTH = 860;
const NAME_FIELD_MIN_WIDTH = 160;
const NUMBER_FIELD_WIDTH = 96;

function messageFor(
  problems: ReturnType<typeof piProblems>,
  index: number,
  field: PiField,
): string | undefined {
  return problems.find((problem) => problem.index === index && problem.field === field)?.message;
}

/** The PI view's range over every PI that can be drawn, or null when none can. */
function previewRange(pis: ReturnType<typeof programIncrements>): DateRange | null {
  const first = pis[0];
  if (!first) return null;
  const end = pis.reduce(
    (latest, pi) => (toDay(pi.endExclusive) > toDay(latest) ? pi.endExclusive : latest),
    first.endExclusive,
  );
  return { start: first.start, endExclusive: end };
}

/**
 * RM-4 Manage PIs: name, start, sprint count and IP per PI, with a live PI-view header preview.
 * Save sends one op. The draft is local until then; mount it fresh for each opening.
 */
export function ManagePisDialog({
  open,
  pis,
  sprintLengthDays,
  cadence,
  timelineStart,
  today,
  onSave,
  onClose,
}: ManagePisDialogProps) {
  const titleId = useId();
  // A form draft, not a copy of server state: nothing is saved until Save.
  const [draft, setDraft] = useState<ProgramIncrement[]>(() => [...pis]);
  const problems = piProblems(draft, sprintLengthDays);
  // Only PIs with a usable start and sprint count can be drawn; overlaps still draw, so the
  // preview shows the clash the error describes.
  const drawable = programIncrements(draft.filter(isDatablePi), sprintLengthDays);
  const range = previewRange(drawable);

  const change = (index: number, update: Partial<ProgramIncrement>) => {
    setDraft((current) =>
      current.map((pi, position) => (position === index ? { ...pi, ...update } : pi)),
    );
  };

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={titleId} maxWidth="md" fullWidth>
      <DialogTitle id={titleId}>Manage PIs</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Each PI has {String(sprintLengthDays / 7)}-week sprints. The last sprint is the IP sprint
          when IP is on.
        </Typography>
        <Box
          component="ul"
          sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5 }}
        >
          {draft.map((pi, index) => {
            const row = `PI ${String(index + 1)}`;
            const nameError = messageFor(problems, index, 'name');
            const startError = messageFor(problems, index, 'start');
            const sprintsError = messageFor(problems, index, 'sprints');
            return (
              <Box
                component="li"
                key={pi.id}
                sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5 }}
              >
                <TextField
                  size="small"
                  label="Name"
                  value={pi.name}
                  error={Boolean(nameError)}
                  helperText={nameError}
                  onChange={(event) => {
                    change(index, { name: event.target.value });
                  }}
                  slotProps={{ htmlInput: { 'aria-label': `${row} name` } }}
                  sx={{ flex: 1, minWidth: NAME_FIELD_MIN_WIDTH }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="Start"
                  value={pi.start}
                  error={Boolean(startError)}
                  helperText={startError}
                  onChange={(event) => {
                    change(index, { start: event.target.value });
                  }}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { 'aria-label': `${row} start` },
                  }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Sprints"
                  value={Number.isNaN(pi.sprints) ? '' : pi.sprints}
                  error={Boolean(sprintsError)}
                  helperText={sprintsError}
                  onChange={(event) => {
                    change(index, {
                      sprints: event.target.value === '' ? Number.NaN : Number(event.target.value),
                    });
                  }}
                  slotProps={{
                    htmlInput: {
                      'aria-label': `${row} sprints`,
                      min: PI_SPRINTS_MIN,
                      max: PI_SPRINTS_MAX,
                      step: 1,
                    },
                  }}
                  sx={{ width: NUMBER_FIELD_WIDTH }}
                />
                <FormControlLabel
                  label="IP"
                  control={
                    <Switch
                      checked={pi.ipSprint}
                      onChange={(event) => {
                        change(index, { ipSprint: event.target.checked });
                      }}
                      slotProps={{ input: { 'aria-label': `${row} IP sprint` } }}
                    />
                  }
                  sx={{ mr: 0 }}
                />
                <IconButton
                  aria-label={`Remove ${pi.name.trim() || row}`}
                  onClick={() => {
                    setDraft((current) => current.filter((_pi, position) => position !== index));
                  }}
                >
                  <DeleteOutline />
                </IconButton>
              </Box>
            );
          })}
        </Box>
        <Box>
          <Button
            startIcon={<AddIcon />}
            onClick={() => {
              setDraft((current) => [
                ...current,
                newPi(current, cadence, sprintLengthDays, timelineStart),
              ]);
            }}
          >
            Add PI
          </Button>
        </Box>
        <Box component="section" aria-label="Preview">
          <Typography variant="overline" component="h3" color="text.secondary" sx={{ mb: 0.5 }}>
            Preview
          </Typography>
          {range ? (
            <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider' }}>
              <Box sx={{ width: PREVIEW_WIDTH }}>
                <TimelineHeader view="pis" range={range} pis={drawable} today={today} colW={0} />
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Add a PI to see the preview.
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={problems.length > 0}
          onClick={() => {
            onSave(piSaveOps(pis, draft));
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
