import { useRoadmapEditor } from './state';

/**
 * RM-8: select an epic from its bar or label and make sure the detail panel shows it.
 * A module-level function, so rows can take it as a stable `onSelect` and stay memoised.
 */
export function selectItem(itemId: string): void {
  const editor = useRoadmapEditor.getState();
  editor.select(itemId);
  if (!editor.panelOpen) editor.togglePanel();
}
