import Box from '@mui/material/Box';
import type { ReactNode } from 'react';

const PAGE_MAX_WIDTH = 1440;

/** The centred page column under the top bar (prototype `.page`). */
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={(theme) => ({
        maxWidth: PAGE_MAX_WIDTH,
        mx: 'auto',
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
        [theme.custom.media.mobile]: { p: 2 },
      })}
    >
      {children}
    </Box>
  );
}
