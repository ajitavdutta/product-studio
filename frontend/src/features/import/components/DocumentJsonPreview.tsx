import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useId, useMemo } from 'react';
import type { ImportPreview } from '../../../api/useImports';
import { abbreviateDocument } from '../../../lib/importMapping/abbreviateJson';

interface DocumentJsonPreviewProps {
  /** The preview's document; undefined until the first preview arrives. */
  document: ImportPreview['document'] | undefined;
}

// Prototype `.code`: the block scrolls inside itself rather than growing the page.
const CODE_MAX_HEIGHT = 360;
const CODE_LINE_HEIGHT = 1.55;
const SKELETON_HEIGHT = 240;

/** IMP-11 "What gets saved": the document commit will save, abbreviated, updated live. */
export function DocumentJsonPreview({ document }: DocumentJsonPreviewProps) {
  const headingId = useId();
  const json = useMemo(() => (document ? abbreviateDocument(document) : null), [document]);

  return (
    <Box component="section" aria-labelledby={headingId}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          mb: 0.75,
        }}
      >
        <Typography
          id={headingId}
          variant="body2"
          component="h2"
          sx={{ fontWeight: 'fontWeightMedium' }}
        >
          What gets saved
        </Typography>
        <Typography
          variant="overline"
          component="span"
          sx={{ color: 'neutral.muted', letterSpacing: 0, textTransform: 'none' }}
        >
          roadmap JSON · schema v{document?.schemaVersion ?? 1}
        </Typography>
      </Box>
      {json === null ? (
        <Skeleton variant="rounded" height={SKELETON_HEIGHT} aria-label="Loading the document" />
      ) : (
        <Box
          component="pre"
          tabIndex={0}
          aria-label="Roadmap JSON"
          sx={(theme) => ({
            m: 0,
            px: 2,
            py: 1.75,
            bgcolor: 'neutral.codeBackground',
            color: 'neutral.codeText',
            borderRadius: `${String(theme.custom.radius.lg)}px`,
            fontFamily: 'fontFamilyMono',
            fontSize: theme.typography.caption.fontSize,
            lineHeight: CODE_LINE_HEIGHT,
            whiteSpace: 'pre',
            overflow: 'auto',
            maxHeight: CODE_MAX_HEIGHT,
          })}
        >
          {json}
        </Box>
      )}
    </Box>
  );
}
