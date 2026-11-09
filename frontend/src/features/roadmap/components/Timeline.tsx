import Box from '@mui/material/Box';
import type { ReactNode, Ref } from 'react';
import tokens from '../../../../../shared/design-tokens.json';
import { baseMinWidth, type TimelineView } from '../../../lib/timeline';

interface TimelineProps {
  view: TimelineView;
  /** This view's horizontal zoom (RM-20). */
  zoom: number;
  /** The scroll box, for the page's Ctrl/Cmd+wheel zoom, Fit and anchored scrolling. */
  ref?: Ref<HTMLDivElement>;
  /** Timeline header (task 6). */
  header: ReactNode;
  /** Milestones row (task 6). */
  milestones: ReactNode;
  /** Painted before the rows, so bars cover it: column lines and IP bands. */
  underlay?: ReactNode;
  /** Painted after the rows, over the bars: milestone lines, freeze bands and Today. */
  overlay?: ReactNode;
  /** The rows (`TimelineRows`). */
  children: ReactNode;
}

const LABEL_COLUMN_WIDTH = tokens.timeline.labelColumnWidth;

/** `calc(220px + (100% − 220px) × z)`: the label column never zooms. */
function zoomedWidth(zoom: number): string {
  return `calc(${String(LABEL_COLUMN_WIDTH)}px + (100% - ${String(LABEL_COLUMN_WIDTH)}px) * ${String(zoom)})`;
}

/** `220 + (baseMinW − 220) × z`, so the view stays readable when the box is narrow. */
function zoomedMinWidth(view: TimelineView, zoom: number): number {
  return Math.round(LABEL_COLUMN_WIDTH + (baseMinWidth(view) - LABEL_COLUMN_WIDTH) * zoom);
}

/**
 * The horizontally scrolling timeline (prototype `.tlscroll` > `.tl`). Every child is positioned
 * against the zoomed inner box, so `leftCss`/`widthCss` percentages line up across all layers.
 */
export function Timeline({
  view,
  zoom,
  ref,
  header,
  milestones,
  underlay,
  overlay,
  children,
}: TimelineProps) {
  return (
    <Box
      ref={ref}
      role="region"
      aria-label="Roadmap timeline"
      sx={{ flex: 1, minWidth: 0, overflowX: 'auto', bgcolor: 'background.paper' }}
    >
      <Box
        data-testid="timeline-content"
        style={{ width: zoomedWidth(zoom), minWidth: zoomedMinWidth(view, zoom) }}
        sx={{ position: 'relative' }}
      >
        {underlay}
        {header}
        {milestones}
        {children}
        {overlay}
      </Box>
    </Box>
  );
}
