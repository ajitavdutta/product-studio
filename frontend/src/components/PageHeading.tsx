import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface PageHeadingProps {
  title: string;
  lede: ReactNode;
}

/** A page's h1 and the one-line lede under it (prototype `.h1` + `.lede`). */
export function PageHeading({ title, lede }: PageHeadingProps) {
  return (
    <div>
      <Typography variant="h1" component="h1">
        {title}
      </Typography>
      <Typography variant="body1" sx={{ mt: 0.5, color: 'neutral.muted' }}>
        {lede}
      </Typography>
    </div>
  );
}
