import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { type Theme, useTheme } from '@mui/material/styles';
import { memo, type ReactNode } from 'react';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import { type Interval, milestoneLabelWidths } from '../../../lib/roadmap/milestoneLabels';
import {
  addDays,
  type DateRange,
  formatDayMonth,
  formatDayMonthYear,
  fraction,
  leftCss,
  toDay,
  widthCss,
} from '../../../lib/timeline';

type Milestone = RoadmapDocument['milestones'][number];
type RoadmapItem = RoadmapDocument['items'][number];

interface MilestonesRowProps {
  range: DateRange;
  milestones: readonly Milestone[];
  /** Used for "N epics cross it". */
  items: readonly RoadmapItem[];
  today: string;
  /** Width in px of the date track (timeline width minus the label column). */
  trackWidth: number;
  /** Called with the snackbar text when a milestone is clicked (RM-9). */
  onMilestoneClick: (message: string) => void;
  /** Extra control in the label cell (Edit milestones, task 13). */
  labelAction?: ReactNode;
  /** Shown in the row when there are no milestones (Add a milestone, task 13). */
  emptyAction?: ReactNode;
}

/** A freeze chip at or under this width says "Freeze" instead of "Code freeze" (RM-9). */
export const FREEZE_SHORT_LABEL_MAX_PX = 76;
// Prototype `.msbtn` / `.freeze` / `.today-lbl` geometry.
const MARKER_TOP = 6;
const MARKER_HEIGHT = 22;
const DIAMOND_SIZE = 12;
const DIAMOND_GAP = 3;
/** Shift so the diamond's centre, not the button's edge, sits on the date. */
const DIAMOND_CENTRE_OFFSET = -(DIAMOND_GAP + DIAMOND_SIZE / 2);
const TODAY_TOP = 8;
const TODAY_HEIGHT = 18;
const TODAY_OFFSET = 5;
/** Today's marker sits in the middle of the day. */
const MID_DAY = 0.5;
const STRIPE_PX = 4;
/** Flex gap between a diamond and its label. */
const LABEL_GAP_PX = 4;
/** From a diamond's centre to its label: half the diamond, its margin and the gap. */
const LABEL_OFFSET = DIAMOND_SIZE / 2 + DIAMOND_GAP + LABEL_GAP_PX;
/** What a diamond blocks for its neighbours' labels: the rotated square plus its ring. */
const DIAMOND_HALF_WIDTH = 9;
const LABEL_PADDING = 4;
/** Shorter than this, a label would be just an ellipsis, so it is hidden instead. */
const LABEL_MIN_WIDTH = 16;
/**
 * The Today label's width, estimated rather than measured: "TODAY · 30 Sep" in the bold
 * eyebrow size is under this, and measuring would need a layout pass before placing labels.
 */
const TODAY_LABEL_WIDTH = 96;

interface DatedMilestone {
  milestone: Milestone;
  date: string;
  day: number;
}

interface DatedFreeze {
  milestone: Milestone;
  /** Inclusive dates, as stored. */
  first: string;
  last: string;
  start: number;
  endExclusive: number;
}

function epicsCrossing(items: readonly RoadmapItem[], day: number): number {
  return items.filter(
    (item) => item.start && item.end && toDay(item.start) < day && day <= toDay(item.end),
  ).length;
}

/** Snackbar text: `Beta launch · 15 Jan 2027 · 4 epics cross it`. */
export function milestoneMessage(milestone: Milestone, items: readonly RoadmapItem[]): string {
  if (!milestone.date) return milestone.name;
  const count = epicsCrossing(items, toDay(milestone.date));
  const crossing = count === 1 ? '1 epic crosses it' : `${String(count)} epics cross it`;
  return `${milestone.name} · ${formatDayMonthYear(milestone.date)} · ${crossing}`;
}

function inRange(range: DateRange, day: number): boolean {
  return toDay(range.start) <= day && day < toDay(range.endExclusive);
}

function Diamond() {
  return (
    <Box
      component="span"
      aria-hidden
      sx={(theme: Theme) => ({
        width: DIAMOND_SIZE,
        height: DIAMOND_SIZE,
        flex: 'none',
        bgcolor: theme.palette.milestone.color,
        transform: 'rotate(45deg)',
        mx: `${String(DIAMOND_GAP)}px`,
        boxShadow: `0 0 0 2px ${theme.palette.background.default}`,
      })}
    />
  );
}

const markerSx = (theme: Theme) =>
  ({
    position: 'absolute',
    top: MARKER_TOP,
    height: MARKER_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    gap: `${String(LABEL_GAP_PX)}px`,
    whiteSpace: 'nowrap',
    typography: 'caption',
    fontWeight: theme.typography.fontWeightMedium,
    color: theme.palette.milestone.label,
    borderRadius: 1,
  }) as const;

/** The milestones row (RM-9): diamonds, freeze chips and the Today label (RM-10). */
export const MilestonesRow = memo(function MilestonesRow({
  range,
  milestones,
  items,
  today,
  trackWidth,
  onMilestoneClick,
  labelAction,
  emptyAction,
}: MilestonesRowProps) {
  const points: DatedMilestone[] = milestones
    .flatMap((milestone) =>
      milestone.kind === 'milestone' && milestone.date
        ? [{ milestone, date: milestone.date, day: toDay(milestone.date) }]
        : [],
    )
    .filter((point) => inRange(range, point.day))
    .sort((a, b) => a.day - b.day);
  const freezes: DatedFreeze[] = milestones.flatMap((milestone) =>
    milestone.kind === 'freeze' && milestone.start && milestone.end
      ? [
          {
            milestone,
            first: milestone.start,
            last: milestone.end,
            start: toDay(milestone.start),
            endExclusive: toDay(addDays(milestone.end, 1)),
          },
        ]
      : [],
  );
  const { labelColumnWidth } = useTheme().palette.timeline;
  const todayDay = toDay(today);
  const lastIndex = points.length - 1;
  const trackX = (day: number) => fraction(range, day) * trackWidth;
  const obstacles: Interval[] = freezes.map(({ start, endExclusive }) => ({
    start: trackX(start),
    end: trackX(endExclusive),
  }));
  if (inRange(range, todayDay)) {
    const todayStart = trackX(todayDay + MID_DAY) + TODAY_OFFSET;
    obstacles.push({ start: todayStart, end: todayStart + TODAY_LABEL_WIDTH });
  }
  const labelWidths = milestoneLabelWidths(
    points.map(({ milestone, day }, index) => ({
      id: milestone.id,
      x: trackX(day),
      anchor: index === lastIndex ? 'end' : 'start',
    })),
    obstacles,
    {
      trackWidth,
      labelOffset: LABEL_OFFSET,
      diamondHalfWidth: DIAMOND_HALF_WIDTH,
      padding: LABEL_PADDING,
      minWidth: LABEL_MIN_WIDTH,
    },
  );

  return (
    <Box
      role="group"
      aria-label="Milestones"
      sx={(theme) => ({
        position: 'relative',
        height: theme.palette.timeline.milestoneRowHeight,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
      })}
    >
      <Box
        sx={(theme) => ({
          position: 'sticky',
          left: 0,
          zIndex: 2,
          width: theme.palette.timeline.labelColumnWidth,
          height: theme.palette.timeline.milestoneRowHeight - 1,
          px: 2,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          typography: 'caption',
          color: 'neutral.muted',
          bgcolor: 'background.default',
        })}
      >
        Milestones
        {labelAction}
      </Box>
      {milestones.length === 0 && emptyAction ? (
        <Box
          sx={(theme) => ({
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: theme.palette.timeline.labelColumnWidth,
            px: 1,
            display: 'flex',
            alignItems: 'center',
          })}
        >
          {emptyAction}
        </Box>
      ) : null}
      {freezes.map(({ milestone, first, last, start, endExclusive }) => {
        const bandPx = (fraction(range, endExclusive) - fraction(range, start)) * trackWidth;
        if (bandPx <= 0) return null;
        const short = bandPx <= FREEZE_SHORT_LABEL_MAX_PX;
        const dates = `${formatDayMonth(first)} – ${formatDayMonth(last)}`;
        return (
          <Box
            key={milestone.id}
            role="img"
            aria-label={`${milestone.name} · ${dates}`}
            title={`${milestone.name} · ${dates}`}
            sx={(theme) => ({
              position: 'absolute',
              top: MARKER_TOP,
              height: MARKER_HEIGHT,
              borderRadius: 1,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `repeating-linear-gradient(135deg, ${theme.palette.milestone.freezeStripeA} 0 ${String(STRIPE_PX)}px, ${theme.palette.milestone.freezeStripeB} ${String(STRIPE_PX)}px ${String(STRIPE_PX * 2)}px)`,
            })}
            style={{ left: leftCss(range, start), width: widthCss(range, start, endExclusive) }}
          >
            <Box
              component="span"
              aria-hidden
              sx={(theme) => ({
                px: 0.625,
                borderRadius: 0.75,
                whiteSpace: 'nowrap',
                fontSize: theme.typography.overline.fontSize,
                fontWeight: theme.typography.fontWeightMedium,
                color: theme.palette.background.paper,
                bgcolor: theme.palette.milestone.freezeChip,
              })}
            >
              {short ? 'Freeze' : 'Code freeze'}
            </Box>
          </Box>
        );
      })}
      {points.map(({ milestone, date, day }, index) => {
        const label = `${milestone.name} · ${formatDayMonth(date)}`;
        const isLast = index === lastIndex;
        const labelWidth = labelWidths.get(milestone.id) ?? 0;
        // The last label grows leftwards from its diamond so it never overflows the timeline.
        const position = isLast
          ? {
              right: `calc((100% - ${String(labelColumnWidth)}px) * ${(1 - fraction(range, day)).toFixed(6)} - ${String(-DIAMOND_CENTRE_OFFSET)}px)`,
            }
          : { left: leftCss(range, day, DIAMOND_CENTRE_OFFSET) };
        return (
          <ButtonBase
            key={milestone.id}
            data-align={isLast ? 'end' : 'start'}
            // The visible text may be cut short to keep clear of chips and other labels.
            aria-label={label}
            title={label}
            sx={markerSx}
            style={position}
            onClick={() => {
              onMilestoneClick(milestoneMessage(milestone, items));
            }}
          >
            {isLast ? null : <Diamond />}
            {labelWidth > 0 ? (
              <Box
                component="span"
                aria-hidden
                data-milestone-label
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                style={{ maxWidth: labelWidth }}
              >
                {label}
              </Box>
            ) : null}
            {isLast ? <Diamond /> : null}
          </ButtonBase>
        );
      })}
      {inRange(range, todayDay) ? (
        <Box
          sx={(theme) => ({
            position: 'absolute',
            top: TODAY_TOP,
            height: TODAY_HEIGHT,
            px: 0.75,
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            borderRadius: 0.75,
            typography: 'overline',
            textTransform: 'none',
            lineHeight: 1,
            fontWeight: theme.typography.fontWeightBold,
            color: theme.palette.background.paper,
            bgcolor: theme.palette.neutral.todayLabel,
          })}
          style={{ left: leftCss(range, todayDay + MID_DAY, TODAY_OFFSET) }}
        >
          TODAY · {formatDayMonth(today)}
        </Box>
      ) : null}
    </Box>
  );
});
