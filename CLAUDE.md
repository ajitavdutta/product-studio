# Product Studio

A product-management tool with three jobs:

1. **Roadmap from Jira.** Import a Jira export (CSV, JSON or XML), map its columns, and build a roadmap that is saved as a reusable JSON document. Sprint, Month and PI views.
2. **Swimlane diagrams.** Draw business workflows across teams (lanes) in a draw.io-style editor.
3. **Exports.** Roadmap as PDF, PNG or PowerPoint; swimlane diagram as PDF or PNG. Any export can carry a watermark.

## Sources of truth

| Question | Read |
|---|---|
| What must it do? Acceptance criteria with IDs (`G-`, `HOME-`, `IMP-`, `RM-`, `SW-`, `EX-`, `NF-`) | `docs/product-spec.md` |
| How is it built? ADR-1…6, API surface | `docs/architecture.md` |
| What does it look like? | `docs/design/prototype/index.html`, `docs/design/screens.md`, `docs/design/screens/*.png` |
| Colours, type, spacing (UI **and** exports) | `shared/design-tokens.json` |
| Document formats | `docs/data-model.md`, `docs/examples/*.json` |
| Expected timeline maths | `docs/fixtures/timeline/*.json` |
| Expected Jira import result | `docs/fixtures/jira/payments-export.{csv,expected.json}` |
| Milestone plans (written by the planner) | `docs/plans/` |

The prototype is a **design and behaviour reference**, not code to copy. Rebuild it with the stack below. When the spec and the prototype disagree, the spec wins — say so in your summary.

## Stack

- **Frontend** (`frontend/`): React 19, TypeScript strict, Vite, MUI 7 + Emotion, TanStack Query 5 (server state), Zustand (editor-local state: selection, undo, zoom), React Router 7, Vitest + RTL, Playwright. pnpm.
- **Backend** (`backend/`): Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 + Alembic, SQLite (Postgres-compatible SQL), pytest, ruff, mypy strict. uv.
- **Exports:** Python builds SVG; CairoSVG → PDF/PNG; python-pptx → PPTX with native shapes. Fonts (Roboto, Roboto Mono) in `backend/app/exports/fonts/`.

Use the latest stable versions when scaffolding and pin them in lockfiles. Don't add a dependency that duplicates one above.

## Layout

```
frontend/src/
  app/            router, providers, theme.ts (built from shared/design-tokens.json)
  api/            client.ts, generated types.ts (never hand-edit), one hooks file per resource
  features/       home/ import/ roadmap/ swimlane/ export/ — each owns components, hooks, state
  lib/timeline/   pure date → column maths (mirrors backend/app/render/timeline.py)
  lib/diagram/    pure geometry, routing, hit-testing, history (no React)
  components/     shared presentational components (props only)
frontend/e2e/     Playwright journeys
backend/app/
  api/routers/    one router per resource (thin)
  schemas/        Pydantic models = API and document contracts
  models/         SQLAlchemy tables
  services/       business logic
  importers/jira/ CSV / JSON / XML readers, field-mapping heuristics
  documents/      document validation and schemaVersion migrations
  render/         timeline.py roadmap_svg.py diagram_svg.py legend.py watermark.py fit.py theme.py
  exports/        pdf.py png.py pptx.py fonts/
backend/tests/
```

## Architecture rules (blocking in review)

- **One export renderer (ADR-1).** PDF, PNG, PPTX and export previews all come from `backend/app/render`. The browser never generates export files, screenshots the DOM, or uses a client-side PDF/PPTX library.
- **Diagrams save resolved geometry (ADR-2).** The swimlane editor computes lane sizes and connector points and saves them; the backend draws exactly that and never re-routes.
- **Timeline maths is duplicated on purpose (ADR-3).** `frontend/src/lib/timeline` and `backend/app/render/timeline.py` both pass `docs/fixtures/timeline/`. Change one → change the other in the same change.
- **Versioned JSON documents (ADR-4).** Integer `schemaVersion`; migrations only in `backend/app/documents/migrations.py`; downloaded `.json` re-imports losslessly.
- **No authentication in v1 (ADR-5).** No login, users or ownership checks. Settings hold a display name for the `{user}` watermark token.
- **Synchronous exports (ADR-6).**
- **Design tokens only.** Never hardcode a colour in a component or a renderer.

## Conventions

- **TypeScript:** no `any`; no non-null `!` without a comment. API types come from `pnpm -C frontend gen:api`. MUI `sx` + theme tokens only (SVG geometry attributes excepted). Every query renders loading, error-with-retry and a real empty state. Edits are optimistic, roll back on failure and tell the user.
- **Python:** routers validate and delegate; services hold logic; no SQL in routers. Return Pydantic models. `HTTPException` with a user-readable `detail`. `mypy --strict` passes.
- **Ordering:** user-reordered lists use a float `position` (midpoint of neighbours; `first / 2`; `last + 1000`).
- **Accessibility:** real buttons/inputs with labels, `aria-label` on icon buttons, keyboard paths for every canvas action (nudge, Delete, Ctrl/Cmd+Z, Ctrl/Cmd+D, Ctrl/Cmd + `=` `-` `0`), focus-trapping dialogs, contrast ≥ 4.5:1.
- **Destructive actions** offer Undo (diagram edits) or a confirmation naming what cascades.
- **Tests** are named after requirement IDs, e.g. `test_EX_7_no_today_line`, `it('SW-13 drags a shape into the next lane')`. Today is frozen at **2026-11-06**.

Area-specific rules load automatically from `.claude/rules/` when you touch `frontend/`, `backend/`, the export code or tests.

## Commands

```
make dev          # backend :8000 + frontend :5173 (proxy /api)
make test         # pytest + vitest
make e2e          # Playwright journeys against make dev
make lint         # ruff, mypy, eslint, tsc --noEmit
pnpm -C frontend gen:api                       # regenerate src/api/types.ts from OpenAPI
uv run --directory backend alembic upgrade head
```

Before M0 exists, these commands don't — scaffold first (`/milestone M0`).

## Definition of done (every change)

- `make lint` and `make test` pass; changed journeys pass `make e2e`.
- Route or schema changed → `gen:api` rerun, diff included.
- Model changed → Alembic migration. Document shape changed → `schemaVersion` bump + migration + test.
- Timeline maths changed → both implementations pass `docs/fixtures/timeline/`.
- Rendering changed → golden SVGs in `backend/tests/render/golden/` updated on purpose, with the reason stated.
- Screen changed → compared with the prototype at 1440×900 and 390×844; differences listed.
- The spec's acceptance criteria for the feature are ticked in the summary or PR.

## How work is organised here

- **Subagents** (`.claude/agents/`): `planner` → `backend-engineer` → `export-engineer` → `frontend-engineer` → `test-engineer` → `reviewer`. The main session orchestrates them; each returns a short report, not a transcript.
- **Knowledge skills** (`.claude/skills/`, loaded when relevant and preloaded into the matching subagents): `jira-field-mapping`, `roadmap-timeline`, `swimlane-editor`, `export-rendering`, `document-format`, `prototype-parity`.
- **Workflow commands:** `/build-product-studio [M#]`, `/milestone M#`, `/implement-feature <ID or description>`, `/review-against-prototype <route>`, `/verify`.
- **Protected files** (a hook blocks direct edits): `docs/fixtures/**`, `docs/design/prototype/**`, `docs/design/screens/**`, `docs/product-spec.md`, and the generated `frontend/src/api/types.ts` (regenerate it with `gen:api` instead). If a protected file looks wrong, stop and tell the user rather than working around it. `shared/design-tokens.json` may gain tokens, but never change an existing value without saying why.
- When the spec is silent, pick the simplest option consistent with the prototype, mark it `ASSUMPTION` in the plan, and continue.
