import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import {
  useCreateDiagram,
  useDeleteDiagram,
  useDiagramDeleteImpact,
  useDiagrams,
} from '../../api/useDiagram';
import {
  useDeleteRoadmap,
  useImportRoadmapJson,
  useRoadmapDeleteImpact,
} from '../../api/useRoadmap';
import { useSnackbar } from '../../app/SnackbarProvider';

export type DocumentKind = 'roadmap' | 'diagram';

/** The document the user asked to delete, while its confirmation is open. */
export interface DeleteTarget {
  kind: DocumentKind;
  id: string;
  name: string;
}

const OPEN_JSON_FAILED = "Couldn't open that file";
const LIST_DIAGRAMS_FAILED = "Couldn't load your diagrams";
const CREATE_DIAGRAM_FAILED = "Couldn't create a diagram";
const NEW_DIAGRAM = { name: 'Untitled workflow', lanesFrom: 'blank' } as const;

function detailOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback;
}

/** HOME-1 "Open a saved roadmap": upload a `.json` file, then open the roadmap it creates. */
export function useOpenSavedRoadmap() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const importJson = useImportRoadmapJson();
  const open = (file: File) => {
    importJson.mutate(file, {
      onSuccess: (roadmap) => void navigate(`/roadmaps/${roadmap.id}`),
      onError: (error) => {
        snackbar.error(detailOf(error, OPEN_JSON_FAILED));
      },
    });
  };
  return { open, pending: importJson.isPending };
}

/**
 * HOME-1 "Swimlane diagrams": open the most recently updated diagram, or create a blank
 * one when there are none. ASSUMPTION (plan): M4 replaces this with a diagrams list page.
 */
export function useOpenSwimlanes() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const diagrams = useDiagrams();
  const createDiagram = useCreateDiagram();

  const create = () => {
    createDiagram.mutate(NEW_DIAGRAM, {
      onSuccess: (diagram) => void navigate(`/diagrams/${diagram.id}`),
      onError: (error) => {
        snackbar.error(detailOf(error, CREATE_DIAGRAM_FAILED));
      },
    });
  };

  const open = async () => {
    // A click before the list has loaded waits for it rather than creating a duplicate blank.
    const list = diagrams.data ?? (await diagrams.refetch()).data;
    if (list === undefined) {
      snackbar.error(LIST_DIAGRAMS_FAILED);
      return;
    }
    const latest = list.at(0);
    if (latest) {
      void navigate(`/diagrams/${latest.id}`);
      return;
    }
    create();
  };

  return { open: () => void open(), create, pending: createDiagram.isPending };
}

/**
 * The delete confirmation: what deleting `target` would unlink, and the delete itself.
 * The impact is only fetched while a target of that kind is set.
 */
export function useDeleteDocument(target: DeleteTarget | null) {
  const snackbar = useSnackbar();
  const roadmapImpact = useRoadmapDeleteImpact(
    target?.kind === 'roadmap' ? target.id : '',
    target?.kind === 'roadmap',
  );
  const diagramImpact = useDiagramDeleteImpact(
    target?.kind === 'diagram' ? target.id : '',
    target?.kind === 'diagram',
  );
  const deleteRoadmap = useDeleteRoadmap();
  const deleteDiagram = useDeleteDiagram();
  const impact = target?.kind === 'diagram' ? diagramImpact : roadmapImpact;

  const confirm = () => {
    if (target === null) return;
    const mutation = target.kind === 'roadmap' ? deleteRoadmap : deleteDiagram;
    // The list hooks remove the row optimistically and report a failure themselves.
    mutation.mutate(target.id, {
      onSuccess: () => {
        snackbar.notify(`Deleted ${target.name}`);
      },
    });
  };

  return {
    message: impact.data?.message ?? null,
    loading: impact.isPending,
    error: impact.isError,
    retry: () => void impact.refetch(),
    confirm,
  };
}
