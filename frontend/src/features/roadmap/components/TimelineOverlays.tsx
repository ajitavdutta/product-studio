import Box from '@mui/material/Box';
import { alpha, type Theme } from '@mui/material/styles';
import { memo, useMemo } from 'react';
import type { RoadmapDocument } from '../../../api/useRoadmap';
import {
  addDays,
  allSprints,
  boundaries,
  type DateRange,
  leftCss,
  type Pi,
  type TimelineView,
  toDay,
  widthCss,
} from '../../../lib/timeline';

type Milestone = RoadmapDocument['milestones'][number];

interface TimelineOverlaysProps {
  /**
   * `grid` (column lines, IP bands) goes under the rows; `markers` (milestone lines, freeze
   * bands, Today) goes over them. Neither takes pointer events.
   */
  layer: 'grid' | 'markers';
  view: TimelineView;
  range: DateRange;
  pis: readonly Pi[];
  today: string;
  milestones: readonly Milestone[];
  showMilestoneLines: boolean;
}

const STRONG_LINE_PX = 2;
const MILESTONE_LINE_PX = 2;
const TODAY_LINE_PX = 2;
/** Today's line sits in the middle of the day, centred on its own width. */
const MID_DAY = 0.5;
const IP_STRIPE_PX = 5;
const FREEZE_STRIPE_PX = 6;
const FREEZE_TINT_OPACITY = 0.13;

const overlaySx = { position: 'absolute', bottom: 0, pointerEvents: 'none' } as const;

function inRange(range: DateRange, day: number): boolean {
  return toDay(range.start) <= day && day < toDay(range.endExclusive);
}

/** Top of the body: below the header and the milestones row. */
function bodyTop(theme: Theme): number {
  return theme.palette.timeline.headerHeight + theme.palette.timeline.milestoneRowHeight;
}

function GridLayer({ view, range, pis }: Pick<TimelineOverlaysProps, 'view' | 'range' | 'pis'>) {
  const lines = useMemo(() => boundaries(view, range, pis), [view, range, pis]);
  const ipBands = useMemo(() => {
    if (view === 'months') return [];
    const start = toDay(range.start);
    const end = toDay(range.endExclusive);
    return allSprints(pis).filter(
      (sprint) => sprint.ip && toDay(sprint.start) < end && start < toDay(sprint.endExclusive),
    );
  }, [view, range, pis]);
  return (
    <>
      {ipBands.map((sprint) => (
        <Box
          key={`ip:${sprint.start}`}
          aria-hidden
          data-overlay="ip"
          sx={(theme) => ({
            ...overlaySx,
            top: bodyTop(theme),
            background: `repeating-linear-gradient(135deg, ${theme.palette.timeline.ipHatch} 0 ${String(IP_STRIPE_PX)}px, transparent ${String(IP_STRIPE_PX)}px ${String(IP_STRIPE_PX * 2)}px)`,
          })}
          style={{
            left: leftCss(range, toDay(sprint.start)),
            width: widthCss(range, toDay(sprint.start), toDay(sprint.endExclusive)),
          }}
        />
      ))}
      {lines.map((line) => (
        <Box
          key={`line:${line.date}`}
          aria-hidden
          data-overlay={line.strong ? 'pi-line' : 'column-line'}
          sx={(theme) => ({
            ...overlaySx,
            top: bodyTop(theme),
            // A bare 1 would mean 100% to MUI's sizing, so widths are given in px.
            width: `${String(line.strong ? STRONG_LINE_PX : 1)}px`,
            bgcolor: line.strong
              ? theme.palette.timeline.piLine
              : view === 'months'
                ? theme.palette.timeline.columnLine
                : theme.palette.neutral.borderSubtle,
          })}
          style={{ left: leftCss(range, toDay(line.date)) }}
        />
      ))}
    </>
  );
}

function MarkersLayer({
  range,
  today,
  milestones,
  showMilestoneLines,
}: Pick<TimelineOverlaysProps, 'range' | 'today' | 'milestones' | 'showMilestoneLines'>) {
  const todayDay = toDay(today);
  return (
    <>
      {showMilestoneLines
        ? milestones.map((milestone) => {
            if (milestone.kind === 'freeze' && milestone.start && milestone.end) {
              const start = toDay(milestone.start);
              const endExclusive = toDay(addDays(milestone.end, 1));
              return (
                <Box
                  key={milestone.id}
                  aria-hidden
                  data-overlay="freeze"
                  sx={(theme) => {
                    const stripe = alpha(
                      theme.palette.milestone.freezeStripeA,
                      FREEZE_TINT_OPACITY,
                    );
                    return {
                      ...overlaySx,
                      top: bodyTop(theme),
                      background: `repeating-linear-gradient(135deg, ${stripe} 0 ${String(FREEZE_STRIPE_PX)}px, transparent ${String(FREEZE_STRIPE_PX)}px ${String(FREEZE_STRIPE_PX * 2)}px)`,
                      borderLeft: `1px dashed ${theme.palette.milestone.freezeStripeA}`,
                      borderRight: `1px dashed ${theme.palette.milestone.freezeStripeA}`,
                      boxSizing: 'border-box',
                    };
                  }}
                  style={{
                    left: leftCss(range, start),
                    width: widthCss(range, start, endExclusive),
                  }}
                />
              );
            }
            if (milestone.kind !== 'milestone' || !milestone.date) return null;
            const day = toDay(milestone.date);
            if (!inRange(range, day)) return null;
            return (
              <Box
                key={milestone.id}
                aria-hidden
                data-overlay="milestone"
                sx={(theme) => ({
                  ...overlaySx,
                  top: bodyTop(theme),
                  width: 0,
                  borderLeft: `${String(MILESTONE_LINE_PX)}px dashed ${theme.palette.milestone.color}`,
                })}
                style={{ left: leftCss(range, day, -MILESTONE_LINE_PX / 2) }}
              />
            );
          })
        : null}
      {inRange(range, todayDay) ? (
        <Box
          aria-hidden
          data-overlay="today"
          sx={(theme) => ({
            ...overlaySx,
            top: theme.palette.timeline.headerHeight,
            width: TODAY_LINE_PX,
            bgcolor: theme.palette.neutral.today,
          })}
          style={{ left: leftCss(range, todayDay + MID_DAY, -TODAY_LINE_PX / 2) }}
        />
      ) : null}
    </>
  );
}

/**
 * Decorative layers of the timeline body (RM-5, RM-9, RM-10). Hidden from assistive tech:
 * the same information is in the header, the milestones row and each bar's label.
 */
export const TimelineOverlays = memo(function TimelineOverlays(props: TimelineOverlaysProps) {
  return props.layer === 'grid' ? <GridLayer {...props} /> : <MarkersLayer {...props} />;
});
