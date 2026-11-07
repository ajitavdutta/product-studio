import { hashKey, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSaveStateStore } from '../app/saveState';
import { useSnackbar } from '../app/SnackbarProvider';
import { applyOps, type DocumentOp } from '../lib/documentOps/applyOps';
import { ApiError, apiRequest } from './client';
import type { components } from './types';
import { diagramQueryOptions, type DiagramRead } from './useDiagram';
import { roadmapQueryOptions, type RoadmapRead } from './useRoadmap';

/** G-2: text edits are sent after this much quiet; everything else is sent at once. */
export const TEXT_DEBOUNCE_MS = 500;

export type DocumentKind = 'roadmap' | 'diagram';
export type SaveMode = 'text' | 'immediate';
type DocumentRead = RoadmapRead | DiagramRead;
type PatchResult = components['schemas']['PatchResult'];
type DocumentPatch = components['schemas']['DocumentPatch'];

const CONFLICT_STATUS = 409;
const SAVE_FAILED_MESSAGE = "Couldn't save that change";
const RELOADED_MESSAGE = "Couldn't save — reloaded the latest version";

export interface AutosaveSnapshot {
  state: 'saved' | 'unsaved';
  /**
   * Goes up whenever the cached document is replaced from the server or rolled back,
   * rather than changed by the user's own edits. Key uncontrolled fields on it.
   */
  reloads: number;
}

interface Confirmed {
  document: DocumentRead['document'];
  revision: number;
}

interface EngineDeps {
  queryClient: QueryClient;
  kind: DocumentKind;
  id: string;
  notifyError: (message: string) => void;
}

function queryKeyFor(kind: DocumentKind, id: string) {
  return kind === 'roadmap' ? roadmapQueryOptions(id).queryKey : diagramQueryOptions(id).queryKey;
}

/** Fetch the server's copy now, ignoring the cache's `staleTime: Infinity`, and cache it. */
function fetchFresh(
  queryClient: QueryClient,
  kind: DocumentKind,
  id: string,
): Promise<DocumentRead> {
  return kind === 'roadmap'
    ? queryClient.query({ ...roadmapQueryOptions(id), staleTime: 0 })
    : queryClient.query({ ...diagramQueryOptions(id), staleTime: 0 });
}

/**
 * The save queue for one open document. Edits apply to the cached document at once;
 * text ops are coalesced by path and sent after `TEXT_DEBOUNCE_MS`; at most one PATCH
 * is in flight. `confirmed` is the last state the server accepted, for rollback.
 */
function createAutosaveEngine({ queryClient, kind, id, notifyError }: EngineDeps) {
  const queryKey = queryKeyFor(kind, id);
  const patchPath = `/${kind}s/${encodeURIComponent(id)}`;

  const pendingText = new Map<string, DocumentOp>();
  let queued: DocumentOp[] = [];
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let confirmed: Confirmed | undefined;
  let active = false;
  let snapshot: AutosaveSnapshot = { state: 'saved', reloads: 0 };
  const listeners = new Set<() => void>();

  const readCache = () => queryClient.getQueryData<DocumentRead>(queryKey);
  const writeCache = (next: DocumentRead) => {
    queryClient.setQueryData<DocumentRead>(queryKey, next);
  };

  function isBusy(): boolean {
    return pendingText.size > 0 || queued.length > 0 || inFlight;
  }

  function publish(reloaded = false): void {
    const state = isBusy() ? 'unsaved' : 'saved';
    if (state !== snapshot.state || reloaded) {
      snapshot = { state, reloads: snapshot.reloads + (reloaded ? 1 : 0) };
      listeners.forEach((listener) => {
        listener();
      });
    }
    // After unmount a fire-and-forget flush may still finish; it must not claim the
    // indicator for whatever page is open now.
    if (!active) return;
    const cached = readCache();
    if (cached) useSaveStateStore.getState().set(state, cached.fileName);
  }

  function dropPending(): void {
    clearTimeout(timer);
    timer = undefined;
    pendingText.clear();
    queued = [];
    confirmed = undefined;
  }

  function moveTextToQueue(): void {
    clearTimeout(timer);
    timer = undefined;
    queued.push(...pendingText.values());
    pendingText.clear();
  }

  function save(ops: readonly DocumentOp[], mode: SaveMode): void {
    const cached = readCache();
    if (!cached || ops.length === 0) return;
    let document: DocumentRead['document'];
    try {
      document = applyOps(cached.document, ops);
    } catch {
      notifyError(SAVE_FAILED_MESSAGE);
      return;
    }
    if (!isBusy()) confirmed = { document: cached.document, revision: cached.revision };
    writeCache({ ...cached, document } as DocumentRead);

    if (mode === 'text') {
      for (const op of ops) {
        // Delete first so the map keeps the order of each path's latest edit.
        pendingText.delete(op.path);
        pendingText.set(op.path, op);
      }
      clearTimeout(timer);
      timer = setTimeout(flush, TEXT_DEBOUNCE_MS);
      publish();
      return;
    }
    moveTextToQueue();
    queued.push(...ops);
    pump();
  }

  function flush(): void {
    moveTextToQueue();
    pump();
  }

  function pump(): void {
    if (inFlight || queued.length === 0 || !confirmed) {
      publish();
      return;
    }
    const batch = queued;
    queued = [];
    inFlight = true;
    publish();
    void send(batch, confirmed.revision, false);
  }

  async function send(batch: DocumentOp[], baseVersion: number, isRetry: boolean): Promise<void> {
    try {
      const body: DocumentPatch = { baseVersion, ops: batch };
      const result = await apiRequest<PatchResult>('PATCH', patchPath, body);
      onSaved(batch, result);
    } catch (error) {
      if (error instanceof ApiError && error.status === CONFLICT_STATUS) {
        await (isRetry ? giveUpAndReload() : retryOnFresh(batch));
        return;
      }
      rollBack();
    }
  }

  function onSaved(batch: DocumentOp[], result: PatchResult): void {
    const cached = readCache();
    if (confirmed) {
      confirmed = { document: applyOps(confirmed.document, batch), revision: result.revision };
    }
    if (cached) {
      writeCache({
        ...cached,
        name: cached.document.name,
        revision: result.revision,
        fileName: result.fileName,
      });
    }
    inFlight = false;
    if (!isBusy()) confirmed = undefined;
    pump();
  }

  /** 409: someone else saved. Re-apply our edits to their version and try once more. */
  async function retryOnFresh(batch: DocumentOp[]): Promise<void> {
    let fresh: DocumentRead;
    let rebuilt: DocumentRead['document'];
    try {
      fresh = await fetchFresh(queryClient, kind, id);
      rebuilt = applyOps(fresh.document, [...batch, ...queued, ...pendingText.values()]);
    } catch {
      rollBack();
      return;
    }
    confirmed = { document: fresh.document, revision: fresh.revision };
    writeCache({ ...fresh, document: rebuilt } as DocumentRead);
    await send(batch, fresh.revision, true);
  }

  async function giveUpAndReload(): Promise<void> {
    const lastFresh = confirmed;
    dropPending();
    try {
      await fetchFresh(queryClient, kind, id);
    } catch {
      // Fall back to the copy fetched for the retry, without our edits.
      const cached = readCache();
      if (cached && lastFresh) {
        writeCache({
          ...cached,
          document: lastFresh.document,
          revision: lastFresh.revision,
        } as DocumentRead);
      }
    }
    // Edits made during the fetch were queued with no `confirmed` base, and the reload
    // has replaced the document they applied to. Drop them, or `pump()` waits forever.
    dropPending();
    inFlight = false;
    notifyError(RELOADED_MESSAGE);
    publish(true);
  }

  function rollBack(): void {
    const cached = readCache();
    if (cached && confirmed) {
      writeCache({
        ...cached,
        document: confirmed.document,
        revision: confirmed.revision,
      } as DocumentRead);
    }
    dropPending();
    inFlight = false;
    notifyError(SAVE_FAILED_MESSAGE);
    publish(true);
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flush();
  }

  return {
    save,
    flush,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    /** Start driving the top bar's indicator; returns the cleanup for unmount. */
    activate: (): (() => void) => {
      active = true;
      document.addEventListener('visibilitychange', onVisibilityChange);
      publish();
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        flush();
        active = false;
        useSaveStateStore.getState().set(null);
      };
    },
    /** Called when the cached document first arrives or its file name changes. */
    refreshIndicator: () => {
      publish();
    },
  };
}

/**
 * G-2 autosave for the open document, and G-1's indicator. `save` applies ops to the
 * cached document at once and sends them as `PATCH /api/{kind}s/{id}`.
 */
export function useAutosave(kind: DocumentKind, id: string) {
  const queryClient = useQueryClient();
  const { error: notifyError } = useSnackbar();
  const engine = useMemo(
    () => createAutosaveEngine({ queryClient, kind, id, notifyError }),
    [queryClient, kind, id, notifyError],
  );
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);

  useEffect(() => engine.activate(), [engine]);

  // Show "Saved to <file>" as soon as the document is in the cache.
  useEffect(() => {
    const queryHash = hashKey(queryKeyFor(kind, id));
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.queryHash === queryHash) {
        engine.refreshIndicator();
      }
    });
  }, [queryClient, engine, kind, id]);

  return {
    save: engine.save,
    flush: engine.flush,
    state: snapshot.state,
    reloads: snapshot.reloads,
  };
}
