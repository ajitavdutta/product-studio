import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Link from '@mui/material/Link';
import { useState } from 'react';
import type { RoadmapDocument } from '../../../api/useRoadmap';

type RoadmapItem = RoadmapDocument['items'][number];

interface UnscheduledTrayProps {
  items: readonly RoadmapItem[];
  onSchedule: (itemId: string) => void;
}

/** Drag payload type for a tray chip dropped on the timeline. */
export const TRAY_ITEM_MIME = 'application/x-product-studio-item';
/** Chips shown before "+ N more". */
export const TRAY_VISIBLE_CHIPS = 5;
const HINT = 'click one to schedule it in the next sprint';

/** Items without dates (RM-11). Click a chip, or drag it onto the timeline, to schedule it. */
export function UnscheduledTray({ items, onSchedule }: UnscheduledTrayProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, TRAY_VISIBLE_CHIPS);
  const hidden = items.length - shown.length;
  return (
    <Box
      component="section"
      aria-label="Unscheduled items"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1,
        px: 2,
        py: 1.5,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
      }}
    >
      <Box
        component="span"
        sx={{
          typography: 'caption',
          fontWeight: 'fontWeightMedium',
          color: 'text.secondary',
          mr: 0.5,
        }}
      >
        Unscheduled ({items.length})
      </Box>
      {shown.map((item) => (
        <ButtonBase
          key={item.id}
          draggable
          aria-label={`Schedule ${item.key} ${item.title} in the next sprint`}
          onClick={() => {
            onSchedule(item.id);
          }}
          onDragStart={(event) => {
            event.dataTransfer.setData(TRAY_ITEM_MIME, item.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          sx={{
            display: 'flex',
            gap: 0.75,
            px: 1,
            py: 0.5,
            typography: 'caption',
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'neutral.borderInput',
            borderRadius: 1,
            '&:hover': { bgcolor: 'neutral.hover' },
          }}
        >
          <Box
            component="span"
            sx={(theme) => ({ fontFamily: theme.typography.fontFamilyMono, color: 'primary.dark' })}
          >
            {item.key}
          </Box>
          {item.title}
        </ButtonBase>
      ))}
      <Box component="span" sx={{ typography: 'caption', color: 'neutral.muted' }}>
        {items.length === 0 ? (
          'Every item has dates.'
        ) : (
          <>
            {hidden > 0 ? (
              <>
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  aria-expanded={false}
                  onClick={() => {
                    setExpanded(true);
                  }}
                  sx={{ typography: 'caption', verticalAlign: 'baseline' }}
                >
                  + {hidden} more
                </Link>
                {' · '}
              </>
            ) : null}
            {HINT}
          </>
        )}
      </Box>
    </Box>
  );
}
