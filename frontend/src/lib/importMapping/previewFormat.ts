// Dates in the preview are calendar dates (`2026-11-16`); formatting them in UTC keeps
// the viewer's time zone from shifting them by a day.
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const BYTES_PER_KB = 1024;
const KB_PER_MB = 1024;

/** `2026-11-16` → `16 Nov`. */
function shortDate(isoDate: string): string {
  return SHORT_DATE.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * IMP-11: an epic's range as `16 Nov → 29 Jan`. An open end shows `…`; an epic with no
 * dates at all is `Unscheduled`.
 */
export function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return 'Unscheduled';
  return `${start ? shortDate(start) : '…'} → ${end ? shortDate(end) : '…'}`;
}

/** IMP-1: an uploaded file's size as "2.1 MB", "48 KB" or "512 B". */
export function formatFileSize(bytes: number): string {
  if (bytes >= BYTES_PER_KB * KB_PER_MB)
    return `${(bytes / (BYTES_PER_KB * KB_PER_MB)).toFixed(1)} MB`;
  if (bytes >= BYTES_PER_KB) return `${String(Math.round(bytes / BYTES_PER_KB))} KB`;
  return `${String(bytes)} B`;
}

/** IMP-12: the confirmation's `about 24 KB`, never less than 1 KB. */
export function formatSizeEstimate(bytes: number): string {
  const kilobytes = Math.max(1, Math.round(bytes / BYTES_PER_KB));
  if (kilobytes < KB_PER_MB) return `about ${String(kilobytes)} KB`;
  return `about ${(kilobytes / KB_PER_MB).toFixed(1)} MB`;
}
