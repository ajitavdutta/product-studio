/** Toolbar source chip and "imported/synced at" stamps (RM-1, RM-13). Pure. */
import type { RoadmapDocument } from '../../api/useRoadmap';
import { formatDayMonth, formatDayMonthYear } from '../timeline';

type RoadmapSource = RoadmapDocument['source'];

const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

/**
 * Date and time as written in the stamp: `2026-11-06T17:10:00+05:30` → `6 Nov 2026, 17:10`.
 * ASSUMPTION: the wall-clock time where the import ran, not converted to the viewer's zone,
 * so the label matches the file and is the same on every machine.
 */
export function formatStamp(iso: string, withYear = true): string {
  const match = ISO_DATE_TIME.exec(iso);
  if (!match) return iso;
  const [, date = '', hours = '', minutes = ''] = match;
  const day = withYear ? formatDayMonthYear(date) : formatDayMonth(date);
  return `${day}, ${hours}:${minutes}`;
}

/** `From Jira · imported 6 Nov 2026, 17:10`, or `opened from <file>` for a JSON source. */
export function sourceChipLabel(source: RoadmapSource): string {
  if (source.type === 'json') return `opened from ${source.file}`;
  return `From Jira · imported ${formatStamp(source.importedAt)}`;
}
