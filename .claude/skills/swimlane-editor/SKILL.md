---
name: swimlane-editor
description: Geometry, routing and interaction rules for the draw.io-style swimlane editor — lane sizing, shapes, anchors, orthogonal routing with obstacle detours, hover handles, drag-to-connect, shape picker, quick add, move, selection, delete, undo, zoom and saved geometry. Use for any work in frontend/src/features/swimlane or frontend/src/lib/diagram.
---

# Swimlane editor

Requirements: `SW-1`–`SW-21`. Pure logic lives in `frontend/src/lib/diagram/` (no React) and is unit-tested. Components render SVG only.

## Constants (from the prototype, in diagram units)
`LANE_MIN = 132`, `LABEL_W = 104`, `LANE_PAD = 34`, `MIN_W = 1016`, snap = 8, handle offset = 16, handle radius = 9.

| Type | w × h | Default label |
|---|---|---|
| start, end | 40 × 40 | (fixed "Start"/"End") |
| task, sub, doc | 136 × 64 | New step / Sub-process / Document |
| decision | 136 × 88 | Decision? |
| data | 120 × 72 | Data store |
| note | 184 × 64 | Add a note |

## Layout (`geometry.ts`)
- `ry(s)` is the shape's offset inside its lane. Default it to centred, `(LANE_MIN − h)/2`.
- `laneHeight = max(LANE_MIN, lane.minHeight ?? 0, max over shapes of ry + h + pad)`, where `pad = (LANE_MIN − h)/2` for a centred shape and `LANE_PAD` otherwise. That rule keeps an untouched decision lane at exactly 132.
- Lane tops are cumulative. `width = max(MIN_W, minWidth ?? 0, max(x + w) + 48)`.
- `laneLayout(skipId?)`: always compute "the lane under the pointer" **ignoring the dragged shape**. Otherwise its own growth keeps the pointer inside the lane and you can never drag into the next one (`SW-13`).

## Anchors and routing (`routing.ts`)
- Anchors are side midpoints: `l (x, cy)`, `r (x+w, cy)`, `t (cx, y)`, `b (cx, y+h)`.
- **Base route:**
  - straight if aligned;
  - horizontal side → vertical side: one elbow `[p1, [p2x, p1y], p2]`, and the mirror image;
  - two horizontal sides: `[p1, [mx, p1y], [mx, p2y], p2]`, and the vertical equivalent.
- **Obstacle check:** every shape's box expanded by 4px. The first and last segments ignore the two endpoint shapes; middle segments include them.
- **Detour** when the base route hits something: put stubs 16px out from each anchor, then try every lane gutter `gy ∈ {top + 14, top + h − 14}` with `[p1, s1, [s1x, gy], [s2x, gy], s2, p2]`. Keep the shortest clear one (Manhattan length). If none is clear, use the base route.
- `simplify()` removes duplicate points and collinear midpoints, but only when the midpoint lies *between* its neighbours, so stubs that reverse are kept.
- Sides for a new connector come from the drop. The target side is the anchor nearest the pointer. For the Connector tool, use `|dx| ≥ |dy|` to pick r/l or b/t.
- **Persist `points`** on save (ADR-2).

## Hit areas and layers (paint order)
1. Lane bands and the label column.
2. Lane-resize strips (10px at each lane bottom) and the width-resize strip (8px at the right edge). They go *under* connectors so a connector crossing a boundary stays clickable.
3. Visible connectors.
4. Shapes. Each `<g>` has a transparent hover pad (26px around) and its handles (opacity 0, shown on `:hover` or selection, hidden while dragging).
5. Connector **hit polylines**: 14px wide, trimmed `min(28, (L−12)/2)` from each end, and drawn above shapes.
6. Floating mini-toolbars and the drag-preview layer.

## Interactions
- **pointerdown on a handle** starts a `connect` drag, using pointer capture on the canvas host. The preview line is dashed blue.
  - The target is the shape whose box (+10px) contains the pointer. Highlight it, draw its four anchors, and fill the nearest one.
  - A drop on a target adds a connector (no duplicate `from→to`).
  - A drop in empty lane space adds a Task centred on the pointer and connects it, with the target side nearest the source anchor.
  - A drop on the label column cancels. A move under 5px counts as a **click**, see quick add.
- **Hover a handle for 380ms** to open the picker portal: Task, Decision, Sub-process, Document, Data, Note, End. Leaving for 280ms hides it, and so do Esc, scroll, and pointerdown outside it.
- **Quick add** (`quickAdd(from, side, type)`); a click on a handle uses `cloneType`, where start and end become task:
  - `r`/`l`: same lane, centre-aligned (`ry = ry(src) + (hSrc − h)/2`), at `x ± (w + 64)`;
  - `b`: the next lane, or the same lane at `ry(src) + hSrc + 48` when the source is in the last lane, which grows the lane;
  - `t`: the previous lane, or the same lane above the source when there is room;
  - then step by `w + 48` until there is no overlap within a 24px margin.
  - Select the new shape and focus its label.
- **Move:** pointerdown on a shape body (not its hover pad) and a move of more than 5px starts the drag. `x = snap(ox + dx)`, `lane = laneAt(y, skip=self)`, `ry = max(16, snap(y − offY − laneTop(skip)))`. Take an undo snapshot when the drag starts.
- **Lane resize:** `lane.minHeight = max(fit, snap(y − top))`. Clear it when it equals `fit`. Width resize works the same way.
- **Selection:**
  - Click selects. Shift-click toggles extra shapes. Ctrl/Cmd+A selects all.
  - Click empty canvas to clear.
  - Swallow the click that ends a drag, using a flag reset on the next pointerdown, never a timer.
- **Delete:**
  - Ways in: Delete or Backspace (not while typing), the floating trash, the context menu, the toolbar, or the inspector.
  - Remove the attached connectors too.
  - The snackbar reads "Deleted “X” and N connectors" with **Undo**.
- **Undo:** JSON snapshots of the document, capped at 60, taken *before* each mutation. Ctrl/Cmd+Z undoes; Ctrl/Cmd+D duplicates to the right into free space.
- **Context menu:** `contextmenu` on a shape, connector or canvas opens a `role="menu"` portal. Clamp it to the viewport and focus the first item.
- **Zoom:** 0.25–2.5. Render the `<svg>` with `width = W*z` and `height = H*z` and an unchanged `viewBox`. Convert pointer coordinates with `(clientX − rect.left) * W / rect.width`. Preserve the anchor with `scroll = (scroll + a)*z1/z0 − a`. **Fit** is `floor((canvasW − 80)/W * 1000)/1000`.
- **Canvas centring:** use `align-items: flex-start` with `margin: 0 auto` on the frame. Centred flex overflow hides the left edge of a wide diagram.
- **No watermark on the canvas** (`SW-20`). Export opens the export dialog.

## Accessibility
- Shapes are `g[role=button][tabindex=0]` with aria-labels: "Approve refund in Finance".
- Enter selects a shape. The inspector offers Move ← → ↑ ↓ and **Add connected step** (direction plus seven shapes) as the keyboard path for drag and hover-only features.
