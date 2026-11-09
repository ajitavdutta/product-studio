import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { alpha, type Theme } from '@mui/material/styles';
import { memo } from 'react';
import { formatDayMonth, leftCss, toDay, widthCss } from '../../../lib/timeline';

interface EpicRowProps {
  itemId: string;
  itemKey: string;
  title: string;
  /** Inclusive ISO dates; the row is only rendered for scheduled items. */
  start: string;
  end: string;
  /** Stored progress, shown as is (never recomputed from issues). */
  progress: number;
  statusLabel: string;
  /** Resolved status token colour. */
  color: string;
  rangeStart: string;
  rangeEndExclusive: string;
  selected: boolean;
  onSelect: (itemId: string) => void;
}

// Prototype `.ebar`: a 30px bar 7px from the top of the 44px row, inset 2px each side.
const BAR_TOP = 7;
const BAR_HEIGHT = 30;
const BAR_INSET = 2;
const PROGRESS_HEIGHT = 3;
// A px string: a bare number in sx `borderRadius` is a multiple of the theme radius.
const PROGRESS_RADIUS = '2px';
const PROGRESS_TRACK_OPACITY = 0.35;
const PERCENT_MAX = 100;

function clampPercent(value: number): number {
  return Math.min(PERCENT_MAX, Math.max(0, value));
}

function barAriaLabel(props: EpicRowProps): string {
  return `${props.itemKey} ${props.title}, ${props.statusLabel}, ${String(props.progress)}% complete, ${formatDayMonth(props.start)} to ${formatDayMonth(props.end)}`;
}

const selectionRing = (theme: Theme) =>
  `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.neutral.primaryDark}`;

/**
 * RM-8: one epic row — the label button in the 220px column and the bar placed by date.
 * Memoised with primitive props, because every autosave clones the document and would
 * otherwise re-render every row.
 */
export const EpicRow = memo(function EpicRow(props: EpicRowProps) {
  const { itemId, itemKey, title, start, end, progress, color, selected, onSelect } = props;
  const range = { start: props.rangeStart, endExclusive: props.rangeEndExclusive };
  const startDay = toDay(start);
  const endDay = toDay(end) + 1;
  const visible = startDay < toDay(range.endExclusive) && endDay > toDay(range.start);
  const ariaCurrent = selected ? 'true' : undefined;

  return (
    <Box
      sx={{
        position: 'relative',
        height: (theme) => theme.palette.timeline.epicRowHeight,
        borderBottom: 1,
        borderColor: 'neutral.borderSubtle',
        bgcolor: selected ? 'neutral.primaryTintSoft' : undefined,
      }}
    >
      <ButtonBase
        aria-current={ariaCurrent}
        onClick={() => {
          onSelect(itemId);
        }}
        sx={{
          position: 'sticky',
          left: 0,
          zIndex: 2,
          width: (theme) => theme.palette.timeline.labelColumnWidth,
          height: '100%',
          px: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          textAlign: 'left',
          bgcolor: selected ? 'neutral.primaryTintSoft' : 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <Box
          component="span"
          sx={{
            fontFamily: 'fontFamilyMono',
            fontSize: 'overline.fontSize',
            color: 'primary.dark',
          }}
        >
          {itemKey}
        </Box>
        <Box
          component="span"
          sx={{
            typography: 'caption',
            color: 'text.secondary',
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </Box>
      </ButtonBase>
      {visible && (
        <ButtonBase
          aria-label={barAriaLabel(props)}
          aria-current={ariaCurrent}
          onClick={() => {
            onSelect(itemId);
          }}
          // Geometry changes with zoom and dates, so it goes inline instead of minting classes.
          style={{
            left: leftCss(range, startDay, BAR_INSET),
            width: widthCss(range, startDay, endDay, -2 * BAR_INSET),
            backgroundColor: color,
          }}
          sx={{
            position: 'absolute',
            top: BAR_TOP,
            height: BAR_HEIGHT,
            minWidth: 0,
            px: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'center',
            gap: '3px',
            overflow: 'hidden',
            borderRadius: (theme) => `${String(theme.custom.radius.md)}px`,
            color: 'background.paper',
            textAlign: 'left',
            boxShadow: selected ? selectionRing : undefined,
          }}
        >
          <Box
            component="span"
            sx={{
              typography: 'caption',
              fontWeight: 'fontWeightMedium',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </Box>
          <Box
            component="span"
            aria-hidden
            sx={{
              display: 'block',
              height: PROGRESS_HEIGHT,
              borderRadius: PROGRESS_RADIUS,
              bgcolor: (theme) => alpha(theme.palette.background.paper, PROGRESS_TRACK_OPACITY),
            }}
          >
            <Box
              component="span"
              data-testid="progress"
              style={{ width: `${String(clampPercent(progress))}%` }}
              sx={{
                display: 'block',
                height: PROGRESS_HEIGHT,
                borderRadius: PROGRESS_RADIUS,
                bgcolor: 'background.paper',
              }}
            />
          </Box>
        </ButtonBase>
      )}
    </Box>
  );
});
