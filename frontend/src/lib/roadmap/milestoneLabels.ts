/**
 * Room for each milestone label in the milestones row (RM-9). Pure, in px along the date track
 * (0 = the track's left edge), so the export renderer can apply the same rule.
 *
 * Rule:
 * - Every label grows away from its diamond: rightwards, except the last one, which grows
 *   leftwards so it never runs off the timeline.
 * - A label may use the space up to the nearest obstacle on its side: a freeze chip, another
 *   milestone's diamond, the Today label, or the track edge, minus `padding`.
 * - When a rightward label and a leftward label face each other with nothing in between, the
 *   space is split at the midpoint between their diamonds.
 * - An obstacle that covers the diamond itself leaves no room.
 * - Room under `minWidth` becomes 0 (the label is hidden; its name stays in the tooltip).
 * The caller cuts each label to its room with an ellipsis.
 */

export interface Interval {
  start: number;
  end: number;
}

export interface MilestoneMark {
  id: string;
  /** Diamond centre. */
  x: number;
  /** `start`: the label sits right of the diamond; `end`: left of it. */
  anchor: 'start' | 'end';
}

export interface MilestoneLabelGeometry {
  trackWidth: number;
  /** From the diamond centre to the near edge of its label. */
  labelOffset: number;
  /** Half the width a diamond blocks for other labels. */
  diamondHalfWidth: number;
  /** Space kept between a label and whatever stops it. */
  padding: number;
  minWidth: number;
}

function rightLimit(
  mark: MilestoneMark,
  marks: readonly MilestoneMark[],
  obstacles: readonly Interval[],
  geometry: MilestoneLabelGeometry,
): number {
  let limit = geometry.trackWidth;
  for (const obstacle of obstacles) {
    if (obstacle.end <= mark.x) continue;
    limit = Math.min(limit, Math.max(obstacle.start, mark.x));
  }
  for (const other of marks) {
    if (other.id === mark.id || other.x <= mark.x) continue;
    const stop =
      other.anchor === 'end' ? (mark.x + other.x) / 2 : other.x - geometry.diamondHalfWidth;
    limit = Math.min(limit, stop);
  }
  return limit;
}

function leftLimit(
  mark: MilestoneMark,
  marks: readonly MilestoneMark[],
  obstacles: readonly Interval[],
  geometry: MilestoneLabelGeometry,
): number {
  let limit = 0;
  for (const obstacle of obstacles) {
    if (obstacle.start >= mark.x) continue;
    limit = Math.max(limit, Math.min(obstacle.end, mark.x));
  }
  for (const other of marks) {
    if (other.id === mark.id || other.x >= mark.x) continue;
    const stop =
      other.anchor === 'start' ? (mark.x + other.x) / 2 : other.x + geometry.diamondHalfWidth;
    limit = Math.max(limit, stop);
  }
  return limit;
}

/** The largest width (px) each milestone's label may take, keyed by mark id. */
export function milestoneLabelWidths(
  marks: readonly MilestoneMark[],
  obstacles: readonly Interval[],
  geometry: MilestoneLabelGeometry,
): Map<string, number> {
  const widths = new Map<string, number>();
  for (const mark of marks) {
    const room =
      mark.anchor === 'start'
        ? rightLimit(mark, marks, obstacles, geometry) -
          geometry.padding -
          (mark.x + geometry.labelOffset)
        : mark.x -
          geometry.labelOffset -
          geometry.padding -
          leftLimit(mark, marks, obstacles, geometry);
    widths.set(mark.id, room < geometry.minWidth ? 0 : Math.floor(room));
  }
  return widths;
}
