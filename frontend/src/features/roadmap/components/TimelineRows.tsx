import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useMemo } from 'react';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import { type RowGrouping, timelineRows } from '../../../lib/roadmap/rows';
import { statusColor } from '../../../lib/roadmap/statusColor';
import type { DateRange } from '../../../lib/timeline';
import { EpicRow } from './EpicRow';

type RoadmapLane = RoadmapDocument['lanes'][number];

interface TimelineRowsProps {
  lanes: RoadmapDocument['lanes'];
  items: RoadmapDocument['items'];
  statuses: RoadmapDocument['statuses'];
  groupBy: RowGrouping;
  range: DateRange;
  selectedItemId: string | null;
  /** Keep it stable (e.g. `selectItem`) so unchanged rows skip re-rendering. */
  onSelect: (itemId: string) => void;
}

// Prototype `.sq`: the team colour square.
const SQUARE_SIZE = 10;
const SQUARE_RADIUS = 3;
const EMPTY_MESSAGE =
  'No epics are scheduled yet. Pick one from Unscheduled below to put it in the next sprint.';

function epicCountLabel(count: number): string {
  return `· ${String(count)} ${count === 1 ? 'epic' : 'epics'}`;
}

function TeamHeader({ lane, epicCount }: { lane: RoadmapLane; epicCount: number }) {
  return (
    <Box
      role="heading"
      aria-level={3}
      sx={{
        position: 'relative',
        height: (theme) => theme.palette.timeline.teamRowHeight,
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'neutral.hover',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {/* Sticky so the team name stays readable when the timeline is scrolled sideways. */}
      <Box
        sx={{
          position: 'sticky',
          left: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          typography: 'caption',
          fontWeight: 'fontWeightMedium',
          whiteSpace: 'nowrap',
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            width: SQUARE_SIZE,
            height: SQUARE_SIZE,
            borderRadius: `${String(SQUARE_RADIUS)}px`,
            flex: 'none',
            bgcolor: (theme) => theme.palette.team[lane.color],
          }}
        />
        {lane.name}
        <Box component="span" sx={{ color: 'neutral.muted', fontWeight: 'fontWeightRegular' }}>
          {epicCountLabel(epicCount)}
        </Box>
      </Box>
    </Box>
  );
}

/** RM-3, RM-8: team headers (30px) and epic rows (44px) under the timeline header. */
export function TimelineRows({
  lanes,
  items,
  statuses,
  groupBy,
  range,
  selectedItemId,
  onSelect,
}: TimelineRowsProps) {
  const theme = useTheme();
  const rows = useMemo(() => timelineRows(lanes, items, groupBy), [lanes, items, groupBy]);
  const statusById = useMemo(
    () => new Map(statuses.map((status) => [status.id, status])),
    [statuses],
  );
  const hasEpics = rows.some((row) => row.kind === 'epic');

  return (
    <Box>
      {rows.map((row) => {
        if (row.kind === 'team') {
          return (
            <TeamHeader key={`lane-${row.lane.id}`} lane={row.lane} epicCount={row.epicCount} />
          );
        }
        const { item } = row;
        const status = statusById.get(item.statusId);
        return (
          <EpicRow
            key={item.id}
            itemId={item.id}
            itemKey={item.key}
            title={item.title}
            // timelineRows only returns scheduled items.
            start={item.start ?? ''}
            end={item.end ?? ''}
            progress={item.progress}
            statusLabel={status?.name ?? item.statusId}
            color={statusColor(status, theme.palette)}
            rangeStart={range.start}
            rangeEndExclusive={range.endExclusive}
            selected={item.id === selectedItemId}
            onSelect={onSelect}
          />
        );
      })}
      {!hasEpics && (
        <Box
          sx={{
            position: 'sticky',
            left: 0,
            width: 'fit-content',
            maxWidth: '100vw',
            px: 2,
            py: 3,
            typography: 'body2',
            color: 'neutral.muted',
          }}
        >
          {EMPTY_MESSAGE}
        </Box>
      )}
    </Box>
  );
}
