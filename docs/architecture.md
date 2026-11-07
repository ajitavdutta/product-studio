# Architecture

## Overview

```
 Browser (React 19 + TS)                          FastAPI (Python 3.12)
 ┌───────────────────────────────┐   /api/*     ┌──────────────────────────────────────┐
 │ features/import   ── upload ──┼────────────▶ │ importers/jira  (csv | json | xml)   │
 │ features/roadmap  (SVG/HTML)  │              │ services/mapping (heuristics, tmpl)  │
 │ features/swimlane (SVG canvas)│ ◀─ documents │ documents/ (validate, migrate)       │
 │ features/export   (preview)   │   (JSON)     │ models/ + SQLite (SQLAlchemy 2)      │
 │ lib/timeline  ◀── fixtures ──▶│              │ render/  timeline · roadmap_svg ·    │
 │ lib/diagram (geometry,routing)│              │          diagram_svg · legend · fit ·│
 └───────────────────────────────┘              │          watermark                   │
          ▲  preview SVG / file                 │ exports/ pdf (CairoSVG) png (Cairo)  │
          └─────────────────────────────────────│          pptx (python-pptx)          │
                                                └──────────────────────────────────────┘
                shared/design-tokens.json  ── read by theme.ts AND render/theme.py
                docs/fixtures/timeline/*   ── tested by vitest AND pytest
```

## Decisions

### ADR-1 One export renderer, on the server
**Decision.** All PDF, PNG and PPTX files, and all export **previews**, are produced by `backend/app/render` (SVG), then converted by `backend/app/exports`.
**Why.** Output must not depend on the viewer's browser, fonts or zoom. One code path means the preview is the file.
**Consequences.**
- The export screen calls `POST /api/exports/preview` (debounced) and shows the returned SVG, or one SVG per slide.
- Fonts are bundled with the backend, so the CairoSVG/fontconfig configuration is part of the Docker image.

### ADR-2 Editors render in the browser; the diagram saves resolved geometry
**Decision.** The roadmap timeline and the swimlane canvas are React components. Swimlane routing, lane-size fitting and hit-testing live in `frontend/src/lib/diagram` as pure functions. On save, the client writes the **resolved geometry** into the document: absolute shape positions, lane heights, diagram width and each connector's `points`.
**Why.** Interaction needs instant feedback. Porting the routing algorithm to Python would create two implementations that drift.
**Consequences.**
- The backend validates the geometry (points are orthogonal and end on the right anchors) but does not re-route.
- If a connector arrives without points (an old document or an API client), the backend falls back to the simple orthogonal route and logs a warning.

### ADR-3 Timeline maths in both languages, locked by fixtures
**Decision.** The date → column scale (PIs, sprints, IP sprints, months, labels, compact sprint dates) is implemented in `frontend/src/lib/timeline` and `backend/app/render/timeline.py`. Both must produce exactly `docs/fixtures/timeline/*.json`.
**Why.** The editor and the export must show the same columns and labels.

### ADR-4 Versioned JSON documents in a documents table
**Decision.**
- Roadmaps and diagrams are stored as validated JSON (`documents.body`, plus indexed columns: id, kind, name, updated_at, schema_version).
- Mapping templates, watermark presets, settings and export history are ordinary tables.
- The downloadable `.json` file is the same document.
- `schemaVersion` is an integer, and migrations run on read and on import.

**Why.** The user's requirement is "save the roadmap as JSON to be reused". The file and the stored document must be identical so that round-trips are lossless.

### ADR-5 No auth in v1
A single workspace. A display name in Settings fills `{user}`. Keep service functions free of user parameters, so auth can be added at the router layer later.

### ADR-6 Synchronous exports
`POST /api/exports` renders and streams the file (target under 5 s). The history row stores the options and a copy of the file for 30 days. If renders grow beyond 5 s, move to a background job; the API shape (`exportId`, `status`) already allows this.

## API surface

| Method & path | Purpose |
|---|---|
| `POST /api/imports/jira` (multipart) | Parse a file → `ImportSession {id, format, rowCount, columns:[{name, samples, suggestedField, confidence}], statuses}` |
| `POST /api/imports/{id}/preview` | Mapping → `{epics, issues, teams, warnings, documentPreview}` |
| `POST /api/imports/{id}/commit` | Create the roadmap → `RoadmapRead` |
| `POST /api/roadmaps/{id}/resync` (multipart) → `POST …/resync/{diffId}/apply` | Diff and apply a newer export |
| `GET/POST/PATCH/DELETE /api/roadmaps[/{id}]` | CRUD. `PATCH` takes JSON-Patch-like ops for autosave |
| `GET /api/roadmaps/{id}/document` | Download `.json` |
| `POST /api/roadmaps/import-json` | Upload `.json` → validate → migrate → create |
| `…/api/diagrams…` | The same shape as roadmaps |
| `GET/POST/PATCH/DELETE /api/mapping-templates`, `/api/watermark-presets` | Templates and presets |
| `GET/PUT /api/settings` | Display name, PI cadence, default preset, Jira base URL |
| `POST /api/exports/preview` | `{source, format, options, watermark}` → `{pages:[svg…], fileName, summary}` |
| `POST /api/exports` | Same body → file stream (`Content-Disposition`) plus history row |
| `GET /api/exports`, `GET /api/exports/{id}/file` | History and re-download |

## Frontend state

- **Server state** (documents, templates, presets, history) uses TanStack Query, with keys like `['roadmap', id]` and `['diagram', id]`. Mutations are optimistic, with rollback and a snackbar.
- **Editor state** (selection, hover, drag, undo history, zoom, panel open) uses Zustand stores per feature. The undo history stores document snapshots, not diffs; there are at most 60. Autosave subscribes to document changes and PATCHes in a debounced way.
- **Panels** (open/collapsed) and per-view zoom are persisted to localStorage, wrapped in try/catch.

## Testing pyramid

- **Unit:** timeline maths, diagram geometry and routing, mapping heuristics and migrations, on both sides wherever the logic is shared.
- **Golden:** `backend/tests/render/golden/*.svg` for the roadmap in each view, the diagram, the watermark variants and the fitted layouts. Update them only on purpose.
- **API:** pytest with an httpx `AsyncClient` against a temporary SQLite database.
- **E2E:** Playwright covers the five journeys in `docs/design/screens.md` at 1440×900, plus the mobile smoke test at 390×844.
