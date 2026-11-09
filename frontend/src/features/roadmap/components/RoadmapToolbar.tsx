import DiamondOutlined from '@mui/icons-material/DiamondOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import NativeSelect from '@mui/material/NativeSelect';
import OutlinedInput from '@mui/material/OutlinedInput';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { ReactNode } from 'react';
import { ZoomControl } from '../../../components/ZoomControl';
import type { TimelineView } from '../../../lib/timeline';
import type { GroupBy } from '../state';

interface RoadmapToolbarProps {
  sourceLabel: string;
  view: TimelineView;
  onViewChange: (view: TimelineView) => void;
  groupBy: GroupBy;
  onGroupByChange: (groupBy: GroupBy) => void;
  showMilestoneLines: boolean;
  onShowMilestoneLinesChange: (show: boolean) => void;
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  onZoomStep: (direction: 1 | -1) => void;
  onZoomReset: () => void;
  onZoomFit: () => void;
  /** Re-sync from a newer Jira export (task 11); the button is disabled until it is wired. */
  onResync?: () => void;
  /** Save JSON and Open JSON (task 10), placed before Export…. */
  fileActions?: ReactNode;
  onExport: () => void;
}

const VIEWS: readonly { value: TimelineView; label: string }[] = [
  { value: 'sprints', label: 'Sprints' },
  { value: 'months', label: 'Months' },
  { value: 'pis', label: 'PIs' },
];
const RELEASE_HINT = "Releases aren't saved in v1 roadmaps";
const CONTROL_HEIGHT = 34;
const SELECT_HEIGHT = 32;

function isGroupBy(value: string): value is GroupBy {
  return value === 'team' || value === 'epic';
}

/** The roadmap toolbar (RM-1). It wraps onto more lines on narrow screens (G-5). */
export function RoadmapToolbar({
  sourceLabel,
  view,
  onViewChange,
  groupBy,
  onGroupByChange,
  showMilestoneLines,
  onShowMilestoneLinesChange,
  zoom,
  zoomMin,
  zoomMax,
  onZoomStep,
  onZoomReset,
  onZoomFit,
  onResync,
  fileActions,
  onExport,
}: RoadmapToolbarProps) {
  return (
    <Box
      role="toolbar"
      aria-label="Roadmap"
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.5,
        px: 2.5,
        py: 1.25,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        [theme.custom.media.mobile]: { px: 1.5, py: 1 },
      })}
    >
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.625,
          borderRadius: 3.5,
          bgcolor: 'neutral.primaryTint',
          color: 'text.secondary',
          typography: 'caption',
        }}
      >
        <DiamondOutlined aria-hidden fontSize="inherit" sx={{ color: 'primary.main' }} />
        {sourceLabel}
      </Box>
      <Button
        variant="outlined"
        startIcon={<SyncIcon />}
        disabled={!onResync}
        onClick={onResync}
        sx={{ height: CONTROL_HEIGHT, fontWeight: 'fontWeightMedium' }}
      >
        Re-sync from new export
      </Button>
      <Divider orientation="vertical" flexItem aria-hidden />
      <ToggleButtonGroup
        exclusive
        size="small"
        aria-label="Timescale"
        value={view}
        onChange={(_event, next: TimelineView | null) => {
          if (next) onViewChange(next);
        }}
      >
        {VIEWS.map(({ value, label }) => (
          <ToggleButton
            key={value}
            value={value}
            sx={{
              textTransform: 'none',
              px: 1.5,
              color: 'text.secondary',
              '&.Mui-selected': { bgcolor: 'neutral.primaryTint', color: 'neutral.primaryDark' },
            }}
          >
            {label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Box
        component="label"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          typography: 'body2',
          color: 'neutral.muted',
        }}
      >
        Group by
        <NativeSelect
          value={groupBy}
          onChange={(event) => {
            if (isGroupBy(event.target.value)) onGroupByChange(event.target.value);
          }}
          input={<OutlinedInput size="small" sx={{ height: SELECT_HEIGHT, typography: 'body2' }} />}
        >
          <option value="team">Team</option>
          <option value="epic">Epic</option>
          <option value="release" disabled title={RELEASE_HINT}>
            Release
          </option>
        </NativeSelect>
      </Box>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={showMilestoneLines}
            onChange={(event) => {
              onShowMilestoneLinesChange(event.target.checked);
            }}
          />
        }
        label="Milestone lines"
        slotProps={{ typography: { variant: 'body2' } }}
        sx={{ mr: 0 }}
      />
      <ZoomControl
        zoom={zoom}
        min={zoomMin}
        max={zoomMax}
        onStep={onZoomStep}
        onReset={onZoomReset}
        onFit={onZoomFit}
      />
      <Box sx={{ flex: 1 }} />
      {fileActions}
      <Button variant="contained" onClick={onExport} sx={{ height: CONTROL_HEIGHT }}>
        Export…
      </Button>
    </Box>
  );
}
