import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router';

const MARK_SIZE = 26;

/** The "Product Studio" mark and name, linking home. */
export function Wordmark() {
  const theme = useTheme();
  return (
    <Link
      component={RouterLink}
      to="/"
      aria-label="Product Studio home"
      underline="none"
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'text.primary' }}
    >
      <svg width={MARK_SIZE} height={MARK_SIZE} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="6" fill={theme.palette.primary.main} />
        <path
          d="M6 8h7M6 12h11M6 16h5"
          stroke={theme.palette.background.paper}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <Typography variant="subtitle1" component="span">
        Product Studio
      </Typography>
    </Link>
  );
}
