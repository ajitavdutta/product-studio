/** RM-15 re-sync review: which changes are offered, pre-checked or only shown. Pure. */
import type { components } from '../../api/types';

type ResyncChange = components['schemas']['ResyncChange'];

export interface ResyncGroups {
  /** Offered and pre-checked. */
  updates: ResyncChange[];
  /** Hand edits Jira disagrees with: offered, unchecked, with the reason. */
  conflicts: ResyncChange[];
  /** The roadmap already has the incoming value: shown without a checkbox. */
  alreadyApplied: ResyncChange[];
}

export function groupChanges(changes: readonly ResyncChange[]): ResyncGroups {
  return {
    updates: changes.filter((change) => !change.conflict && !change.alreadyApplied),
    conflicts: changes.filter((change) => change.conflict && !change.alreadyApplied),
    alreadyApplied: changes.filter((change) => change.alreadyApplied),
  };
}

/** The ids checked when the review opens: every change that is neither a conflict nor applied. */
export function initialSelection(changes: readonly ResyncChange[]): Set<string> {
  return new Set(groupChanges(changes).updates.map((change) => change.id));
}

const KIND_LABEL: Readonly<Record<ResyncChange['kind'], string>> = {
  new: 'new in Jira',
  removed: 'removed from Jira',
  dates: 'dates',
  status: 'status',
  progress: 'progress',
  stories: 'stories',
};

export interface ChangeText {
  /** e.g. "status" or "new in Jira". */
  label: string;
  /** The server's display strings, as sent; `null` when the kind has none. */
  before: string | null;
  after: string | null;
}

/** What one row says after the item key. New and removed items show their title. */
export function changeText(change: ResyncChange): ChangeText {
  const label = KIND_LABEL[change.kind];
  if (change.kind === 'new' || change.kind === 'removed') {
    return { label, before: null, after: change.itemTitle };
  }
  return { label, before: change.before ?? null, after: change.after ?? null };
}

/** "Apply 1 change" / "Apply 3 changes". */
export function applyLabel(count: number): string {
  return `Apply ${String(count)} ${count === 1 ? 'change' : 'changes'}`;
}

/** The template select's value for Automatic: no template, columns matched by name. */
export const AUTOMATIC_MAPPING = '';

/**
 * The multipart fields beside `file` on `POST /roadmaps/{id}/resync`: `{templateId}`,
 * `{mapping: 'auto'}` or `{}`, never both keys (the server rejects that).
 */
export type ResyncMappingFields = Readonly<Record<string, string>>;

/**
 * What the template select means to the server.
 * - A loaded template: `templateId`.
 * - Automatic, or an id that isn't among the loaded templates (the select shows Automatic
 *   for a deleted template): `mapping=auto`.
 * - Templates not loaded yet (`null`): nothing, so the server uses the roadmap's own template,
 *   which is what the select will default to.
 */
export function resyncMappingFields(
  selected: string,
  loadedTemplateIds: readonly string[] | null,
): ResyncMappingFields {
  if (loadedTemplateIds === null) return {};
  if (selected !== AUTOMATIC_MAPPING && loadedTemplateIds.includes(selected)) {
    return { templateId: selected };
  }
  return { mapping: 'auto' };
}
