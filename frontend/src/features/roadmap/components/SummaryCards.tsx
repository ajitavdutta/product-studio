import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import type { CurrentSprintSummary, NextMilestone } from '../../../lib/roadmap/summary';
import { formatDayMonthYear } from '../../../lib/timeline';

interface SummaryCardsProps {
  issuesDonePercent: number;
  atRiskTitles: readonly string[];
  nextMilestone: NextMilestone | null;
  currentSprint: CurrentSprintSummary | null;
  unscheduledCount: number;
}

const CARD_MIN_WIDTH = 200;
const BAR_HEIGHT = 4;
const DIAMOND_SIZE = 10;

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function daysToGoLabel(days: number): string {
  if (days === 0) return 'today';
  return `in ${plural(days, 'day', 'days')}`;
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        px: 1.5,
        py: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      <Typography
        component="span"
        variant="overline"
        sx={{ textTransform: 'none', letterSpacing: 'normal', color: 'neutral.muted' }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <LinearProgress
      variant="determinate"
      value={value}
      aria-label={label}
      sx={(theme) => ({
        height: BAR_HEIGHT,
        borderRadius: BAR_HEIGHT / 2,
        bgcolor: theme.palette.neutral.progressTrack,
        '& .MuiLinearProgress-bar': { borderRadius: BAR_HEIGHT / 2 },
      })}
    />
  );
}

const valueSx = { typography: 'h2' } as const;
const titleSx = { typography: 'subtitle1', display: 'flex', alignItems: 'center', gap: 1 } as const;
const noteSx = {
  typography: 'caption',
  color: 'neutral.muted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

/** The five summary cards above the timeline (RM-2). */
export function SummaryCards({
  issuesDonePercent,
  atRiskTitles,
  nextMilestone,
  currentSprint,
  unscheduledCount,
}: SummaryCardsProps) {
  return (
    <Box
      // 20px side padding at every width, as the prototype's `.insights`.
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${String(CARD_MIN_WIDTH)}px, 1fr))`,
        gap: 1.5,
        px: 2.5,
        py: 1.5,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Card label="Issues done">
        <Box component="span" sx={valueSx}>
          {issuesDonePercent}%
        </Box>
        <Bar value={issuesDonePercent} label="Issues done" />
      </Card>
      <Card label="At risk">
        <Box component="span" sx={{ ...valueSx, color: 'neutral.warningText' }}>
          {plural(atRiskTitles.length, 'epic', 'epics')}
        </Box>
        <Box component="span" sx={noteSx} title={atRiskTitles.join(', ')}>
          {atRiskTitles.length > 0 ? atRiskTitles.join(', ') : 'None'}
        </Box>
      </Card>
      <Card label="Next milestone">
        {nextMilestone ? (
          <>
            <Box component="span" sx={titleSx}>
              <Box
                component="span"
                aria-hidden
                sx={(theme) => ({
                  width: DIAMOND_SIZE,
                  height: DIAMOND_SIZE,
                  flex: 'none',
                  transform: 'rotate(45deg)',
                  bgcolor: theme.palette.milestone.color,
                })}
              />
              {nextMilestone.name}
            </Box>
            <Box component="span" sx={noteSx}>
              {formatDayMonthYear(nextMilestone.date)} · {daysToGoLabel(nextMilestone.daysToGo)}
            </Box>
          </>
        ) : (
          <Box component="span" sx={noteSx}>
            No upcoming milestones
          </Box>
        )}
      </Card>
      <Card label="Current sprint">
        {currentSprint ? (
          <>
            <Box component="span" sx={titleSx}>
              {currentSprint.label}
            </Box>
            <Box component="span" sx={noteSx}>
              {currentSprint.dates} · {plural(currentSprint.daysLeft, 'day', 'days')} left
            </Box>
            <Bar value={currentSprint.percent} label="Current sprint elapsed" />
          </>
        ) : (
          <Box component="span" sx={noteSx}>
            Today is outside every PI
          </Box>
        )}
      </Card>
      <Card label="Unscheduled">
        <Box component="span" sx={valueSx}>
          {plural(unscheduledCount, 'issue', 'issues')}
        </Box>
        <Box component="span" sx={noteSx}>
          {unscheduledCount > 0 ? 'No start or due date in Jira' : 'Every item has dates'}
        </Box>
      </Card>
    </Box>
  );
}
