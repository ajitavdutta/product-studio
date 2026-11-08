import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useRef } from 'react';
import { RecentDocumentList, type RecentDocument } from '../../../components/RecentDocumentList';

interface SavedRoadmapsPanelProps {
  roadmaps: readonly RecentDocument[];
  loading: boolean;
  /** The error message to show with Retry, or null when the list loaded. */
  error: string | null;
  onRetry: () => void;
  onOpen: (roadmap: RecentDocument) => void;
  /** Called with the `.json` file picked through "Load .json from computer…". */
  onLoadFile: (file: File) => void;
  loadingFile: boolean;
}

/** IMP-2: open a saved roadmap or a `.json` file instead of importing, skipping the mapping. */
export function SavedRoadmapsPanel({
  roadmaps,
  loading,
  error,
  onRetry,
  onOpen,
  onLoadFile,
  loadingFile,
}: SavedRoadmapsPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <RecentDocumentList
      title="Or open a saved roadmap"
      items={roadmaps}
      loading={loading}
      error={error}
      onRetry={onRetry}
      onOpen={onOpen}
      emptyState={
        <Typography variant="body2" sx={{ color: 'neutral.muted' }}>
          No saved roadmaps yet. Load a .json file you saved earlier.
        </Typography>
      }
      footer={
        <>
          <Button
            fullWidth
            variant="outlined"
            color="inherit"
            disabled={loadingFile}
            onClick={() => fileInput.current?.click()}
            sx={{ mt: 1, borderStyle: 'dashed', borderColor: 'neutral.borderInput' }}
          >
            Load .json from computer…
          </Button>
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
              if (file) onLoadFile(file);
            }}
          />
        </>
      }
    />
  );
}
