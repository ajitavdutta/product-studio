import type {
  ImportColumn,
  ImportMapping,
  ImportSessionRead,
  RoadmapField,
} from '../../api/useImports';

/** Column id → roadmap field. A column with no entry is unmapped ("Choose a field…"). */
export type ColumnFields = ImportMapping['columns'];
export type RollupRules = NonNullable<ImportMapping['rollup']>;
export type CustomStatus = NonNullable<ImportMapping['customStatuses']>[number];
export type TeamColor = CustomStatus['color'];

/** Parent and Epic Link both feed Epic, and any number of columns can be left out. */
const FIELDS_ALLOWED_TWICE: ReadonlySet<RoadmapField> = new Set(['epic', 'ignore']);

export const REQUIRED_FIELDS = ['key', 'title'] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

/** The statuses every roadmap has (`DEFAULT_STATUSES` on the backend). */
export const DEFAULT_STATUS_IDS = ['not-started', 'in-progress', 'at-risk', 'done'] as const;
export type DefaultStatusId = (typeof DEFAULT_STATUS_IDS)[number];

/** IMP-8 defaults: on, on, on, off. */
export const DEFAULT_ROLLUP: RollupRules = {
  rollUpStories: true,
  useSprintDates: true,
  unscheduledTray: true,
  fixVersionsAsMilestones: false,
};

const CUSTOM_STATUS_ID_PREFIX = 'custom-';
const CUSTOM_STATUS_ID_MAX_LENGTH = 40;

/**
 * IMP-5: map `columnId` to `field`. A field may sit on one column only (except Epic and
 * Don't import), so a column already holding it becomes unmapped.
 */
export function assignField(
  columns: ColumnFields,
  columnId: string,
  field: RoadmapField,
): ColumnFields {
  const next: ColumnFields = {};
  for (const [id, current] of Object.entries(columns)) {
    const takenElsewhere = id !== columnId && current === field && !FIELDS_ALLOWED_TWICE.has(field);
    if (!takenElsewhere) next[id] = current;
  }
  next[columnId] = field;
  return next;
}

/**
 * "Auto-mapped N of M": a listed column counts as mapped when it has any field,
 * Don't import included, as in the prototype.
 */
export function mappingStats(
  listed: readonly ImportColumn[],
  columns: ColumnFields,
): { mapped: number; total: number } {
  const mapped = listed.filter((column) => columns[column.id] !== undefined).length;
  return { mapped, total: listed.length };
}

/** IMP-10: the required fields no column is mapped to yet, in display order. */
export function missingRequired(columns: ColumnFields): RequiredField[] {
  const used = new Set(Object.values(columns));
  return REQUIRED_FIELDS.filter((field) => !used.has(field));
}

/** The draft mapping a session starts from: the server's suggestions and defaults. */
export function initialMapping(session: ImportSessionRead): ImportMapping {
  const columns: ColumnFields = {};
  for (const column of session.columns) {
    if (column.suggestedField) columns[column.id] = column.suggestedField;
  }
  const statusMap: Record<string, string> = {};
  for (const status of session.statuses) statusMap[status.jiraStatus] = status.statusId;
  return {
    columns,
    statusMap,
    customStatuses: [],
    rollup: DEFAULT_ROLLUP,
    name: session.suggestedName,
  };
}

/** A lower-case slug of `name`, made unique against `takenIds`. */
export function customStatusId(name: string, takenIds: readonly string[]): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = `${CUSTOM_STATUS_ID_PREFIX}${slug || 'status'}`.slice(
    0,
    CUSTOM_STATUS_ID_MAX_LENGTH,
  );
  const taken = new Set(takenIds);
  let candidate = base;
  for (let suffix = 2; taken.has(candidate); suffix += 1) {
    const tail = `-${String(suffix)}`;
    candidate = `${base.slice(0, CUSTOM_STATUS_ID_MAX_LENGTH - tail.length)}${tail}`;
  }
  return candidate;
}

/** IMP-7: add a custom status named `name` and map `jiraStatus` to it. */
export function addCustomStatus(
  mapping: ImportMapping,
  jiraStatus: string,
  name: string,
  color: TeamColor,
): ImportMapping {
  const existing = mapping.customStatuses ?? [];
  const id = customStatusId(name, [...DEFAULT_STATUS_IDS, ...existing.map((status) => status.id)]);
  return {
    ...mapping,
    customStatuses: [...existing, { id, name: name.trim(), color }],
    statusMap: { ...mapping.statusMap, [jiraStatus]: id },
  };
}
