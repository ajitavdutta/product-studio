import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import { statusColor } from '../../../lib/roadmap/statusColor';

interface LegendProps {
  statuses: RoadmapDocument['statuses'];
  /** The IP sample only means something where IP sprints are drawn (Sprint and PI views). */
  showIpSprint: boolean;
}

const SWATCH = 12;
const PROGRESS_SAMPLE_HEIGHT = 3;
const IP_SAMPLE_WIDTH = 14;
const IP_STRIPE_PX = 3;
const MILESTONE_LINE_PX = 2;

/** The legend strip under the timeline (RM-12). */
export function Legend({ statuses, showIpSprint }: LegendProps) {
  const theme = useTheme();
  const { timeline, milestone } = theme.palette;
  return (
    <Box
      component="ul"
      aria-label="Legend"
      sx={{
        m: 0,
        listStyle: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        px: 2,
        py: 1,
        typography: 'caption',
        color: 'text.secondary',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        '& li': { display: 'flex', alignItems: 'center', gap: 0.75 },
      }}
    >
      {statuses.map((status) => (
        <li key={status.id}>
          <Box
            aria-hidden
            sx={{
              width: SWATCH,
              height: SWATCH,
              borderRadius: 0.75,
              bgcolor: statusColor(status, theme.palette),
            }}
          />
          {status.name}
        </li>
      ))}
      <li>
        <Box
          aria-hidden
          sx={{
            width: SWATCH,
            height: PROGRESS_SAMPLE_HEIGHT,
            bgcolor: 'background.paper',
            outline: `1px solid ${theme.palette.neutral.muted}`,
          }}
        />
        Progress (from Jira issues)
      </li>
      {showIpSprint ? (
        <li>
          <Box
            aria-hidden
            sx={{
              width: IP_SAMPLE_WIDTH,
              height: SWATCH,
              border: 1,
              borderColor: timeline.piLine,
              background: `repeating-linear-gradient(135deg, ${timeline.ipHatch} 0 ${String(IP_STRIPE_PX)}px, transparent ${String(IP_STRIPE_PX)}px ${String(IP_STRIPE_PX * 2)}px)`,
            }}
          />
          {'IP sprint (Innovation & Planning)'}
        </li>
      ) : null}
      <li>
        <Box
          aria-hidden
          sx={{
            width: 0,
            height: SWATCH,
            borderLeft: `${String(MILESTONE_LINE_PX)}px dashed ${milestone.color}`,
          }}
        />
        Milestone
      </li>
    </Box>
  );
}
