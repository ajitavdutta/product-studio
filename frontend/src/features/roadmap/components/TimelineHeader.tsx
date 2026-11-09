import Box from '@mui/material/Box';
import { type Theme, useTheme } from '@mui/material/styles';
import { memo, useMemo, type ReactNode } from 'react';
import {
  type Column,
  columns as buildColumns,
  type DateRange,
  leftCss,
  type Pi,
  sprintAt,
  sprintDateLabel,
  sprintTooltip,
  type TimelineView,
  toDay,
  widthCss,
} from '../../../lib/timeline';

interface TimelineHeaderProps {
  view: TimelineView;
  range: DateRange;
  pis: readonly Pi[];
  today: string;
  /** Rendered sprint column width in px; picks the sprint date form (RM-5). */
  colW: number;
  /** Extra control in the corner cell (Manage PIs, task 10). */
  cornerAction?: ReactNode;
}

const CORNER_SUBTITLE: Record<TimelineView, string> = {
  sprints: '2-week sprints',
  months: 'by month',
  pis: 'Program Increments',
};

// Prototype `.hc` rows: the PI band and the PI-view PI row sit above the sprint cells and ticks.
const SPRINT_VIEW_PI_ROW_HEIGHT = 22;
const PI_VIEW_PI_ROW_HEIGHT = 34;
const STRONG_BORDER_WIDTH = 2;
const HATCH_STRIPE_PX = 4;

interface CellBox {
  top: number;
  height: number;
}

/** Vertical placement of each header row; the header's bottom border takes the last pixel. */
function rowBox(view: TimelineView, row: Column['row'], headerHeight: number): CellBox {
  const inner = headerHeight - 1;
  if (view === 'months') return { top: 0, height: inner };
  const bandHeight = view === 'sprints' ? SPRINT_VIEW_PI_ROW_HEIGHT : PI_VIEW_PI_ROW_HEIGHT;
  if (row === 'pi') return { top: 0, height: bandHeight };
  return { top: bandHeight, height: inner - bandHeight };
}

function cellSx(view: TimelineView, column: Column, startsPi: boolean) {
  return (theme: Theme) => {
    const { timeline, neutral } = theme.palette;
    const strongBorder = `${String(STRONG_BORDER_WIDTH)}px solid ${timeline.piBorder}`;
    const isBand = column.row === 'pi';
    const isFine = column.row === 'sprint' || column.row === 'tick';
    const hatch = `repeating-linear-gradient(135deg, ${timeline.ipHatch} 0 ${String(HATCH_STRIPE_PX)}px, ${theme.palette.background.paper} ${String(HATCH_STRIPE_PX)}px ${String(HATCH_STRIPE_PX * 2)}px)`;
    let background: string = theme.palette.background.paper;
    if (isBand && view === 'sprints') background = timeline.piBand;
    if (isFine && column.ip) background = hatch;
    if (isFine && column.current) background = timeline.currentSprint;
    return {
      position: 'absolute',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: view === 'months' ? 'flex-start' : 'center',
      textAlign: view === 'months' ? 'left' : 'center',
      px: column.row === 'tick' ? 0 : 1,
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      lineHeight: 1.25,
      boxSizing: 'border-box',
      background,
      borderLeft: isBand || startsPi ? strongBorder : `1px solid ${theme.palette.divider}`,
      borderBottom: isBand ? `1px solid ${theme.palette.divider}` : 0,
      color: column.current ? neutral.primaryDark : theme.palette.text.primary,
    } as const;
  };
}

function labelSx(view: TimelineView, column: Column) {
  return (theme: Theme) => {
    const { typography } = theme;
    const strong = column.current || (column.row === 'pi' && view === 'sprints');
    const fontSize =
      column.row === 'tick' || (column.row === 'pi' && view === 'sprints')
        ? typography.overline.fontSize
        : column.row === 'sprint'
          ? typography.caption.fontSize
          : typography.body2.fontSize;
    return {
      fontSize,
      fontWeight: strong
        ? typography.fontWeightBold
        : column.row === 'tick'
          ? typography.fontWeightRegular
          : typography.fontWeightMedium,
      color: column.row === 'tick' && !column.current ? theme.palette.text.secondary : 'inherit',
    } as const;
  };
}

function subSx(column: Column) {
  return (theme: Theme) =>
    ({
      fontSize: theme.typography.overline.fontSize,
      fontWeight: column.current
        ? theme.typography.fontWeightBold
        : theme.typography.fontWeightRegular,
      color: column.current ? 'inherit' : theme.palette.neutral.muted,
    }) as const;
}

/** Header cells of one timeline view (RM-5, RM-6, RM-7), positioned by date. */
export const TimelineHeader = memo(function TimelineHeader({
  view,
  range,
  pis,
  today,
  colW,
  cornerAction,
}: TimelineHeaderProps) {
  const cells = useMemo(() => buildColumns(view, range, pis, today), [view, range, pis, today]);
  const piStarts = useMemo(() => new Set(pis.map((pi) => pi.start)), [pis]);
  const { headerHeight } = useTheme().palette.timeline;
  return (
    <Box
      role="group"
      aria-label="Timeline header"
      sx={(theme) => ({
        position: 'relative',
        height: theme.palette.timeline.headerHeight,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      })}
    >
      <Box
        sx={(theme) => ({
          position: 'sticky',
          left: 0,
          zIndex: 2,
          width: theme.palette.timeline.labelColumnWidth,
          height: theme.palette.timeline.headerHeight - 1,
          px: 2,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          color: 'neutral.muted',
          typography: 'overline',
          textTransform: 'none',
          letterSpacing: 'normal',
        })}
      >
        <Box component="span" sx={{ typography: 'overline', lineHeight: 1.4 }}>
          Team / Epic
        </Box>
        <span>{CORNER_SUBTITLE[view]}</span>
        {cornerAction}
      </Box>
      {cells.map((column) => {
        const sprint = column.row === 'sprint' ? sprintAt(pis, column.start) : null;
        const pi = sprint ? pis.find((candidate) => candidate.id === sprint.piId) : undefined;
        const startsPi =
          column.row !== 'pi' && column.row !== 'month' && piStarts.has(column.start);
        const box = rowBox(view, column.row, headerHeight);
        const dates = sprint
          ? sprintDateLabel(sprint.start, sprint.endExclusive, colW)
          : column.sub;
        return (
          <Box
            key={`${column.row}:${column.start}`}
            data-current={column.current}
            aria-current={column.current ? 'date' : undefined}
            title={sprint && pi ? sprintTooltip(pi, sprint) : undefined}
            sx={cellSx(view, column, startsPi)}
            style={{
              top: box.top,
              height: box.height,
              left: leftCss(range, toDay(column.start)),
              width: widthCss(range, toDay(column.start), toDay(column.endExclusive)),
            }}
          >
            <Box component="b" sx={labelSx(view, column)}>
              {column.label}
            </Box>
            {dates ? (
              <Box component="small" sx={subSx(column)}>
                {dates}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
});
