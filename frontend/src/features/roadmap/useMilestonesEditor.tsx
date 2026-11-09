import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';
import type { SaveMode } from '../../api/useAutosave';
import type { DocumentOp } from '../../lib/documentOps/applyOps';
import {
  insertMilestoneOp,
  type Milestone,
  type MilestoneKind,
  newMilestone,
  removeMilestoneOp,
} from '../../lib/roadmap/milestones';
import type { Pi } from '../../lib/timeline';
import { MilestonesDialog } from './components/MilestonesDialog';

interface MilestonesEditorOptions {
  milestones: readonly Milestone[];
  pis: readonly Pi[];
  today: string;
  save: (ops: DocumentOp[], mode: SaveMode) => void;
  notify: (message: string) => void;
}

/**
 * The Milestones dialog (task 13, `RM-9-editor`) and its two triggers for the milestones
 * row: the "Edit milestones" pencil and, on an empty row, "Add a milestone".
 */
export function useMilestonesEditor({
  milestones,
  pis,
  today,
  save,
  notify,
}: MilestonesEditorOptions) {
  const [open, setOpen] = useState(false);
  const [focusNameId, setFocusNameId] = useState<string | null>(null);

  const add = (kind: MilestoneKind) => {
    const milestone = newMilestone(
      kind,
      pis,
      today,
      milestones.map(({ id }) => id),
    );
    save([insertMilestoneOp(milestone)], 'immediate');
    setFocusNameId(milestone.id);
  };

  const labelAction = (
    <Tooltip title="Add, edit or delete milestones" describeChild>
      <IconButton
        size="small"
        aria-label="Edit milestones"
        onClick={() => {
          setFocusNameId(null);
          setOpen(true);
        }}
      >
        <EditOutlinedIcon fontSize="inherit" />
      </IconButton>
    </Tooltip>
  );

  const emptyAction = (
    <Button
      size="small"
      onClick={() => {
        add('milestone');
        setOpen(true);
      }}
    >
      Add a milestone
    </Button>
  );

  const dialog = (
    <MilestonesDialog
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      milestones={milestones}
      focusNameId={focusNameId}
      onAdd={add}
      onSave={save}
      onDelete={(milestone) => {
        save([removeMilestoneOp(milestone)], 'immediate');
        notify(`Deleted ${milestone.name}`);
      }}
    />
  );

  return { labelAction, emptyAction, dialog };
}
