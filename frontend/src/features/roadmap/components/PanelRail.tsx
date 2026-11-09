import FirstPageIcon from '@mui/icons-material/FirstPage';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import type { Ref } from 'react';

interface PanelRailProps {
  /** `PAY-142 · Saved cards…`, or `Epic details` when nothing is selected. */
  label: string;
  onExpand: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
}

const VERTICAL_LABEL_MAX_HEIGHT = '60vh';

/** The collapsed detail panel (RM-14): a 48px rail with the selected epic in vertical text. */
export function PanelRail({ label, onExpand, toggleRef }: PanelRailProps) {
  return (
    <Box
      component="aside"
      aria-label="Epic details (collapsed)"
      sx={(theme) => ({
        flex: `0 0 ${String(theme.custom.layout.railWidth)}px`,
        width: theme.custom.layout.railWidth,
        bgcolor: 'background.paper',
        borderLeft: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.75,
        py: 1,
        [theme.custom.media.mobile]: {
          flex: '1 1 100%',
          width: '100%',
          flexDirection: 'row',
          px: 1,
          borderLeft: 0,
          borderTop: 1,
          borderColor: 'divider',
        },
      })}
    >
      <IconButton
        ref={toggleRef}
        size="small"
        aria-expanded={false}
        aria-label="Expand epic details"
        title="Expand epic details"
        onClick={onExpand}
      >
        <FirstPageIcon fontSize="small" />
      </IconButton>
      <ButtonBase
        tabIndex={-1}
        onClick={onExpand}
        sx={(theme) => ({
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          mt: 1,
          py: 0.75,
          maxHeight: VERTICAL_LABEL_MAX_HEIGHT,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          typography: 'caption',
          fontWeight: 'fontWeightMedium',
          color: 'text.secondary',
          '&:hover': { color: 'primary.main' },
          [theme.custom.media.mobile]: {
            writingMode: 'horizontal-tb',
            transform: 'none',
            mt: 0,
            px: 1,
          },
        })}
      >
        {label}
      </ButtonBase>
    </Box>
  );
}
