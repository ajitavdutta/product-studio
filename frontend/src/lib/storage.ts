/**
 * Per-browser preferences in localStorage (collapsed panels, view, zoom).
 * Storage can be missing, full or blocked (private windows, previews), so every
 * access is guarded and a failure falls back to the default rather than breaking the page.
 */

/** The stored JSON value for `key` if it passes `isValid`, else `fallback`. */
export function readStored<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Store `value` as JSON under `key`; a blocked or full storage is ignored. */
export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are a convenience: losing one must not interrupt editing.
  }
}
