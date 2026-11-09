/**
 * The bar colour for a roadmap status (RM-8). Pure.
 * The four default statuses use their own `status.*` tokens. A custom status (IMP-7) stores a
 * `team.*` token key in `color`. Anything else falls back to the Not started grey.
 */
import type { RoadmapDocument } from '../../api/useRoadmap';

type RoadmapStatus = RoadmapDocument['statuses'][number];

/** The slice of the MUI palette this needs, so the function stays free of React and MUI. */
export interface StatusColorPalette {
  status: Record<'notStarted' | 'inProgress' | 'atRisk' | 'done', { color: string }>;
  team: Record<string, string>;
}

const DEFAULT_STATUS_TOKENS: Readonly<Record<string, keyof StatusColorPalette['status']>> = {
  'not-started': 'notStarted',
  'in-progress': 'inProgress',
  'at-risk': 'atRisk',
  done: 'done',
};

export function statusColor(
  status: Pick<RoadmapStatus, 'id' | 'color'> | undefined,
  palette: StatusColorPalette,
): string {
  const fallback = palette.status.notStarted.color;
  if (!status) return fallback;
  const tokenKey = DEFAULT_STATUS_TOKENS[status.id];
  if (tokenKey) return palette.status[tokenKey].color;
  return palette.team[status.color] ?? fallback;
}
