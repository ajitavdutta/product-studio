import type { components } from '../../api/types';

type RoadmapDocument = components['schemas']['RoadmapDocument'];

// Stand-ins swapped for the summaries after stringifying, so the rest of the document keeps
// JSON.stringify's own indentation and escaping. The NUL character can't come from a JSON
// string value unescaped, so a roadmap name can never collide with them.
const ITEMS_PLACEHOLDER = '\u0000items\u0000';
const PIS_PLACEHOLDER = '\u0000pis\u0000';
const JSON_INDENT = 2;

function count(amount: number, singular: string, plural: string): string {
  return `${String(amount)} ${amount === 1 ? singular : plural}`;
}

/**
 * IMP-11 "What gets saved": `document` pretty-printed, with the long arrays summarised as
 * in the prototype (`"items": [ … 15 epics ]`, `"pis": [ … 3 PIs ]`).
 */
export function abbreviateDocument(document: RoadmapDocument): string {
  const shortened = {
    ...document,
    timeline: { ...document.timeline, pis: PIS_PLACEHOLDER },
    items: ITEMS_PLACEHOLDER,
  };
  return JSON.stringify(shortened, null, JSON_INDENT)
    .replace(
      JSON.stringify(ITEMS_PLACEHOLDER),
      `[ … ${count(document.items.length, 'epic', 'epics')} ]`,
    )
    .replace(
      JSON.stringify(PIS_PLACEHOLDER),
      `[ … ${count(document.timeline.pis.length, 'PI', 'PIs')} ]`,
    );
}
