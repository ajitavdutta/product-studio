import { useMemo } from 'react';
import { create } from 'zustand';
import type { ImportMapping, ImportSessionRead, RoadmapField } from '../../api/useImports';
import {
  addCustomStatus,
  assignField,
  DEFAULT_ROLLUP,
  initialMapping,
  type RollupRules,
  type TeamColor,
} from '../../lib/importMapping/mapping';

/**
 * The user's edits on the Map page. The session itself stays in the query cache; a
 * draft exists only once the user changes something, and until then it is derived
 * from the session's suggestions.
 */
export interface ImportDraft {
  mapping: ImportMapping;
  /** "Update mapping template" / "Save as mapping template" (IMP-9). */
  updateTemplate: boolean;
  /** The Create roadmap confirmation is open (step 3 of the stepper). */
  createOpen: boolean;
}

interface ImportDraftStore {
  drafts: Record<string, ImportDraft>;
  update: (
    sessionId: string,
    base: ImportDraft,
    change: (draft: ImportDraft) => ImportDraft,
  ) => void;
  discard: (sessionId: string) => void;
}

export const useImportDraftStore = create<ImportDraftStore>()((setStore) => ({
  drafts: {},
  update: (sessionId, base, change) => {
    setStore((store) => ({
      drafts: { ...store.drafts, [sessionId]: change(store.drafts[sessionId] ?? base) },
    }));
  },
  discard: (sessionId) => {
    setStore((store) => {
      const drafts = Object.fromEntries(
        Object.entries(store.drafts).filter(([id]) => id !== sessionId),
      );
      return { drafts };
    });
  },
}));

export function initialDraft(session: ImportSessionRead): ImportDraft {
  return { mapping: initialMapping(session), updateTemplate: true, createOpen: false };
}

export interface ImportDraftActions {
  setColumnField: (columnId: string, field: RoadmapField) => void;
  setStatus: (jiraStatus: string, statusId: string) => void;
  addCustomStatus: (jiraStatus: string, name: string, color: TeamColor) => void;
  setRollup: (rule: keyof RollupRules, value: boolean) => void;
  setName: (name: string) => void;
  setUpdateTemplate: (value: boolean) => void;
  setCreateOpen: (open: boolean) => void;
  /** Forget the draft, after a commit. */
  discard: () => void;
}

/** The Map page's draft for `session`, and the actions that edit it. */
export function useImportDraft(session: ImportSessionRead): {
  draft: ImportDraft;
  actions: ImportDraftActions;
} {
  const stored = useImportDraftStore((store) => store.drafts[session.id]);
  const update = useImportDraftStore((store) => store.update);
  const discard = useImportDraftStore((store) => store.discard);
  const base = useMemo(() => initialDraft(session), [session]);

  const actions = useMemo<ImportDraftActions>(() => {
    const change = (edit: (draft: ImportDraft) => ImportDraft) => {
      update(session.id, base, edit);
    };
    const changeMapping = (edit: (mapping: ImportMapping) => ImportMapping) => {
      change((draft) => ({ ...draft, mapping: edit(draft.mapping) }));
    };
    return {
      setColumnField: (columnId, field) => {
        changeMapping((mapping) => ({
          ...mapping,
          columns: assignField(mapping.columns, columnId, field),
        }));
      },
      setStatus: (jiraStatus, statusId) => {
        changeMapping((mapping) => ({
          ...mapping,
          statusMap: { ...mapping.statusMap, [jiraStatus]: statusId },
        }));
      },
      addCustomStatus: (jiraStatus, name, color) => {
        changeMapping((mapping) => addCustomStatus(mapping, jiraStatus, name, color));
      },
      setRollup: (rule, value) => {
        changeMapping((mapping) => ({
          ...mapping,
          rollup: { ...DEFAULT_ROLLUP, ...mapping.rollup, [rule]: value },
        }));
      },
      setName: (name) => {
        changeMapping((mapping) => ({ ...mapping, name }));
      },
      setUpdateTemplate: (value) => {
        change((draft) => ({ ...draft, updateTemplate: value }));
      },
      setCreateOpen: (open) => {
        change((draft) => ({ ...draft, createOpen: open }));
      },
      discard: () => {
        discard(session.id);
      },
    };
  }, [session.id, base, update, discard]);

  return { draft: stored ?? base, actions };
}
