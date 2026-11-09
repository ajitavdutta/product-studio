import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import type { Theme } from '@mui/material/styles';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type KeyboardEvent, type RefObject, useRef, useState } from 'react';
import type { SaveMode } from '../../../api/useAutosave';
import type { DocumentOp } from '../../../lib/documentOps/applyOps';
import {
  isFinishedDate,
  MILESTONE_DATE_MAX,
  MILESTONE_DATE_MIN,
  MILESTONE_NAME_MAX_LENGTH,
  type Milestone,
  type MilestoneField,
  type MilestoneKind,
  milestoneOps,
  sortedMilestones,
  validateMilestone,
  withKind,
} from '../../../lib/roadmap/milestones';

interface MilestonesDialogProps {
  open: boolean;
  onClose: () => void;
  /** As saved (the query cache). */
  milestones: readonly Milestone[];
  /** A newly added row whose Name field takes focus. */
  focusNameId: string | null;
  onAdd: (kind: MilestoneKind) => void;
  onSave: (ops: DocumentOp[], mode: SaveMode) => void;
  onDelete: (milestone: Milestone) => void;
}

const KIND_LABELS: Record<MilestoneKind, string> = {
  milestone: 'Milestone',
  freeze: 'Freeze window',
};
const SWATCH_SIZE = 12;
const STRIPE_PX = 3;
const NAME_MIN_WIDTH = 200;
const TYPE_MIN_WIDTH = 150;
const DATE_MIN_WIDTH = 150;
const EMPTY_MESSAGE = 'No milestones yet. Add one to mark a launch or a code freeze.';

function Swatch({ kind }: { kind: MilestoneKind }) {
  return (
    <Box
      aria-hidden
      sx={(theme: Theme) => ({
        flex: 'none',
        width: SWATCH_SIZE,
        height: SWATCH_SIZE,
        mt: 2.25,
        mx: 0.5,
        ...(kind === 'milestone'
          ? { bgcolor: theme.palette.milestone.color, transform: 'rotate(45deg)' }
          : {
              borderRadius: 0.5,
              background: `repeating-linear-gradient(135deg, ${theme.palette.milestone.freezeStripeA} 0 ${String(STRIPE_PX)}px, ${theme.palette.milestone.freezeStripeB} ${String(STRIPE_PX)}px ${String(STRIPE_PX * 2)}px)`,
            }),
      })}
    />
  );
}

type DraftFieldProps = Omit<TextFieldProps, 'value' | 'onChange' | 'onFocus' | 'onBlur'> & {
  value: string;
  onCommit: (value: string) => void;
  /** Values to keep local while the field has focus (an unfinished date). */
  holdWhileEditing?: (value: string) => boolean;
};

/**
 * A text field that owns its text while focused. The saved document reaches the cache a
 * tick after each keystroke, so a field fed straight from it would lose fast typing.
 */
function DraftField({ value, onCommit, holdWhileEditing, ...textFieldProps }: DraftFieldProps) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <TextField
      {...textFieldProps}
      value={editing ?? value}
      onFocus={() => {
        setEditing(value);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setEditing(next);
        if (!holdWhileEditing?.(next)) onCommit(next);
      }}
      onBlur={() => {
        // A held value (an unfinished date) is committed now so its problem shows.
        if (editing !== null && editing !== value) onCommit(editing);
        setEditing(null);
      }}
    />
  );
}

interface RowProps {
  value: Milestone;
  problem: ReturnType<typeof validateMilestone>;
  autoFocusName: boolean;
  onChange: (next: Milestone, changed: MilestoneField | 'kind') => void;
  onAskDelete: () => void;
  /** Holds the id of the row whose delete button gets focus back after a cancelled delete. */
  focusDeleteRef: RefObject<string | null>;
}

function MilestoneRow({
  value,
  problem,
  autoFocusName,
  onChange,
  onAskDelete,
  focusDeleteRef,
}: RowProps) {
  const nextFieldRef = useRef<HTMLInputElement>(null);
  const errorFor = (field: MilestoneField) =>
    problem?.field === field ? { error: true, helperText: problem.message } : {};
  const dateField = (field: 'date' | 'start' | 'end', label: string, first: boolean) => (
    <DraftField
      label={label}
      type="date"
      size="small"
      value={value[field] ?? ''}
      inputRef={first ? nextFieldRef : undefined}
      onCommit={(text) => {
        onChange({ ...value, [field]: text || undefined }, field);
      }}
      holdWhileEditing={(text) => text !== '' && !isFinishedDate(text)}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { min: MILESTONE_DATE_MIN, max: MILESTONE_DATE_MAX },
      }}
      sx={{ minWidth: DATE_MIN_WIDTH, flex: '1 1 0' }}
      {...errorFor(field)}
    />
  );

  return (
    <Box
      component="li"
      aria-label={value.name || KIND_LABELS[value.kind]}
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, py: 1 }}
    >
      <Swatch kind={value.kind} />
      <TextField
        select
        label="Type"
        size="small"
        value={value.kind}
        onChange={(event) => {
          onChange(withKind(value, event.target.value as MilestoneKind), 'kind');
        }}
        sx={{ minWidth: TYPE_MIN_WIDTH }}
      >
        {(Object.keys(KIND_LABELS) as MilestoneKind[]).map((kind) => (
          <MenuItem key={kind} value={kind}>
            {KIND_LABELS[kind]}
          </MenuItem>
        ))}
      </TextField>
      <DraftField
        label="Name"
        size="small"
        value={value.name}
        autoFocus={autoFocusName}
        onCommit={(text) => {
          onChange({ ...value, name: text }, 'name');
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          nextFieldRef.current?.focus();
        }}
        slotProps={{ htmlInput: { maxLength: MILESTONE_NAME_MAX_LENGTH } }}
        sx={{ minWidth: NAME_MIN_WIDTH, flex: '2 1 0' }}
        {...errorFor('name')}
      />
      {value.kind === 'milestone' ? (
        dateField('date', 'Date', true)
      ) : (
        <>
          {dateField('start', 'Start', true)}
          {dateField('end', 'End', false)}
        </>
      )}
      <IconButton
        aria-label={`Delete ${value.name || KIND_LABELS[value.kind]}`}
        onClick={onAskDelete}
        ref={(button: HTMLButtonElement | null) => {
          if (!button || focusDeleteRef.current !== value.id) return;
          focusDeleteRef.current = null;
          button.focus();
        }}
        sx={{ mt: 0.25 }}
      >
        <DeleteOutlineIcon />
      </IconButton>
    </Box>
  );
}

interface ConfirmProps {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmation({ name, onCancel, onConfirm }: ConfirmProps) {
  return (
    <Box
      component="li"
      role="group"
      aria-label={`Delete ${name}?`}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        px: 1.5,
        my: 0.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="body2" sx={{ flex: '1 1 240px' }}>
        Delete “{name}”? It disappears from the timeline, its milestone line and exports.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="contained" color="error" onClick={onConfirm}>
          Delete
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Add, edit and delete milestones and freeze windows (task 13, `RM-9-editor`).
 * Valid edits go straight to `onSave`; an invalid row is held here, shows its problem and
 * sends nothing until it is valid again.
 */
export function MilestonesDialog(props: MilestonesDialogProps) {
  const { open, onClose } = props;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      fullWidth
      maxWidth="md"
      onClose={(_event, reason) => {
        // Esc backs out of a delete confirmation before it closes the dialog.
        if (reason === 'escapeKeyDown' && confirmingId) {
          setConfirmingId(null);
          return;
        }
        onClose();
      }}
    >
      <DialogTitle>Milestones</DialogTitle>
      {/* Mounted only while open, so the row order and drafts start fresh each time. */}
      {open ? (
        <MilestonesDialogBody
          {...props}
          confirmingId={confirmingId}
          setConfirmingId={setConfirmingId}
        />
      ) : null}
    </Dialog>
  );
}

interface BodyProps extends MilestonesDialogProps {
  confirmingId: string | null;
  setConfirmingId: (id: string | null) => void;
}

function MilestonesDialogBody({
  onClose,
  milestones,
  focusNameId,
  onAdd,
  onSave,
  onDelete,
  confirmingId,
  setConfirmingId,
}: BodyProps) {
  // Rows keep the order they had when the dialog opened (new ones go last), so a row
  // doesn't jump away from the field being typed in when its date changes.
  const [openingOrder] = useState(() => sortedMilestones(milestones).map(({ id }) => id));
  // Only rows with unsent (invalid) edits; everything else reads the saved document.
  const [drafts, setDrafts] = useState<Record<string, Milestone>>({});
  const addMilestoneRef = useRef<HTMLButtonElement>(null);
  const deleteButtonFocusId = useRef<string | null>(null);

  const rank = (id: string) => {
    const index = openingOrder.indexOf(id);
    return index === -1 ? openingOrder.length : index;
  };
  const rows = milestones
    .map((milestone, index) => ({ milestone, index }))
    .sort((a, b) => rank(a.milestone.id) - rank(b.milestone.id) || a.index - b.index)
    .map(({ milestone }) => milestone);

  const setDraft = (id: string, draft: Milestone | null) => {
    setDrafts((current) => {
      const next = { ...current };
      if (draft) next[id] = draft;
      // Removing a key from the private copy is how a draft is dropped.
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      else delete next[id];
      return next;
    });
  };

  const change = (saved: Milestone, next: Milestone, changed: MilestoneField | 'kind') => {
    if (validateMilestone(next)) {
      setDraft(saved.id, next);
      return;
    }
    setDraft(saved.id, null);
    onSave(milestoneOps(saved, next), changed === 'name' ? 'text' : 'immediate');
  };

  const cancelDelete = (id: string) => {
    deleteButtonFocusId.current = id;
    setConfirmingId(null);
  };

  return (
    <>
      <DialogContent dividers>
        {rows.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
            {EMPTY_MESSAGE}
          </Typography>
        ) : (
          <Box component="ul" aria-label="Milestones" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {rows.map((saved) => {
              if (saved.id === confirmingId) {
                return (
                  <DeleteConfirmation
                    key={saved.id}
                    name={saved.name}
                    onCancel={() => {
                      cancelDelete(saved.id);
                    }}
                    onConfirm={() => {
                      setDraft(saved.id, null);
                      setConfirmingId(null);
                      onDelete(saved);
                      addMilestoneRef.current?.focus();
                    }}
                  />
                );
              }
              const value = drafts[saved.id] ?? saved;
              return (
                <MilestoneRow
                  key={saved.id}
                  value={value}
                  problem={validateMilestone(value)}
                  autoFocusName={saved.id === focusNameId}
                  focusDeleteRef={deleteButtonFocusId}
                  onChange={(next, changed) => {
                    change(saved, next, changed);
                  }}
                  onAskDelete={() => {
                    setConfirmingId(saved.id);
                  }}
                />
              );
            })}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button
            ref={addMilestoneRef}
            onClick={() => {
              onAdd('milestone');
            }}
          >
            Add milestone
          </Button>
          <Button
            onClick={() => {
              onAdd('freeze');
            }}
          >
            Add freeze window
          </Button>
        </Box>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </>
  );
}
