import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { useSnackbar } from '../../app/SnackbarProvider';
import { ApiError, documentDownloadUrl } from '../../api/client';
import {
  useCommitImport,
  useImportPreview,
  useImportSession,
  type ImportMapping,
  type ImportSessionRead,
} from '../../api/useImports';
import { PageContainer } from '../../components/PageContainer';
import { PageHeading } from '../../components/PageHeading';
import { DEFAULT_ROLLUP, missingRequired } from '../../lib/importMapping/mapping';
import { formatFileSize } from '../../lib/importMapping/previewFormat';
import { ColumnMappingTable } from './components/ColumnMappingTable';
import { CreateRoadmapDialog } from './components/CreateRoadmapDialog';
import { DocumentJsonPreview } from './components/DocumentJsonPreview';
import { ImportActionBar } from './components/ImportActionBar';
import { ImportPreviewPanel } from './components/ImportPreviewPanel';
import { ImportStepper } from './components/ImportStepper';
import { RollupRules } from './components/RollupRules';
import { StatusMappingGrid } from './components/StatusMappingGrid';
import { useImportDraft } from './state';

const NOT_FOUND_STATUS = 404;
// Prototype: the mapping card grows from 560px and the side panel wraps below it.
const MAPPING_CARD_BASIS = 560;
const SKELETON_TABLE_HEIGHT = 420;
// Prototype `.side`: the preview column grows from 300px up to 380px.
const SIDE_PANEL_BASIS = 300;
const SIDE_PANEL_MAX_WIDTH = 380;
// ASSUMPTION (plan): each mapping edit waits this long before asking for a new preview.
const PREVIEW_DEBOUNCE_MS = 300;
const PREVIEW_ERROR = "Couldn't build the preview.";
const COMMIT_ERROR = "Couldn't create the roadmap.";

/** `value`, but only once it has stopped changing for `delayMs`. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}

/** Download the saved document from the backend (ADR-1: the browser never builds the file). */
function downloadDocument(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback;
}

/** Step 2 of the import (`/import/:sessionId`): map columns and statuses, pick roll-up rules. */
export function MapFieldsPage() {
  // The route always supplies :sessionId; an empty id simply 404s.
  const { sessionId = '' } = useParams();
  const session = useImportSession(sessionId);

  if (session.isPending) {
    return (
      <PageContainer>
        <Box aria-busy="true" aria-label="Loading the import">
          <Skeleton variant="text" width="30%" height={40} />
          <Skeleton variant="text" width="45%" />
          <Skeleton variant="rounded" height={SKELETON_TABLE_HEIGHT} sx={{ mt: 2 }} />
        </Box>
      </PageContainer>
    );
  }

  if (session.isError) {
    if (session.error instanceof ApiError && session.error.status === NOT_FOUND_STATUS) {
      return (
        <PageContainer>
          <PageHeading
            title="That import has expired."
            lede="Imports are kept for an hour. Upload the file again to map it."
          />
          <Box>
            <Button variant="contained" component={RouterLink} to="/import">
              Upload again
            </Button>
          </Box>
        </PageContainer>
      );
    }
    return (
      <PageContainer>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void session.refetch()}>
              Retry
            </Button>
          }
        >
          Couldn't load the import.
        </Alert>
      </PageContainer>
    );
  }

  return <MapFields session={session.data} />;
}

function MapFields({ session }: { session: ImportSessionRead }) {
  const { draft, actions } = useImportDraft(session);
  const { mapping } = draft;
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const debouncedMapping = useDebouncedValue(mapping, PREVIEW_DEBOUNCE_MS);
  // A blank name can't be previewed (the server needs 1–200 characters); keep the last preview.
  const preview = useImportPreview(
    session.id,
    debouncedMapping.name.trim() === '' ? undefined : debouncedMapping,
  );
  const commit = useCommitImport(session.id);
  const missing = missingRequired(mapping.columns);
  const previewStale = preview.isPlaceholderData || debouncedMapping !== mapping;

  const openCreate = () => {
    commit.reset();
    actions.setCreateOpen(true);
  };

  const confirmCreate = () => {
    const body: ImportMapping & { updateTemplate: boolean } = {
      ...mapping,
      updateTemplate: draft.updateTemplate,
    };
    commit.mutate(body, {
      onSuccess: (created) => {
        downloadDocument(documentDownloadUrl('roadmap', created.id), created.fileName);
        actions.discard();
        snackbar.notify(`Saved ${created.fileName}`);
        void navigate(`/roadmaps/${encodeURIComponent(created.id)}`);
      },
    });
  };

  return (
    <PageContainer>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <PageHeading
          title="Map Jira fields"
          lede={
            <>
              <Box component="span" sx={{ fontFamily: 'fontFamilyMono' }}>
                {session.fileName}
              </Box>{' '}
              · {formatFileSize(session.size)} · {session.rowCount} issues · {session.formatLabel}
            </>
          }
        />
        {/* ASSUMPTION (plan): step 3 is current while the Create confirmation is open. */}
        <ImportStepper active={draft.createOpen ? 2 : 1} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'flex-start' }}>
        <Paper
          variant="outlined"
          sx={(theme) => ({
            flex: `1 1 ${String(MAPPING_CARD_BASIS)}px`,
            minWidth: 0,
            borderRadius: `${String(theme.custom.radius.lg)}px`,
            overflow: 'hidden',
          })}
        >
          <ColumnMappingTable
            columns={session.columns}
            fields={mapping.columns}
            ignoredCount={session.ignoredColumns.length}
            onChange={actions.setColumnField}
          />
          <StatusMappingGrid
            statuses={session.statuses}
            statusMap={mapping.statusMap}
            customStatuses={mapping.customStatuses ?? []}
            onChange={actions.setStatus}
            onAddCustomStatus={actions.addCustomStatus}
          />
          <RollupRules rules={mapping.rollup ?? DEFAULT_ROLLUP} onChange={actions.setRollup} />
        </Paper>
        <Box
          component="aside"
          aria-label="Preview and save"
          sx={(theme) => ({
            flex: `1 1 ${String(SIDE_PANEL_BASIS)}px`,
            maxWidth: SIDE_PANEL_MAX_WIDTH,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            // Stacked below the table on a phone, the panel takes the full width.
            [theme.custom.media.mobile]: { maxWidth: 'none' },
          })}
        >
          <ImportPreviewPanel
            preview={preview.data}
            refreshing={preview.isFetching && preview.data !== undefined}
            error={preview.isError ? errorMessage(preview.error, PREVIEW_ERROR) : null}
            onRetry={() => void preview.refetch()}
          />
          <DocumentJsonPreview document={preview.data?.document} />
        </Box>
      </Box>
      <ImportActionBar
        name={mapping.name}
        onNameChange={actions.setName}
        fileName={preview.data?.fileName ?? ''}
        hasTemplate={session.templateId != null}
        updateTemplate={draft.updateTemplate}
        onUpdateTemplateChange={actions.setUpdateTemplate}
        missingRequired={missing}
        previewReady={preview.data !== undefined}
        onCreate={openCreate}
      />
      {preview.data && (
        <CreateRoadmapDialog
          open={draft.createOpen}
          name={mapping.name}
          issueCount={session.rowCount}
          preview={preview.data}
          previewStale={previewStale}
          creating={commit.isPending}
          error={commit.isError ? errorMessage(commit.error, COMMIT_ERROR) : null}
          onConfirm={confirmCreate}
          onCancel={() => {
            actions.setCreateOpen(false);
          }}
        />
      )}
    </PageContainer>
  );
}
