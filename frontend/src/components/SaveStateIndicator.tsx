import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export type SaveState = 'saved' | 'unsaved';

interface SaveStateIndicatorProps {
  state: SaveState;
  fileName?: string;
}

/** G-1: "Saved to <file>" with a cloud icon, or "Unsaved changes". */
export function SaveStateIndicator({ state, fileName }: SaveStateIndicatorProps) {
  if (state === 'unsaved') {
    return (
      <Typography role="status" variant="body2" sx={{ color: 'neutral.muted' }}>
        Unsaved changes
      </Typography>
    );
  }
  return (
    <Box
      role="status"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'success.main' }}
    >
      <CloudDoneOutlined fontSize="small" aria-hidden />
      <Typography variant="body2" component="span">
        {fileName ? `Saved to ${fileName}` : 'Saved'}
      </Typography>
    </Box>
  );
}
