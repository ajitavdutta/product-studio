import Button from '@mui/material/Button';
import { useState } from 'react';
import type { RoadmapDocument } from '../../api/useRoadmap';
import { DEFAULT_PI_CADENCE, useSettings } from '../../api/useSettings';
import type { DocumentOp } from '../../lib/documentOps/applyOps';
import { ManagePisDialog } from './components/ManagePisDialog';

interface ManagePisActionProps {
  timeline: RoadmapDocument['timeline'];
  today: string;
  /** Autosave, immediate. A server rejection rolls back and says why. */
  onSave: (ops: DocumentOp[]) => void;
}

interface OpenDialogProps extends ManagePisActionProps {
  onClose: () => void;
}

/** Mounted only while open: each opening drafts from the current document, and Settings
 * (for a new PI's cadence) is only fetched when someone manages PIs. */
function OpenManagePisDialog({ timeline, today, onSave, onClose }: OpenDialogProps) {
  const settings = useSettings();
  return (
    <ManagePisDialog
      open
      pis={timeline.pis}
      sprintLengthDays={timeline.sprintLengthDays}
      cadence={settings.data?.piCadence ?? DEFAULT_PI_CADENCE}
      timelineStart={timeline.start}
      today={today}
      onSave={(ops) => {
        onSave(ops);
        onClose();
      }}
      onClose={onClose}
    />
  );
}

/**
 * RM-4: the Manage PIs trigger for the timeline corner cell, and its dialog.
 * ASSUMPTION 14: the corner cell, not the toolbar, so the toolbar keeps the prototype's layout.
 */
export function ManagePisAction(props: ManagePisActionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="small"
        onClick={() => {
          setOpen(true);
        }}
        sx={{ p: 0, minWidth: 0, minHeight: 0, typography: 'overline', textTransform: 'none' }}
      >
        Manage PIs
      </Button>
      {open && (
        <OpenManagePisDialog
          {...props}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
