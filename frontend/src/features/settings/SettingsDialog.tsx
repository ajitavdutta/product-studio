import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import type { SubmitEvent } from 'react';
import {
  DEFAULT_PI_CADENCE,
  useSettings,
  useUpdateSettings,
  type SettingsRead,
  type SettingsUpdate,
} from '../../api/useSettings';
import { useWatermarkPresets, type WatermarkPresetRead } from '../../api/useWatermarkPresets';

const FORM_ID = 'settings-form';
const TITLE_ID = 'settings-dialog-title';
const MIN_SPRINTS_PER_PI = 1;
const MAX_SPRINTS_PER_PI = 12;
const DISPLAY_NAME_MAX_LENGTH = 80;
const NO_PRESET = '';
const SKELETON_ROWS = 5;

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** G-4: app-wide settings behind the top bar's gear. MUI's Dialog traps and restores focus. */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={TITLE_ID} fullWidth maxWidth="sm">
      <DialogTitle id={TITLE_ID}>Settings</DialogTitle>
      <SettingsContent onClose={onClose} />
    </Dialog>
  );
}

function SettingsContent({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const presets = useWatermarkPresets();

  // Wait for the presets too, so the preset select opens on a value it can show.
  if (settings.isPending || presets.isPending) {
    return (
      <DialogContent dividers aria-busy="true">
        <Stack spacing={2}>
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <Skeleton key={row} variant="rounded" height={48} />
          ))}
        </Stack>
      </DialogContent>
    );
  }

  if (settings.isError) {
    return (
      <>
        <DialogContent dividers>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void settings.refetch()}>
                Retry
              </Button>
            }
          >
            Couldn't load the settings.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
        </DialogActions>
      </>
    );
  }

  return (
    <SettingsForm
      settings={settings.data}
      presets={presets.isSuccess ? presets.data : undefined}
      onClose={onClose}
    />
  );
}

/** The update to send. `includePreset` is false when the presets couldn't load, so the saved default is left alone. */
function readUpdate(form: HTMLFormElement, includePreset: boolean): SettingsUpdate {
  const data = new FormData(form);
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };
  const jiraBaseUrl = text('jiraBaseUrl');
  const presetId = text('defaultPresetId');
  const update: SettingsUpdate = {
    displayName: text('displayName'),
    // An empty field is sent as null, which resets the setting on the server.
    jiraBaseUrl: jiraBaseUrl === '' ? null : jiraBaseUrl,
    piCadence: {
      sprintsPerPi: Number(text('sprintsPerPi')),
      ipSprint: data.get('ipSprint') === 'on',
    },
  };
  if (includePreset) update.defaultPresetId = presetId === NO_PRESET ? null : presetId;
  return update;
}

interface SettingsFormProps {
  settings: SettingsRead;
  /** `undefined` when the presets couldn't be loaded. */
  presets: WatermarkPresetRead[] | undefined;
  onClose: () => void;
}

/**
 * The fields are uncontrolled: each opens with the saved value, and Save reads the form.
 * That keeps the server's settings in the query cache only.
 */
function SettingsForm({ settings, presets, onClose }: SettingsFormProps) {
  const updateSettings = useUpdateSettings();
  const cadence = settings.piCadence ?? DEFAULT_PI_CADENCE;
  const presetList = presets ?? [];
  const presetHelper =
    presets === undefined
      ? "Couldn't load the presets"
      : presets.length === 0
        ? 'Save a preset from the Exports page'
        : undefined;
  const savedPresetId = presetList.some((preset) => preset.id === settings.defaultPresetId)
    ? settings.defaultPresetId
    : undefined;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Optimistic: the cache changes now; a failure rolls back and says why.
    updateSettings.mutate(readUpdate(event.currentTarget, presets !== undefined));
    onClose();
  };

  return (
    <>
      <DialogContent dividers>
        <Stack component="form" id={FORM_ID} spacing={2.5} onSubmit={handleSubmit} sx={{ pt: 0.5 }}>
          <TextField
            name="displayName"
            label="Display name"
            defaultValue={settings.displayName}
            helperText="Fills the {user} watermark token"
            slotProps={{ htmlInput: { maxLength: DISPLAY_NAME_MAX_LENGTH } }}
            autoFocus
          />
          <TextField
            name="sprintsPerPi"
            label="Sprints per PI"
            type="number"
            required
            defaultValue={cadence.sprintsPerPi}
            slotProps={{ htmlInput: { min: MIN_SPRINTS_PER_PI, max: MAX_SPRINTS_PER_PI, step: 1 } }}
          />
          <FormControlLabel
            control={<Checkbox name="ipSprint" defaultChecked={cadence.ipSprint} />}
            label="Last sprint is an IP sprint"
          />
          <TextField
            select
            name="defaultPresetId"
            label="Default watermark preset"
            defaultValue={savedPresetId ?? NO_PRESET}
            disabled={presetList.length === 0}
            helperText={presetHelper}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value={NO_PRESET}>None</MenuItem>
            {presetList.map((preset) => (
              <MenuItem key={preset.id} value={preset.id}>
                {preset.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            name="jiraBaseUrl"
            label="Jira site URL"
            type="url"
            defaultValue={settings.jiraBaseUrl ?? ''}
            placeholder="https://your-company.atlassian.net"
            helperText="Used for Open in Jira links"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" type="submit" form={FORM_ID}>
          Save
        </Button>
      </DialogActions>
    </>
  );
}
