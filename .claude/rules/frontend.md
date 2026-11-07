---
paths:
  - "frontend/**"
---

# Frontend conventions

- **Structure:** `features/<f>/{<F>Page.tsx, use<F>.ts, state.ts, components/}`. Pure logic belongs in `lib/` (no React imports). Shared presentational pieces belong in `components/` (props only).
- **Server state:** TanStack Query only, with query keys `['roadmap', id]`, `['diagram', id]`, `['exports']` and `['templates']`. Mutations:

  ```ts
  onMutate: async (next) => { await qc.cancelQueries({ queryKey }); const prev = qc.getQueryData(queryKey); qc.setQueryData(queryKey, apply(next)); return { prev } },
  onError: (_e, _v, ctx) => { qc.setQueryData(queryKey, ctx?.prev); snackbar.error("Couldn't save that change") },
  onSettled: () => qc.invalidateQueries({ queryKey }),
  ```
- **Editor state** (selection, drag, hover, undo, zoom, panel open) goes in per-feature Zustand stores. Never put document data in two places: the document is in the query cache, and the editor store holds ids and transient state.
- **Styling:** MUI components and `sx` with theme tokens (`theme.palette.status.atRisk`, `theme.spacing(2)`). No hex values or px font sizes in components. SVG canvases may use numeric geometry, but colours still come from the theme.
- **Every query** renders three states: `<Skeleton/>` while loading, `<Alert severity="error">` with a Retry action on error, and a real empty state with a call to action.
- **Canvas components:**
  - Memoise per id.
  - Pass handlers through a stable `useEvent`/ref.
  - Use pointer events with `setPointerCapture` on the host.
  - Put floating UI (picker, context menu, mini-toolbar) in portals positioned from `getBoundingClientRect()`.
  - Swallow the click that ends a drag with a flag reset on the next pointerdown.
- **Accessibility:**
  - Use real buttons with `aria-label` on icon-only controls, and `aria-pressed` on toggle groups.
  - Use `role="menu"`/`menuitem` for the context menu and picker.
  - Make Esc close floating UI. Dialogs restore focus on close.
- **Persist** collapsed panels and per-view zoom in localStorage, wrapped in try/catch.
- **Do not:**
  - call `fetch` outside `src/api/client.ts`;
  - hand-edit `src/api/types.ts`;
  - use `useEffect` to fetch;
  - use `any`;
  - generate export files in the browser.
