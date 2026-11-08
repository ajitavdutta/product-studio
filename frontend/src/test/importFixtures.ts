import type { ImportPreview } from '../api/useImports';

/** A preview shaped like the payments sample's, for the import UI tests. */
export const PREVIEW: ImportPreview = {
  epics: 12,
  issues: 55,
  teams: 4,
  milestones: 3,
  warnings: ['9 issues have no dates → Unscheduled', '"Components" isn\'t mapped yet'],
  firstEpics: [
    {
      key: 'PAY-142',
      title: 'Saved cards & one-click checkout',
      start: '2026-11-16',
      end: '2027-01-29',
    },
    { key: 'PAY-155', title: 'UPI AutoPay mandates', start: '2026-12-01', end: '2027-03-12' },
    { key: 'PAY-161', title: 'Checkout A/B framework', start: '2027-02-01', end: '2027-03-05' },
    { key: 'RSK-031', title: 'Real-time fraud scoring v2', start: '2026-11-09', end: '2027-02-19' },
    { key: 'RSK-036', title: '3DS2 frictionless flow', start: null, end: null },
  ],
  moreEpics: 7,
  unmappedColumns: ['Components'],
  missingRequired: [],
  fileName: 'payments-export.json',
  sizeEstimateBytes: 24_300,
  document: {
    schemaVersion: 1,
    kind: 'roadmap',
    id: '6a0c1f1e-1d2b-4c3a-9e8f-7a6b5c4d3e2f',
    name: 'Payments export',
    source: { type: 'jira-csv', file: 'payments-export.csv', importedAt: '2026-11-06T11:40:00Z' },
    timeline: {
      start: '2026-11-02',
      sprintLengthDays: 14,
      pis: [
        { id: 'pi-1', name: 'PI 1', start: '2026-11-02', sprints: 6, ipSprint: true },
        { id: 'pi-2', name: 'PI 2', start: '2027-01-25', sprints: 6, ipSprint: true },
        { id: 'pi-3', name: 'PI 3', start: '2027-04-19', sprints: 6, ipSprint: true },
      ],
    },
    lanes: [
      { id: 'checkout', name: 'Checkout', color: 'blue', position: 1000 },
      { id: 'risk', name: 'Risk & Fraud', color: 'deepOrange', position: 2000 },
      { id: 'platform', name: 'Platform', color: 'blueGrey', position: 3000 },
      { id: 'merchant', name: 'Merchant Experience', color: 'purple', position: 4000 },
    ],
    statuses: [],
    items: Array.from({ length: 12 }, (_unused, index) => ({
      id: `item-${String(index)}`,
      key: `PAY-${String(100 + index)}`,
      title: `Epic ${String(index)}`,
      type: 'Epic',
      laneId: 'checkout',
      statusId: 'not-started',
      progress: 0,
      position: (index + 1) * 1000,
      issues: { total: 1, done: 0, inProgress: 0 },
    })),
    milestones: [],
    linkedDiagrams: [],
  },
};
