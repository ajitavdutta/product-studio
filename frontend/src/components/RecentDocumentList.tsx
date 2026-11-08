import DeleteOutline from '@mui/icons-material/DeleteOutline';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useId, type ReactNode } from 'react';

export interface RecentDocument {
  id: string;
  name: string;
  fileName: string;
  /** ISO date-time from the server. */
  updatedAt: string;
}

interface RecentDocumentListProps {
  title: string;
  items: readonly RecentDocument[];
  onOpen: (item: RecentDocument) => void;
  /** When set, each row gets a Delete icon button. */
  onDelete?: (item: RecentDocument) => void;
  emptyState: ReactNode;
  loading: boolean;
  /** The error message to show with Retry, or null when the list loaded. */
  error: string | null;
  onRetry: () => void;
  /** Extra content at the bottom of the card, such as Import's "Load .json from computer…". */
  footer?: ReactNode;
}

const SKELETON_ROWS = 3;
const SKELETON_ROW_HEIGHT = 44;
const UPDATED_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "Updated 2 Nov 2026", in the viewer's time zone. */
export function formatUpdated(updatedAt: string): string {
  return `Updated ${UPDATED_FORMAT.format(new Date(updatedAt))}`;
}

/** A card listing saved documents (prototype `.card` + `.list-row`), used on Home and Import. */
export function RecentDocumentList(props: RecentDocumentListProps) {
  const headingId = useId();
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={headingId}
      sx={(theme) => ({ p: 2, borderRadius: `${String(theme.custom.radius.lg)}px` })}
    >
      <Typography id={headingId} variant="subtitle2" component="h2" sx={{ mb: 0.75 }}>
        {props.title}
      </Typography>
      <ListBody {...props} />
      {props.footer}
    </Paper>
  );
}

function ListBody({
  title,
  items,
  onOpen,
  onDelete,
  emptyState,
  loading,
  error,
  onRetry,
}: RecentDocumentListProps) {
  if (loading) {
    return (
      <Box aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <Skeleton key={row} variant="rounded" height={SKELETON_ROW_HEIGHT} sx={{ my: 1 }} />
        ))}
      </Box>
    );
  }
  if (error !== null) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }
  if (items.length === 0) return <Box sx={{ py: 1 }}>{emptyState}</Box>;

  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            py: 1.25,
            borderBottom: 1,
            borderColor: 'neutral.borderSubtle',
            '&:last-of-type': { borderBottom: 0 },
          }}
        >
          <InsertDriveFileOutlined aria-hidden sx={{ color: 'neutral.muted' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              {item.name}
            </Typography>
            <Typography
              variant="caption"
              component="div"
              noWrap
              sx={{ fontFamily: 'fontFamilyMono', color: 'neutral.muted' }}
            >
              {item.fileName}
            </Typography>
            <Typography variant="caption" component="div" sx={{ color: 'neutral.muted' }}>
              {formatUpdated(item.updatedAt)}
            </Typography>
          </Box>
          <Button
            size="small"
            aria-label={`Open ${item.name}`}
            onClick={() => {
              onOpen(item);
            }}
          >
            Open
          </Button>
          {onDelete && (
            <IconButton
              size="small"
              aria-label={`Delete ${item.name}`}
              onClick={() => {
                onDelete(item);
              }}
              sx={{ color: 'neutral.muted' }}
            >
              <DeleteOutline fontSize="small" />
            </IconButton>
          )}
        </Box>
      ))}
    </Box>
  );
}
