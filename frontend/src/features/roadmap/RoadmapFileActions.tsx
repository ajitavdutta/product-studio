import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlined from '@mui/icons-material/FileUploadOutlined';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { documentDownloadUrl } from '../../api/client';
import type { RoadmapRead } from '../../api/useRoadmap';
import { useSnackbar } from '../../app/SnackbarProvider';
import { useOpenSavedRoadmap } from '../home/useHome';
import { SaveJsonDialog } from './components/SaveJsonDialog';

interface RoadmapFileActionsProps {
  roadmap: RoadmapRead;
  /** Autosave has edits that the server's file doesn't have yet. */
  saving: boolean;
  /** Send pending autosave edits now. */
  flush: () => void;
}

// Matches the toolbar's other outlined buttons.
const CONTROL_HEIGHT = 34;
const COPIED_MESSAGE = 'JSON copied';
const COPY_BLOCKED_MESSAGE = 'Copy was blocked';

/** RM-16: Save JSON (dialog with Copy and Download) and Open JSON for the roadmap toolbar. */
export function RoadmapFileActions({ roadmap, saving, flush }: RoadmapFileActionsProps) {
  const snackbar = useSnackbar();
  const openSaved = useOpenSavedRoadmap();
  const [saveOpen, setSaveOpen] = useState(false);

  const copyFailed = () => {
    snackbar.error(COPY_BLOCKED_MESSAGE);
  };

  const copy = (json: string) => {
    // `clipboard` is missing on insecure origins, so treat its absence as blocked.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) {
      copyFailed();
      return;
    }
    clipboard.writeText(json).then(() => {
      snackbar.notify(COPIED_MESSAGE);
    }, copyFailed);
  };

  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<FileDownloadOutlined />}
        onClick={() => {
          // The Download link serves the server's copy, so send any pending edits first.
          flush();
          setSaveOpen(true);
        }}
        sx={{ height: CONTROL_HEIGHT, borderColor: 'neutral.borderInput' }}
      >
        Save JSON
      </Button>
      <Button
        variant="outlined"
        color="inherit"
        component="label"
        startIcon={<FileUploadOutlined />}
        disabled={openSaved.pending}
        sx={{ height: CONTROL_HEIGHT, borderColor: 'neutral.borderInput' }}
      >
        {openSaved.pending ? 'Opening…' : 'Open JSON'}
        <input
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear it so choosing the same file again still fires a change.
            event.target.value = '';
            if (file) openSaved.open(file);
          }}
        />
      </Button>
      <SaveJsonDialog
        open={saveOpen}
        document={roadmap.document}
        fileName={roadmap.fileName}
        downloadUrl={documentDownloadUrl('roadmap', roadmap.id)}
        saving={saving}
        onCopy={copy}
        onClose={() => {
          setSaveOpen(false);
        }}
      />
    </>
  );
}
