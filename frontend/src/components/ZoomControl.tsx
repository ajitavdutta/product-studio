import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';

interface ZoomControlProps {
  /** Current zoom as a factor (1 = 100%). */
  zoom: number;
  min: number;
  max: number;
  onStep: (direction: 1 | -1) => void;
  onReset: () => void;
  onFit: () => void;
}

const PERCENT = 100;
/** Float noise near a limit must not leave a button enabled that does nothing. */
const LIMIT_EPSILON = 1e-6;

const buttonSx = {
  color: 'text.secondary',
  borderColor: 'neutral.borderInput',
  minWidth: 32,
  '&:hover': { borderColor: 'neutral.borderInput', bgcolor: 'neutral.hover' },
} as const;

/** −, NN% (reset), + and Fit (RM-20, SW-19). The roadmap and the swimlane canvas share it. */
export function ZoomControl({ zoom, min, max, onStep, onReset, onFit }: ZoomControlProps) {
  const percent = Math.round(zoom * PERCENT);
  return (
    <ButtonGroup variant="outlined" size="small" role="group" aria-label="Zoom">
      <Button
        sx={buttonSx}
        aria-label="Zoom out"
        title="Zoom out (Ctrl −)"
        disabled={zoom <= min + LIMIT_EPSILON}
        onClick={() => {
          onStep(-1);
        }}
      >
        <RemoveIcon fontSize="small" aria-hidden />
      </Button>
      <Button
        sx={{
          ...buttonSx,
          minWidth: 56,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 'fontWeightMedium',
        }}
        aria-label={`Zoom ${String(percent)}%, reset to 100%`}
        title="Reset to 100% (Ctrl 0)"
        onClick={onReset}
      >
        {percent}%
      </Button>
      <Button
        sx={buttonSx}
        aria-label="Zoom in"
        title="Zoom in (Ctrl +)"
        disabled={zoom >= max - LIMIT_EPSILON}
        onClick={() => {
          onStep(1);
        }}
      >
        <AddIcon fontSize="small" aria-hidden />
      </Button>
      <Button sx={buttonSx} title="Fit to window" onClick={onFit}>
        Fit
      </Button>
    </ButtonGroup>
  );
}
