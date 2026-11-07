# Data model

The Pydantic models in `backend/app/schemas/` are the contract, and TypeScript types are generated from them. Examples: `docs/examples/roadmap.example.json` and `docs/examples/diagram.example.json`.

## Roadmap document (`kind: "roadmap"`, `schemaVersion: 1`)

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | int | Bump on breaking change and add a migration |
| `id` | uuid | |
| `name` | str | |
| `source` | `{type: "jira-csv" \| "jira-json" \| "jira-xml" \| "json", file, importedAt, mappingTemplateId?}` | |
| `timeline` | `{start: date, sprintLengthDays: 14, pis: [{id, name, start: date, sprints: int, ipSprint: bool, sprintNames?: [str]}]}` | PI cadence (`RM-4`) |
| `lanes` | `[{id, name, color, position: float}]` | Teams. `color` is a token key |
| `statuses` | `[{id, name, color, jiraStatuses: [str]}]` | Defaults: not-started, in-progress, at-risk, done |
| `items` | `[{id, key, title, type, laneId, statusId, start?: date, end?: date, progress: 0–100, issues: {total, done, inProgress}, stories?: [{key, title, statusId}], notes?: str, jiraUrl?: str, position: float}]` | Items without `start`/`end` are unscheduled |
| `milestones` | `[{id, name, kind: "milestone" \| "freeze", date?: date, start?: date, end?: date}]` | |
| `linkedDiagrams` | `[uuid]` | |

Rules:
- `end` is inclusive in the document and in the UI. The timeline maths uses an exclusive end (`end + 1 day`).
- Progress is derived from `issues` when they are present; otherwise it is the manual value.

## Diagram document (`kind: "diagram"`, `schemaVersion: 1`)

| Field | Type | Notes |
|---|---|---|
| `schemaVersion`, `id`, `name`, `version: int`, `owner?`, `linkedRoadmapId?` | | `version` increments on explicit "Save version" |
| `orientation` | `"horizontal"` | `"vertical"` is reserved |
| `lanes` | `[{id, name, position, minHeight?: int, height: int}]` | `height` is resolved; `minHeight` is a manual resize |
| `width` | int | Resolved diagram width; `minWidth?` is a manual resize |
| `shapes` | `[{id, type: start\|end\|task\|decision\|sub\|doc\|data\|note, laneId, x, y, label?, sub?, owner?, fill?, jiraKey?}]` | `x` is absolute; `y` is relative to the lane top |
| `connectors` | `[{id, from, to, fromSide: l\|r\|t\|b, toSide, label?, style: "flow" \| "association", points: [[x,y], …]}]` | `points` are resolved, in absolute diagram coordinates |

## Other tables

- `mapping_templates (id, name, jira_site?, column_map JSON {jiraColumnOrFieldId: field}, status_map JSON, updated_at)`
- `watermark_presets (id, name, type, text?, image_asset_id?, position, opacity, color, is_default)`
- `assets (id, kind, mime, bytes, sha256)`: uploaded logos
- `settings (key, value JSON)`: displayName, jiraBaseUrl, defaultPresetId, piCadence
- `exports (id, source_kind, source_id, format, options JSON, file_name, size, created_at, file_asset_id)`

## Migrations

`backend/app/documents/migrations.py` holds `MIGRATIONS: dict[int, Callable[[dict], dict]]`, where each step goes from N to N+1. `load_document(raw)` applies the steps until it reaches `CURRENT`, then validates. Every migration has a fixture test (`tests/documents/test_migrations.py`).

Version 0 is the prototype's pre-contract roadmap. `docs/examples/roadmap.v0.json` says `"schemaVersion": 1` but has no `kind`, no ids and string `lanes`, so a document with no `kind` whose `lanes` are strings is treated as v0 whatever its `schemaVersion` says. Version 0 only exists for roadmaps.

## Autosave ops

The editors save with `PATCH /api/{roadmaps|diagrams}/{id}` and the body `{baseVersion, ops: [{op, path, value?, position?}]}` (1–500 ops). The server applies every op to a copy, validates the result and returns `{revision, fileName}`. A stale `baseVersion` returns 409. Any failing op or an invalid result returns 422 and nothing is saved.

- `path` is an RFC 6901 JSON Pointer over the camelCase document, with `~0` for `~` and `~1` for `/`.
- **Array segments.** If the array's elements are objects with an `id`, the segment is that id (`/items/it-pay-142/end`, `/connectors/c9/points`). Otherwise it is a non-negative integer index (`/items/it-pay-142/stories/2`). Addressing by id lets a client re-apply its pending ops after a 409.
- `set` creates or replaces the object key, or replaces the array element, at `path`. `value` is required; `null` is rejected with "Use remove to clear a field".
- `insert`: `path` is an array. Inserts `value` at `position`, or appends when `position` is absent. A duplicate `id` or `position` past the end is rejected.
- `remove` deletes the key or element at `path`. A missing target is an error.
- `move`: `path` is an array element and `position` is its new index in the same array.
- `/id`, `/kind` and `/schemaVersion` can't be set or removed: "The document's id, kind and schema version can't be changed".
- A `/name` change also renames the document's file name.

`shared/document-ops.cases.json` holds the cases that `backend/app/documents/ops.py` and `frontend/src/lib/documentOps/applyOps.ts` must both pass.
