import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { matchPath, Link as RouterLink, useLocation } from 'react-router';
import { useDiagrams } from '../api/useDiagram';
import { useRoadmaps } from '../api/useRoadmap';

interface NavItem {
  label: string;
  to: string;
  /** The link is active anywhere under this path. */
  activePrefix: string;
}

// Roadmap and Swimlanes open the most recently updated document (the lists come back newest
// first). With none, or while the lists load or fail, Roadmap offers Import and Swimlanes Home.
function useNavItems(): readonly NavItem[] {
  const latestRoadmap = useRoadmaps().data?.at(0);
  const latestDiagram = useDiagrams().data?.at(0);
  return [
    { label: 'Import', to: '/import', activePrefix: '/import' },
    {
      label: 'Roadmap',
      to: latestRoadmap ? `/roadmaps/${latestRoadmap.id}` : '/import',
      activePrefix: '/roadmaps',
    },
    {
      label: 'Swimlanes',
      to: latestDiagram ? `/diagrams/${latestDiagram.id}` : '/',
      activePrefix: '/diagrams',
    },
    { label: 'Exports', to: '/exports', activePrefix: '/exports' },
  ];
}

// Below the mobile breakpoint the bar wraps and links shrink to a 44px touch target.
const MOBILE_LINK_MIN_HEIGHT = 44;
const UNDERLINE_WIDTH = 2;

export function MainNav() {
  const { pathname } = useLocation();
  const navItems = useNavItems();
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{ display: 'flex', alignSelf: 'stretch', gap: 0.25 }}
    >
      {navItems.map((item) => {
        const active = matchPath({ path: item.activePrefix, end: false }, pathname) !== null;
        return (
          <Link
            key={item.label}
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
