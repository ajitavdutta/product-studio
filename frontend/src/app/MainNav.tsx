import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { matchPath, Link as RouterLink, useLocation } from 'react-router';

interface NavItem {
  label: string;
  to: string;
  /** The link is active anywhere under this path. */
  activePrefix: string;
}

// ASSUMPTION: with no document open, Roadmap and Swimlanes open the `demo` ids, which
// match the parity script's route map. M2/M3 point them at the last-opened document.
const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Import', to: '/import', activePrefix: '/import' },
  { label: 'Roadmap', to: '/roadmaps/demo', activePrefix: '/roadmaps' },
  { label: 'Swimlanes', to: '/diagrams/demo', activePrefix: '/diagrams' },
  { label: 'Exports', to: '/exports', activePrefix: '/exports' },
];

// Below the mobile breakpoint the bar wraps and links shrink to a 44px touch target.
const MOBILE_LINK_MIN_HEIGHT = 44;
const UNDERLINE_WIDTH = 2;

export function MainNav() {
  const { pathname } = useLocation();
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{ display: 'flex', alignSelf: 'stretch', gap: 0.25 }}
    >
      {NAV_ITEMS.map((item) => {
        const active = matchPath({ path: item.activePrefix, end: false }, pathname) !== null;
        return (
          <Link
            key={item.to}
            component={RouterLink}
            to={item.to}
            underline="none"
            aria-current={active ? 'page' : undefined}
            sx={(theme) => ({
              ...theme.typography.subtitle2,
              display: 'flex',
              alignItems: 'center',
              px: 1.75,
              color: 'text.secondary',
              borderBottom: `${String(UNDERLINE_WIDTH)}px solid transparent`,
              '&[aria-current="page"]': {
                color: 'primary.main',
                borderBottomColor: 'primary.main',
              },
              [theme.custom.media.mobile]: { px: 1, minHeight: MOBILE_LINK_MIN_HEIGHT },
            })}
          >
            {item.label}
          </Link>
        );
      })}
    </Box>
  );
}
