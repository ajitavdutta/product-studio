import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useMappingTemplates } from '../../api/useMappingTemplates';
import { useApplyResync, useCreateResync } from '../../api/useResync';
import type { RoadmapRead } from '../../api/useRoadmap';
import { useSnackbar } from '../../app/SnackbarProvider';
import { AUTOMATIC_MAPPING, initialSelection, resyncMappingFields } from '../../lib/roadmap/resync';
import { ResyncDialog } from './components/ResyncDialog';

interface RoadmapResyncProps {
  roadmap: RoadmapRead;
  /** Autosave's state and `replace`, so the applied roadmap becomes the next PATCH's base. */
  saving: boolean;
  replace: (read: RoadmapRead) => void;
  onClose: () => void;
}

const NOT_FOUND_STATUS = 404;
const CONFLICT_STATUS = 409;
const UPDATED_MESSAGE = 'Roadmap updated from Jira';
const UPLOAD_FAILED = "Couldn't read that export";
const APPLY_FAILED = "Couldn't apply those changes";
const TEMPLATES_FAILED = "Couldn't load your mapping templates";

function detailOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback;
}

/** An expired diff (404) or a roadmap that changed since the upload (409) needs a new upload. */
function needsNewUpload(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === NOT_FOUND_STATUS || error.status === CONFLICT_STATUS)
  );
}

/** RM-15: the re-sync dialog wired to the API. Mount it only while it is open. */
export function RoadmapResync({ roadmap, saving, replace, onClose }: RoadmapResyncProps) {
  const snackbar = useSnackbar();
  const templates = useMappingTemplates();
  const create = useCreateResync(roadmap.id);
  const apply = useApplyResync(roadmap.id, replace);
  const [templateId, setTemplateId] = useState(
    roadmap.document.source.mappingTemplateId ?? AUTOMATIC_MAPPING,
  );
  // UI state: which change ids are ticked. The diff itself stays in the mutation.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Why the user is back on step 1 after a failed apply.
  const [restartReason, setRestartReason] = useState<string | null>(null);
  const resync = create.data ?? null;

  const upload = (file: File) => {
    setRestartReason(null);
    create.mutate(
      {
        file,
        mapping: resyncMappingFields(
          templateId,
          templates.data ? templates.data.map((template) => template.id) : null,
        ),
      },
      {
        onSuccess: (result) => {
          setSelected(initialSelection(result.changes));
        },
      },
    );
  };

  const backToUpload = (reason: string | null) => {
    setRestartReason(reason);
    create.reset();
    apply.reset();
  };

  const applySelected = () => {
    if (!resync) return;
    apply.mutate(
      {
        resyncId: resync.id,
        request: { baseVersion: roadmap.revision, changeIds: [...selected] },
      },
      {
        onSuccess: () => {
          snackbar.notify(UPDATED_MESSAGE);
          onClose();
        },
        onError: (error) => {
          if (needsNewUpload(error)) backToUpload(detailOf(error, APPLY_FAILED));
        },
      },
    );
  };

  const uploadError = create.isError ? detailOf(create.error, UPLOAD_FAILED) : restartReason;
  const applyError =
    apply.isError && !needsNewUpload(apply.error) ? detailOf(apply.error, APPLY_FAILED) : null;

  return (
    <ResyncDialog
      templates={templates.data ?? []}
      templatesLoading={templates.isPending}
      templatesError={templates.isError ? TEMPLATES_FAILED : null}
      onRetryTemplates={() => void templates.refetch()}
      templateId={templateId}
      onTemplateChange={setTemplateId}
      uploading={create.isPending ? create.variables.file : null}
      uploadError={uploadError}
      onFile={upload}
      resync={resync}
      selected={selected}
      onToggle={(changeId) => {
        setSelected((current) => {
          const next = new Set(current);
          if (!next.delete(changeId)) next.add(changeId);
          return next;
        });
      }}
      applying={apply.isPending}
      saving={saving}
      applyError={applyError}
      onApply={applySelected}
      onBack={() => {
        backToUpload(null);
      }}
      onClose={onClose}
    />
  );
}
