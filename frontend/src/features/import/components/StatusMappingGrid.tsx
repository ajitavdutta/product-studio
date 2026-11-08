import ArrowForward from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Select from '@mui/material/Select';
import { useTheme, type Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useId, useState } from 'react';
import type { ImportSessionRead } from '../../../api/useImports';
import {
  DEFAULT_STATUS_IDS,
  type CustomStatus,
  type DefaultStatusId,
  type TeamColor,
} from '../../../lib/importMapping/mapping';
import type { StatusKey } from '../../../app/theme';
import { NewStatusDialog } from './NewStatusDialog';

interface StatusMappingGridProps {
  /** The distinct Jira statuses in the file (`session.statuses`). */
  statuses: ImportSessionRead['statuses'];
  /** Jira status → roadmap status id. */
  statusMap: Record<string, string>;
  customStatuses: readonly CustomStatus[];
  onChange: (jiraStatus: string, statusId: string) => void;
  onAddCustomStatus: (jiraStatus: string, name: string, color: TeamColor) => void;
}

const THEME_STATUS_KEYS: Readonly<Record<DefaultStatusId, StatusKey>> = {
  'not-started': 'notStarted',
  'in-progress': 'inProgress',
  'at-risk': 'atRisk',
  done: 'done',
};
// Prototype: as many 240px-minimum cells as fit, so a phone gets one column.
const CELL_MIN_WIDTH = 240;
const DOT_SIZE = 10;
const ARROW_SIZE = 16;
// Picking this option opens the New status dialog instead of mapping anything.
const NEW_STATUS_VALUE = '__new-status__';

interface StatusOption {
  id: string;
  label: string;
  color: string;
}

function statusOptions(theme: Theme, customStatuses: readonly CustomStatus[]): StatusOption[] {
  const defaults = DEFAULT_STATUS_IDS.map((id) => {
    const token = theme.palette.status[THEME_STATUS_KEYS[id]];
    return { id, label: token.label, color: token.color };
  });
  const custom = customStatuses.map((status) => ({
    id: status.id,
    label: status.name,
    color: theme.palette.team[status.color],
  }));
  return [...defaults, ...custom];
}

/** IMP-7: map each Jira status in the file to a roadmap status, or to a new one. */
export function StatusMappingGrid({
  statuses,
  statusMap,
  customStatuses,
  onChange,
  onAddCustomStatus,
}: StatusMappingGridProps) {
  const theme = useTheme();
  const headingId = useId();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const options = statusOptions(theme, customStatuses);

  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      <Typography
        id={headingId}
        variant="body2"
        component="h3"
        sx={{ fontWeight: 'fontWeightMedium' }}
      >
        Status mapping
      </Typography>
      {statuses.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'neutral.muted' }}>
          This export has no Status values, so every item starts as Not started.
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${String(CELL_MIN_WIDTH)}px, 1fr))`,
            gap: 1,
          }}
        >
          {statuses.map(({ jiraStatus }) => (
            <StatusCell
              key={jiraStatus}
              jiraStatus={jiraStatus}
              statusId={statusMap[jiraStatus] ?? 'not-started'}
              options={options}
              onChange={onChange}
              onNewStatus={setCreatingFor}
            />
          ))}
        </Box>
      )}
      <NewStatusDialog
        jiraStatus={creatingFor}
        takenNames={options.map((option) => option.label)}
        onClose={() => {
          setCreatingFor(null);
        }}
        onCreate={(name, color) => {
          if (creatingFor !== null) onAddCustomStatus(creatingFor, name, color);
          setCreatingFor(null);
        }}
      />
    </Box>
  );
}

interface StatusCellProps {
  jiraStatus: string;
  statusId: string;
  options: readonly StatusOption[];
  onChange: (jiraStatus: string, statusId: string) => void;
  onNewStatus: (jiraStatus: string) => void;
}

function StatusCell({ jiraStatus, statusId, options, onChange, onNewStatus }: StatusCellProps) {
  const current = options.find((option) => option.id === statusId);
  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        border: 1,
        borderColor: 'divider',
        borderRadius: `${String(theme.custom.radius.md)}px`,
        px: 1.25,
        py: 0.75,
      })}
    >
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        {jiraStatus}
      </Typography>
      <ArrowForward aria-hidden="true" sx={{ fontSize: ARROW_SIZE, color: 'neutral.muted' }} />
      <Box
        aria-hidden="true"
        sx={{
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: '50%',
          flex: 'none',
          bgcolor: current?.color ?? 'neutral.muted',
        }}
      />
      <Select
        native
        size="small"
        value={statusId}
        onChange={(event) => {
          const value = event.target.value;
          if (value === NEW_STATUS_VALUE) {
            onNewStatus(jiraStatus);
            return;
          }
          onChange(jiraStatus, value);
        }}
        inputProps={{ 'aria-label': `Roadmap status for ${jiraStatus}` }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        <option value={NEW_STATUS_VALUE}>New status…</option>
      </Select>
    </Box>
  );
}
