import { useEffect, useRef } from 'react';
import type { useAutosave } from '../../api/useAutosave';
import type { RoadmapDocument } from '../../api/useRoadmap';
import { useSettings } from '../../api/useSettings';
import { useSnackbar } from '../../app/SnackbarProvider';
import type { DocumentOp } from '../../lib/documentOps/applyOps';
import { editOps, unscheduleOps } from '../../lib/roadmap/schedule';
import { formatStamp } from '../../lib/roadmap/sourceLabel';
import { type Pi, spanText } from '../../lib/timeline';
import { DetailPanel, type PanelField } from './components/DetailPanel';
import { PanelRail } from './components/PanelRail';
import { useRoadmapEditor } from './state';

type RoadmapItem = RoadmapDocument['items'][number];

interface RoadmapDetailProps {
  document: RoadmapDocument;
  pis: readonly Pi[];
  /** The page's autosave: one engine per document, so it is passed down, never re-created. */
  autosave: ReturnType<typeof useAutosave>;
}

const JIRA_BROWSE_PATH = 'browse/';

function itemPath(item: RoadmapItem, field: string): string {
  return `/items/${item.id.replaceAll('~', '~0').replaceAll('/', '~1')}/${field}`;
}

/** NF-4: a plain link to the issue; hidden when there is nowhere to send it (ASSUMPTION 13). */
function jiraLink(item: RoadmapItem, jiraBaseUrl: string | null | undefined): string | null {
  if (item.jiraUrl) return item.jiraUrl;
  if (!jiraBaseUrl) return null;
  const base = jiraBaseUrl.endsWith('/') ? jiraBaseUrl : `${jiraBaseUrl}/`;
  return `${base}${JIRA_BROWSE_PATH}${encodeURIComponent(item.key)}`;
}

function syncedLabel(source: RoadmapDocument['source']): string {
  if (source.type === 'json') return `Opened ${formatStamp(source.importedAt, false)}`;
  return `Synced from Jira ${formatStamp(source.syncedAt ?? source.importedAt, false)}`;
}

/** The detail panel or its rail, wired to autosave (RM-11 Unschedule, RM-13, RM-14). */
export function RoadmapDetail({ document, pis, autosave }: RoadmapDetailProps) {
  const snackbar = useSnackbar();
  const settings = useSettings();
  const panelOpen = useRoadmapEditor((state) => state.panelOpen);
  const togglePanel = useRoadmapEditor((state) => state.togglePanel);
  const selectedItemId = useRoadmapEditor((state) => state.selectedItemId);
  const select = useRoadmapEditor((state) => state.select);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const toggledByUser = useRef(false);

  // Focus follows the toggle into the panel or rail it switched to.
  useEffect(() => {
    if (!toggledByUser.current) return;
    toggledByUser.current = false;
    toggleRef.current?.focus();
  }, [panelOpen]);

  const toggle = () => {
    toggledByUser.current = true;
    togglePanel();
  };

  const item = document.items.find((candidate) => candidate.id === selectedItemId) ?? null;

  if (!panelOpen) {
    return (
      <PanelRail
        label={item ? `${item.key} · ${item.title}` : 'Epic details'}
        onExpand={toggle}
        toggleRef={toggleRef}
      />
    );
  }

  const save = (ops: DocumentOp[], mode: 'text' | 'immediate') => {
    if (ops.length > 0) autosave.save(ops, mode);
  };

  const unschedule = () => {
    if (!item?.start || !item.end) return;
    const { start, end } = item;
    save(unscheduleOps(item), 'immediate');
    select(null);
    snackbar.undoable(`${item.key} moved to Unscheduled`, () => {
      autosave.save(
        [
          { op: 'set', path: itemPath(item, 'start'), value: start },
          { op: 'set', path: itemPath(item, 'end'), value: end },
        ],
        'immediate',
      );
    });
  };

  return (
    <DetailPanel
      item={item}
      statuses={document.statuses}
      lanes={document.lanes}
      spanLabel={item ? spanText(item, pis, document.milestones) : ''}
      jiraUrl={item ? jiraLink(item, settings.data?.jiraBaseUrl) : null}
      syncedLabel={syncedLabel(document.source)}
      reloads={autosave.reloads}
      onTitleChange={(title) => {
        if (item) save(editOps(item, 'title', title), 'text');
      }}
      onFieldChange={(field: PanelField, value) => {
        if (item) save(editOps(item, field, value), 'immediate');
      }}
      onNotesChange={(notes) => {
        if (item) save([{ op: 'set', path: itemPath(item, 'notes'), value: notes }], 'text');
      }}
      onUnschedule={unschedule}
      onCollapse={toggle}
      toggleRef={toggleRef}
    />
  );
}
