import type { RoadmapField } from '../../api/useImports';

/** IMP-4: the roadmap fields in the order the Map table's select lists them. */
export const ROADMAP_FIELDS: readonly RoadmapField[] = [
  'key',
  'title',
  'type',
  'epic',
  'team',
  'status',
  'sprint',
  'release',
  'points',
  'start',
  'end',
  'tags',
  'ignore',
];

/** IMP-4: the label each roadmap field shows in the Map table (prototype `FIELDS`). */
export const ROADMAP_FIELD_LABELS: Readonly<Record<RoadmapField, string>> = {
  key: 'Key',
  title: 'Title',
  type: 'Type',
  epic: 'Epic',
  team: 'Swimlane / Team',
  status: 'Status',
  sprint: 'Sprint',
  release: 'Release',
  points: 'Points',
  start: 'Start',
  end: 'End',
  tags: 'Tags',
  ignore: "Don't import",
};
