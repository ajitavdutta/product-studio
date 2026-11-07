<!-- Brief for /milestone M4: M4 — draw.io-style swimlane editor: lanes that grow with shapes, eight shape types, hover handles, drag-to-connect, shape picker, click-to-clone, orthogonal routing with detours, move between lanes, selection, delete, undo, context menu, inspector, zoom and saved geometry. -->

# M4 · Swimlane editor

Load `swimlane-editor` and `prototype-parity`. Prototype route: `#swimlanes`. Try hovering an arrow, dragging an arrow onto a shape, dropping it in empty space, right-clicking, Shift-clicking and pressing Delete then Ctrl+Z. Requirements: `SW-1`–`SW-21`.

Plan in this order. Each step is one task with unit tests.

1. **`lib/diagram/geometry.ts`:** constants, `ry`, `laneLayout(skipId?)`, `diagramSize`, anchors, `laneAt(y, skipId?)`, `shapeAt`, `nearestSide` and `overlaps`.
2. **`lib/diagram/routing.ts`:** `baseRoute`, `smartRoute` (gutter detours), `simplify` and `trimPath`.
3. **`lib/diagram/history.ts`:** snapshot undo, capped at 60.
4. **Canvas components:**
   - layers in the documented paint order;
   - shapes by type, connectors with labels, hover handles, hit polylines;
   - the floating mini-toolbar and the connector delete button;
   - lane and width resize strips.
5. **Interactions** (Zustand `state.ts`):
   - drag-to-connect with the target highlight, and drop-to-create;
   - the hover picker (380/280 ms) and click-to-clone quick add;
   - move with snap, using `laneAt` ignoring self;
   - Shift multi-select and Ctrl/Cmd+A;
   - delete from every entry point, with the Undo snackbar;
   - the context menu;
   - Ctrl/Cmd+Z / Ctrl/Cmd+D / Delete;
   - zoom 25–250% with anchor-preserving scroll and Fit;
   - frame centring that never clips the left edge.
6. **Inspector** with the Shape, Connector, Multi, Lanes and Diagram tabs, including **Add connected step**, collapsing to a rail with tab icons.
7. **Save:** resolved geometry (`points`, heights, width) in the autosave PATCH.
8. **New diagram** dialog (roadmap teams or three blank lanes). **Export PDF/PNG** opens the export dialog, built in M5. Until then, show a disabled button with "Coming in M5".

## Done when
- The unit tests cover every rule in the skill.
- The Playwright journey (drag-connect, picker add, click-clone, move to the next lane, delete + undo, multi-delete, right-click delete, zoom + Fit) passes at 1440×900.
- Dragging a shape across 200 shapes stays at about 60 fps (performance mark in the test).
