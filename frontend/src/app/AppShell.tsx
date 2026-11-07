import Box from '@mui/material/Box';
import { Outlet } from 'react-router';
import { SaveStateIndicator } from '../components/SaveStateIndicator';
import { Wordmark } from '../components/Wordmark';
import { MainNav } from './MainNav';
import { useSaveStateStore } from './saveState';

function SaveStateSlot() {
  const state = useSaveStateStore((store) => store.state);
  const fileName = useSaveStateStore((store) => store.fileName);
  if (state === null) return null;
  return <SaveStateIndicator state={state} fileName={fileName ?? undefined} />;
}

/** The root layout: the 56px top bar (G-1) above the routed page. */
export function AppShell() {
  return (
    <>
      <Box
        component="header"
        sx={(theme) => ({
          position: 'sticky',
          top: 0,
          zIndex: theme.zIndex.appBar,
          minHeight: theme.custom.layout.appBarHeight,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2.5,
          px: 2.5,
          // G-5: on a phone the wrapped bar scrolls away with the page.
          [theme.custom.media.mobile]: { position: 'static' },
        })}
      >
        <Wordmark />
        <MainNav />
        <Box sx={{ flex: 1 }} />
        <SaveStateSlot />
      </Box>
      <Box component="main">
        <Outlet />
      </Box>
    </>
  );
}
