import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../../api/client';
import {
  useSampleExportInfo,
  useStartSampleImport,
  useUploadJiraExport,
  type ImportSessionRead,
} from '../../api/useImports';
import { useMappingTemplates, type MappingTemplateRead } from '../../api/useMappingTemplates';
import { useImportRoadmapJson, useRoadmaps } from '../../api/useRoadmap';
import { useSnackbar } from '../../app/SnackbarProvider';
import { PageContainer } from '../../components/PageContainer';
import { PageHeading } from '../../components/PageHeading';
import { ImportStepper } from './components/ImportStepper';
import { JiraExportHelp } from './components/JiraExportHelp';
import { MappingTemplateSelect, NO_TEMPLATE } from './components/MappingTemplateSelect';
import { SavedRoadmapsPanel } from './components/SavedRoadmapsPanel';
import { UploadDropZone } from './components/UploadDropZone';

// ASSUMPTION: the side panel lists the three most recent roadmaps, as the prototype does.
const SAVED_ROADMAP_LIMIT = 3;
// Prototype `.grow` and `.side`: side by side until the main card would be under 520px.
const MAIN_FLEX = '999 1 520px';
const SIDE_FLEX = '1 1 300px';
const SIDE_MAX_WIDTH = 380;
const UPLOAD_FAILED = "Couldn't read that file";
const SAMPLE_FAILED = "Couldn't load the sample export";
const OPEN_JSON_FAILED = "Couldn't open that file";

function detailOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback;
}

/** ASSUMPTION (plan): the upload applies the most recently updated template by default. */
function latestTemplateId(templates: readonly MappingTemplateRead[] | undefined): string {
  const latest = templates?.reduce<MappingTemplateRead | undefined>(
    (best, template) =>
      best === undefined || template.updatedAt > best.updatedAt ? template : best,
    undefined,
  );
  return latest?.id ?? NO_TEMPLATE;
}

/** Step 1 of the import: upload a Jira export, use the sample, or open a saved roadmap. */
export function ImportPage() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [searchParams] = useSearchParams();
  const templates = useMappingTemplates();
  const sampleInfo = useSampleExportInfo();
  const roadmaps = useRoadmaps();
  const upload = useUploadJiraExport();
  const sample = useStartSampleImport();
  const importJson = useImportRoadmapJson();
  // Only the user's choice is kept; until they choose, the default follows the loaded templates.
  const [chosenTemplateId, setChosenTemplateId] = useState<string | null>(null);
  const templateId = chosenTemplateId ?? latestTemplateId(templates.data);

  const openMapping = (session: ImportSessionRead, replace = false) =>
    void navigate(`/import/${session.id}`, { replace });

  const uploadFile = (file: File) => {
    sample.reset();
    upload.mutate(
      { file, templateId },
      {
        onSuccess: (session) => {
          openMapping(session);
        },
      },
    );
  };

  const startSample = (replace = false) => {
    upload.reset();
    sample.mutate(templateId, {
      onSuccess: (session) => {
        openMapping(session, replace);
      },
    });
  };

  const openJsonFile = (file: File) => {
    importJson.mutate(file, {
      onSuccess: (roadmap) => void navigate(`/roadmaps/${roadmap.id}`),
      onError: (error) => {
        snackbar.error(detailOf(error, OPEN_JSON_FAILED));
      },
    });
  };

  // `/import?sample=1` (the parity capture and the journey guide) starts the sample once the
  // templates are known, so the default template applies. Replacing the entry keeps Back
  // from starting it again.
  const autoSample = searchParams.get('sample') === '1';
  const autoSampleStarted = useRef(false);
  useEffect(() => {
    if (!autoSample || autoSampleStarted.current || templates.isPending) return;
    autoSampleStarted.current = true;
    startSample(true);
    // startSample is recreated every render; the ref makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSample, templates.isPending]);

  const sampleLabel = sampleInfo.data
    ? `Use the sample export (${String(sampleInfo.data.rowCount)} issues)`
    : 'Use the sample export';
  const busy = upload.isPending || sample.isPending;

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
          title="Import from Jira"
          lede="Turn a Jira export into a roadmap, saved as a JSON file you can reopen and share."
        />
        <ImportStepper active={0} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 2.5 }}>
        <Paper
          component="section"
          variant="outlined"
          aria-label="Upload a Jira export"
          sx={(theme) => ({
            flex: MAIN_FLEX,
            minWidth: 0,
            p: 2,
            borderRadius: `${String(theme.custom.radius.lg)}px`,
          })}
        >
          <UploadDropZone
            onFile={uploadFile}
            uploading={upload.isPending ? upload.variables.file : null}
            error={upload.isError ? detailOf(upload.error, UPLOAD_FAILED) : null}
          />
          <Divider sx={{ my: 2, color: 'neutral.muted', typography: 'body2' }}>or</Divider>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => {
                startSample();
              }}
            >
              {sample.isPending ? 'Loading the sample export…' : sampleLabel}
            </Button>
            {sample.isError && (
              <Alert
                severity="error"
                sx={{ alignSelf: 'stretch' }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      startSample();
                    }}
                  >
                    Retry
                  </Button>
                }
              >
                {detailOf(sample.error, SAMPLE_FAILED)}
              </Alert>
            )}
          </Box>
          <JiraExportHelp />
        </Paper>
        <Box
          component="aside"
          sx={{
            flex: SIDE_FLEX,
            maxWidth: SIDE_MAX_WIDTH,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <SavedRoadmapsPanel
            roadmaps={roadmaps.data?.slice(0, SAVED_ROADMAP_LIMIT) ?? []}
            loading={roadmaps.isPending}
            error={roadmaps.isError ? "Couldn't load your roadmaps." : null}
            onRetry={() => void roadmaps.refetch()}
            onOpen={(roadmap) => void navigate(`/roadmaps/${roadmap.id}`)}
            onLoadFile={openJsonFile}
            loadingFile={importJson.isPending}
          />
          <MappingTemplateSelect
            templates={templates.data ?? []}
            value={templateId}
            onChange={setChosenTemplateId}
            loading={templates.isPending}
            error={templates.isError ? "Couldn't load your mapping templates." : null}
            onRetry={() => void templates.refetch()}
          />
        </Box>
      </Box>
    </PageContainer>
  );
}
