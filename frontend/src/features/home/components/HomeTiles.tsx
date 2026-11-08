import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import SegmentOutlined from '@mui/icons-material/SegmentOutlined';
import ViewListOutlined from '@mui/icons-material/ViewListOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useId, useRef, type ReactNode } from 'react';

interface HomeTilesProps {
  onImport: () => void;
  /** Called with the `.json` file the user picked for "Open a saved roadmap". */
  onRoadmapFile: (file: File) => void;
  onSwimlanes: () => void;
  openingRoadmap: boolean;
  openingSwimlanes: boolean;
}

// Prototype `.tiles`: as many 260px-minimum columns as fit, so a phone gets one.
const TILE_MIN_WIDTH = 260;
// The prototype draws the upload cloud larger than the other two tile icons.
const UPLOAD_ICON_SIZE = 40;
const TILE_ICON_SIZE = 22;
const BUSY_OPACITY = 0.6;
// Prototype `.tile span`.
const DESCRIPTION_LINE_HEIGHT = 1.45;

/** HOME-1: the three entry points. */
export function HomeTiles({
  onImport,
  onRoadmapFile,
  onSwimlanes,
  openingRoadmap,
  openingSwimlanes,
}: HomeTilesProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${String(TILE_MIN_WIDTH)}px, 1fr))`,
        gap: 2,
      }}
    >
      <Tile
        icon={<CloudUploadOutlined sx={{ fontSize: UPLOAD_ICON_SIZE }} />}
        title="Import from Jira"
        description="Upload a CSV, JSON or XML export. Map its fields once and reuse the mapping next time."
        onClick={onImport}
      />
      <Tile
        icon={<SegmentOutlined sx={{ fontSize: TILE_ICON_SIZE }} />}
        title="Open a saved roadmap"
        description="Reopen a roadmap .json file — dates, notes and milestones come back exactly as you left them."
        busy={openingRoadmap}
        onClick={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Roadmap .json file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clear it so picking the same file again still fires a change.
          event.target.value = '';
          if (file) onRoadmapFile(file);
        }}
      />
      <Tile
        icon={<ViewListOutlined sx={{ fontSize: TILE_ICON_SIZE }} />}
        title="Swimlane diagrams"
        description="Draw business workflows across teams and export them as PDF or PNG."
        busy={openingSwimlanes}
        onClick={onSwimlanes}
      />
    </Box>
  );
}

interface TileProps {
  icon: ReactNode;
  title: string;
  description: string;
  busy?: boolean;
  onClick: () => void;
}

function Tile({ icon, title, description, busy = false, onClick }: TileProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <ButtonBase
      // Named by the title alone; the description is read as its description.
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 1,
        p: 2.5,
        textAlign: 'left',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: `${String(theme.custom.radius.lg)}px`,
        '&:hover': { borderColor: 'primary.main', bgcolor: 'neutral.primaryTintSoft' },
        '&.Mui-disabled': { opacity: BUSY_OPACITY },
      })}
    >
      <Box aria-hidden sx={{ color: 'primary.main', display: 'flex' }}>
        {icon}
      </Box>
      <Typography id={titleId} variant="subtitle1" component="span" sx={{ color: 'text.primary' }}>
        {title}
      </Typography>
      <Typography
        id={descriptionId}
        variant="body2"
        component="span"
        sx={{ color: 'neutral.muted', lineHeight: DESCRIPTION_LINE_HEIGHT }}
      >
        {description}
      </Typography>
    </ButtonBase>
  );
}
