# M1 · Documents and API: plan

Brief: `.claude/skills/milestone/milestones/M1-documents-and-api.md`. Branch: `milestone/M1-documents-and-api`. Skill: `document-format`. Tests freeze today at **2026-11-06**.

## Goal
Make roadmaps and diagrams real, versioned JSON documents. That covers the Pydantic document contract (`schemaVersion = 1`) with its geometry and date validators, migrations that run on read and on import (v0 → v1 from `docs/examples/roadmap.v0.json`), and the CRUD API for both kinds. The API includes ops-based autosave with optimistic concurrency (409 on a stale `baseVersion`), delete with a cascade summary, a lossless download and `import-json` round-trip, and the mapping templates, watermark presets, assets (logo uploads with SVG sanitising) and settings tables. `make seed` loads the two example documents. On the frontend, the generated types feed `useRoadmap`/`useDiagram` hooks and a `useAutosave(kind, id)` hook that drives the shell's save-state indicator. A Settings dialog sits behind a gear in the top bar. The M0 carry-overs close here too: the `demo` nav links, the lazy engine with a test session override, `updated_at` onupdate, the clock-test midnight flake, the breakpoints comment and the snackbar action token.

## In scope
- `G-2`: the autosave engine (`PATCH` ops, text debounced 500 ms, other edits immediate) and the download endpoint that "Save JSON" will use. The only editable field in M1 is a temporary document-name field on the placeholder pages. Real editors arrive in M3/M4.
- `G-1`: the save-state indicator, now fed by a real document ("Saved to `<file>`" / "Unsaved changes").
- `G-4`: settings API, plus the gear and the Settings dialog (display name, default PI cadence, default watermark preset; Jira base URL from `docs/data-model.md`).
- `RM-16`: the backend half. `GET /api/roadmaps/{id}/document` returns the exact document, and `POST /api/roadmaps/import-json` validates, migrates and gives plain-language errors. The client hooks exist. The Save JSON and Open JSON dialogs are M3.
- `SW-21`: the backend half. The diagram document carries lane sizes, shape positions and resolved connector points. `POST /api/diagrams` can start from a roadmap's teams or from three blank lanes. The dialogs are M4.
- `NF-3`: documents validate against Pydantic. Uploads are capped (20 MB for `import-json`, 2 MB for logos). JSON parsing never executes content, SVG goes through defusedxml and is sanitised, and download file names are sanitised.

## Out of scope (deferred)
- Save JSON and Open JSON UI (`RM-16`): **M3**. New-diagram dialog and Save JSON for diagrams (`SW-21`): **M4**.
- `HOME-1`, `HOME-2` recent lists and delete confirmation UI: **M2**. The hooks are ready.
- `exports` table and history (`EX-6`), built-in watermark presets "Confidential / Draft / Company logo" (`EX-3`): **M5**. **ASSUMPTION:** M1 ships the preset table and CRUD only, because the Company logo preset needs the M5 watermark UI and an asset.
- Mapping-template UI and field-name validation of `columnMap` values (`IMP-*`): **M2**.
- Render fallback for connectors without `points` (ADR-2): **M5**. M1 accepts `points: []` and logs a warning.
- Diagram `version` increment ("Save version"): **M4**.

## Contract changes (first)

### Document schemas: `backend/app/schemas/documents.py` (task 3)
- Base: `class DocumentModel(BaseModel)` with `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")`. The wire format is camelCase, exactly as in `docs/data-model.md`.
- **Lossless rule:** every document field is either required or defaults to `None`. Serialisation is always `model_dump(mode="json", by_alias=True, exclude_none=True)`, so a valid file dumps back to the same JSON. Put this in a module docstring and a helper `dump_document(doc) -> dict[str, Any]`.
- `CURRENT_SCHEMA_VERSION = 1`. Both documents have `schema_version: int`, and a validator requires it to equal `CURRENT_SCHEMA_VERSION`. Migration happens before validation.
- Roadmap models:
  - `RoadmapSource{type: Literal["jira-csv","jira-json","jira-xml","json"], file: str, imported_at: datetime, mapping_template_id: str | None}`;
  - `ProgramIncrement{id, name, start: date, sprints: int (1–12), ip_sprint: bool, sprint_names: list[str] | None}`;
  - `RoadmapTimeline{start: date, sprint_length_days: int (≥1), pis: list[ProgramIncrement]}`;
  - `RoadmapLane{id, name, color: TeamColor, position: float}`. `TeamColor = Literal["blue","deepOrange","blueGrey","purple","teal","brown"]`, the `team` keys of `shared/design-tokens.json`, locked by a test;
  - `RoadmapStatus{id, name, color: str, jira_statuses: list[str]}`. **ASSUMPTION:** status `color` stays a free string (`grey`, `green` are not `team` keys). M3 maps it to the status tokens;
  - `IssueCounts{total, done, in_progress}`, each `int ≥ 0`, with `done + in_progress ≤ total`;
  - `Story{key, title, status_id}`;
  - `RoadmapItem{id, key, title, type: str, lane_id, status_id, start: date | None, end: date | None, progress: int (0–100), issues: IssueCounts, stories: list[Story] | None, notes: str | None, jira_url: str | None, position: float}`;
  - `Milestone{id, name, kind: Literal["milestone","freeze"], date: dt.date | None, start: dt.date | None, end: dt.date | None}`. Import `datetime as dt`, because a field named `date` shadows the type;
  - `RoadmapDocument{schema_version, kind: Literal["roadmap"], id: UUID, name: str (1–200), source, timeline, lanes, statuses, items, milestones, linked_diagrams: list[UUID]}`.
- Diagram models:
  - `DiagramLane{id, name, position: float, min_height: int | None, height: int}`;
  - `DiagramShape{id, type: ShapeType, lane_id, x: float, y: float, label, sub, owner: str | None, fill: DiagramFill | None, jira_key: str | None}`. `DiagramFill` is the `diagram.fills` token keys;
  - `Connector{id, from_: str = Field(alias="from"), to, from_side: Side, to_side: Side, label: str | None, style: Literal["flow","association"], points: list[tuple[float, float]]}`;
  - `DiagramDocument{schema_version, kind: Literal["diagram"], id: UUID, name, version: int (≥1), owner: str | None, linked_roadmap_id: UUID | None, orientation: Literal["horizontal"], width: int, min_width: int | None, lanes, shapes, connectors}`.
- `model_validator(mode="after")` messages are plain sentences that go straight to the UI:
  - **Roadmap:**
    - ids are unique within lanes, statuses, items, PIs and milestones: "Two items share the id it-pay-142";
    - `laneId` and `statusId` exist: "Item PAY-142 is in a lane that doesn't exist (checkout)";
    - `start` and `end` are both set or both absent: "Item PAY-142 has a start date but no end date";
    - `end ≥ start`: "Item PAY-142 has an end date before its start date";
    - a `milestone` needs `date`, and a `freeze` needs `start ≤ end`.
  - **Diagram:**
    - shape and connector ids are unique, `shape.laneId` exists, and `from`/`to` exist;
    - `lane.height ≥ 132`: "Lane “Support” is shorter than the 132px minimum";
    - `width ≥ 1016`;
    - **geometry:** check every connector with points through `app/documents/geometry.py`. Collect *all* failing ids into one error: "Connectors c3, c9 aren't drawn correctly: each segment must be horizontal or vertical and start and end on its shapes' anchors".
- **ASSUMPTION:** cross-document references (`linkedDiagrams`, `linkedRoadmapId`, `mappingTemplateId`) are not checked for existence, so files stay portable. Dangling links are tolerated.

### Geometry and defaults (task 3), pure, no I/O
- `backend/app/documents/geometry.py`:
  - `LANE_MIN_HEIGHT = 132`, `MIN_WIDTH = 1016` and `ANCHOR_TOLERANCE_PX = 1`;
  - `SHAPE_SIZES: dict[ShapeType, tuple[int, int]]`, from the `swimlane-editor` skill table;
  - `lane_tops(lanes) -> dict[str, float]` (sorted by `position`, cumulative `height`);
  - `anchor(shape, side, lane_top) -> tuple[float, float]` (absolute y = lane top + `y`);
  - `bad_connector_ids(doc) -> list[str]`. A connector fails when any segment has both `dx ≠ 0` and `dy ≠ 0`, or when its first or last point is more than 1px from its anchor. It skips connectors with `points == []` after `logger.warning`, and it fails a single-point list.
- `backend/app/documents/defaults.py`:
  - `DEFAULT_STATUSES`, the four statuses exactly as in `roadmap.example.json`;
  - `TEAM_COLOR_ORDER` (blue, deepOrange, blueGrey, purple, teal, brown);
  - `BLANK_LANE_NAMES = ("Lane 1", "Lane 2", "Lane 3")` and `DEFAULT_DIAGRAM_NAME = "Untitled workflow"` (from the prototype `newdg`);
  - `DEFAULT_WATERMARK_OPACITY = 0.14`.
  - M2's importer reuses these.

### API envelopes: `backend/app/schemas/document_api.py` (tasks 5–6), camelCase like the documents
- `DocumentKind = Literal["roadmap","diagram"]`.
- `DocumentSummary{id, kind, name, file_name, schema_version, revision, updated_at}`. HOME-2 needs the name, file name and date.
- `RoadmapRead{id, name, file_name, revision, created_at, updated_at, document: RoadmapDocument}`, and `DiagramRead` with the same shape around a `DiagramDocument`.
- `DocumentOp{op: Literal["set","insert","remove","move"], path: str (pattern ^(/[^/]*)+$), value: JsonValue | None, position: int | None (≥0)}`.
- `DocumentPatch{base_version: int ≥ 0, ops: list[DocumentOp] (1–500)}`.
- `PatchResult{revision: int, file_name: str}`. **ASSUMPTION:** `fileName` is added to the brief's `{revision}`, so a rename updates the indicator without a refetch.
- `LinkedDocument{id, kind, name}` and `DeleteImpact{id, kind, name, unlinks: list[LinkedDocument], message: str}`.
- `DiagramCreate{name: str = "Untitled workflow", lanes_from: Literal["blank","roadmap"] = "blank", roadmap_id: UUID | None}`. A validator requires `roadmap_id` when `lanes_from == "roadmap"`.
- Shared errors live in `backend/app/schemas/errors.py`: `ErrorItem{path, message}` and `ProblemRead{detail: str, errors: list[ErrorItem] | None}`. Use `ProblemRead` in `responses=` on every 404, 409, 413, 415 and 422 route.

### Autosave op semantics (task 5). Write them into `docs/data-model.md`, new section "Autosave ops"
- `path` is an RFC 6901 JSON Pointer over the camelCase document, with `~0`/`~1` escaping.
- **Array segments:** if the array's elements are objects with an `id`, the segment is that **id** (`/items/it-pay-142/end`, `/connectors/c9/points`). Otherwise it's a non-negative integer index (`/items/it-pay-142/stories/2`). Addressing by id lets a client re-apply its pending ops after a 409.
- **The ops:**
  - `set` creates or replaces the object key, or replaces the array element, at `path`. `value` is required, and `null` is rejected with "Use remove to clear a field".
  - `insert`: `path` is an array. The op inserts `value` at `position`, or appends when there's no `position`. It rejects a duplicate `id` and `position > len`.
  - `remove` deletes the key or element at `path`. A missing target is an error.
  - `move`: `path` is an array element, and `position` is its new index in the same array.
- A `set`/`remove` on `/id`, `/kind` or `/schemaVersion` gives 422 "The document's id, kind and schema version can't be changed".
- The service applies all ops to a deep copy, then runs `model_validate`. Any failure gives 422 and no revision bump. `/name` changes also update `documents.name`.
- `shared/document-ops.cases.json`: about 14 cases, each `{name, before, ops, after}` or `{name, before, ops, error: {path}}`. Both `backend/app/documents/ops.py` and `frontend/src/lib/documentOps/applyOps.ts` must pass all of them, the same way the timeline fixtures lock ADR-3. **ASSUMPTION:** a new shared fixture file next to the design tokens. It isn't protected, but treat it like a fixture.

### Routes
| Method & path | Response | Notes |
|---|---|---|
| `GET /api/roadmaps`, `/api/diagrams` | `list[DocumentSummary]` | `updated_at desc, name, id` |
| `POST /api/roadmaps` | 201 `RoadmapRead` | Body `RoadmapDocument`. Keeps `id` unless it's taken, then assigns a new uuid4 |
| `POST /api/diagrams` | 201 `DiagramRead` | Body `DiagramCreate` (`SW-21`) |
| `GET /api/{kind}s/{id}` | `RoadmapRead` / `DiagramRead` | 404 "We couldn't find that roadmap. It may have been deleted." |
| `PATCH /api/{kind}s/{id}` | `PatchResult` | Body `DocumentPatch`. 409 "This roadmap changed somewhere else. Reload to see the latest version." |
| `GET /api/{kind}s/{id}/delete-impact` | `DeleteImpact` | For the confirmation dialog |
| `DELETE /api/{kind}s/{id}` | `DeleteImpact` (what happened) | See cascade below |
| `GET /api/{kind}s/{id}/document` | the document JSON | `Content-Disposition: attachment; filename="<slug>.json"` for a roadmap, `"<slug>.swimlane.json"` for a diagram. `response_model` is the document type, so OpenAPI is typed |
| `POST /api/{kind}s/import-json` | 201 `RoadmapRead` / `DiagramRead` | Multipart `file`, ≤ 20 MB (413), then JSON parse, `load_document`, create |
| `GET/POST /api/mapping-templates`, `GET/PATCH/DELETE /api/mapping-templates/{id}` | `MappingTemplateRead` | |
| `GET/POST /api/watermark-presets`, `GET/PATCH/DELETE …/{id}` | `WatermarkPresetRead` | |
| `GET/PUT /api/settings` | `SettingsRead` | `PUT` takes `SettingsUpdate` and applies only the set fields |
| `POST /api/assets` (multipart `file`) | 201 `AssetRead` | ≤ 2 MB (413), PNG/SVG/JPEG/WebP sniffed from bytes (415). Dedupes on sha256 |
| `GET /api/assets/{id}` | the bytes | Stored `mime`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` |

- **Cascade on delete.** **ASSUMPTION:** delete *unlinks* and never deletes the other document.
  - Deleting a roadmap clears `linkedRoadmapId` on every diagram that points to it.
  - Deleting a diagram removes its id from every roadmap's `linkedDiagrams`.
  - Each unlinked document's `revision` is bumped.
  - Example `message`: "Deleting “Payments Platform H1 2027” also unlinks 1 diagram: Customer refund flow. The diagram itself is kept."
- **`import-json` errors** use the 422 shape `{detail, errors}`, from `load_document`:
  - "This file isn't valid JSON";
  - "This file isn't a Product Studio document";
  - "This file is a swimlane diagram, not a roadmap" (and the reverse);
  - "This file was made by a newer version of Product Studio";
  - "This file uses an old format Product Studio can't read" (no migration path);
  - validator messages such as "Item PAY-142 has an end date before its start date".
- **File names** come from `file_name_for(kind, name)`:
  - lowercase the name, collapse every non-`[a-z0-9]` run to `-`, trim the dashes, cut to 80 characters, and use `untitled` if nothing is left;
  - then add `.json` for a roadmap or `.swimlane.json` for a diagram;
  - this follows the prototype's file names and sanitises them for `NF-3`.

### Other schemas (tasks 9–10)
- `schemas/mapping_templates.py`:
  - `MappingTemplateCreate{name (1–120), jira_site: str | None, column_map: dict[str, str], status_map: dict[str, str]}`;
  - `MappingTemplateUpdate` (all optional);
  - `MappingTemplateRead` (+ `id`, `updated_at`, `from_attributes`).
- `schemas/watermark_presets.py`:
  - `WatermarkPresetCreate{name (1–80), type: Literal["text","image"], text: str | None (≤200), image_asset_id: str | None, position: Literal["diagonal","tiled","corner"] = "diagonal", opacity: float (0.05–0.5) = 0.14, color: Literal["red","grey","blue","black"] = "red", is_default: bool = False}`;
  - validators: `text` requires `text`, and `image` requires `image_asset_id`;
  - plus Update and Read.
- `schemas/settings.py`:
  - `PiCadence{sprints_per_pi: int (1–12) = 6, ip_sprint: bool = True}`;
  - `SettingsRead{display_name: str = "", jira_base_url: HttpUrl | None, default_preset_id: str | None, pi_cadence: PiCadence}`;
  - `SettingsUpdate`: all optional, with `exclude_unset`, and an explicit `null` clears the URL or preset;
  - `display_name` is at most 80 characters.
  - **ASSUMPTION:** the default cadence is sprints-per-PI plus the IP flag. Sprint length stays per roadmap (`timeline.sprintLengthDays`), because RM-4 fixes two-week sprints.
- `schemas/assets.py`: `AssetRead{id, kind: Literal["logo"], mime, size, sha256}`.

### Models and Alembic (tasks 1, 8)
- `Document.updated_at` gains `default=clock.now, onupdate=clock.now`, and `created_at` gains `default=clock.now`. The `server_default` stays, so this is not an autogenerate diff and needs no migration. Task 1 proves this with `alembic check`.
- New tables in `backend/alembic/versions/0002_templates_presets_assets_settings.py`:
  - `mapping_templates`:
    - `id` String(36) PK, `name` String(120) indexed, `jira_site` String(255) nullable;
    - `column_map` JSON, `status_map` JSON;
    - `updated_at` indexed, with the same defaults as `Document`.
  - `watermark_presets`:
    - `id`, `name` String(80);
    - `type` String(8), check `('text','image')`;
    - `text` String(200) nullable;
    - `image_asset_id` FK `assets.id`, `ondelete="SET NULL"`, nullable;
    - `position` String(10), with a check;
    - `opacity` Float;
    - `color` String(8), with a check;
    - `is_default` Boolean, default false, indexed.
  - `assets`: `id`, `kind` String(16), `mime` String(32), `bytes` LargeBinary, `sha256` String(64) unique index.
  - `settings`: `key` String(64) PK, `value` JSON.
- **schemaVersion:** stays **1**. This is the first real contract, and `CURRENT_SCHEMA_VERSION = 1` is new. The only migration is v0 → v1.

### Migrations: `backend/app/documents/migrations.py` (task 4)
- `MIGRATIONS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {0: migrate_roadmap_v0_to_v1}`.
- `detect_version(raw) -> int`.
  - **ASSUMPTION** (important): `docs/examples/roadmap.v0.json` carries `"schemaVersion": 1` but has the prototype's pre-contract shape: no `kind`, no `id`, and lanes as strings.
  - So a document **without `kind` whose `lanes` are strings** is treated as v0, whatever its `schemaVersion` says.
  - Otherwise the version is the integer `schemaVersion`.
  - A missing or non-integer version raises "This file isn't a Product Studio document".
- `migrate_roadmap_v0_to_v1(raw)` is pure, deterministic, and copies its input with `copy.deepcopy`. It sets:
  - `kind="roadmap"`;
  - `id = uuid5(NAMESPACE_URL, "product-studio:v0:" + name + ":" + source.file)`;
  - `source.mappingTemplate` (a template *name*) is dropped. **ASSUMPTION**, because v1 only holds an id;
  - `timeline.pis[i].id = f"pi-{i+1}"`;
  - lanes become `{id: slug(name), name, color: TEAM_COLOR_ORDER[i % 6], position: (i+1)*1000}`;
  - `statuses = DEFAULT_STATUSES`;
  - for items:
    - `id = "it-" + slug(key)`, `type="Epic"`, `laneId = slug(lane)`;
    - `statusId` matches the v0 `status` case-insensitively against the status names, and falls back to `not-started`;
    - `issues = {total: n, done: floor(n*progress/100 + 0.5), inProgress: 0}`. **ASSUMPTION:** `done` is derived so that derived progress ≈ the v0 progress. It reproduces the example's `done` values for all six in-progress/at-risk items;
    - `position = (i+1)*1000`;
  - milestones get `id = "ms-" + slug(name)` and `kind` defaulting to `"milestone"`;
  - `linkedDiagrams = []`. **ASSUMPTION:** v0 links are file names and can't be resolved to UUIDs;
  - `schemaVersion = 1`.
- `load_document(raw: object, expected_kind: DocumentKind) -> RoadmapDocument | DiagramDocument`. Give it `@overload`s per kind for mypy. It:
  - rejects a non-dict;
  - detects the version;
  - rejects anything newer than `CURRENT_SCHEMA_VERSION`;
  - checks `kind` (v0 means roadmap);
  - runs `MIGRATIONS[v]` for `v in range(version, CURRENT)` (a missing step means "old format");
  - runs `model_validate`;
  - converts a `ValidationError` with `to_problem(exc)`.
- `backend/app/documents/errors.py`: `to_problem(exc: ValidationError) -> InvalidInputError`.
  - `loc` becomes a JSON-pointer `path`, using the alias names.
  - `msg` loses Pydantic's `"Value error, "` prefix.
  - `detail` is the single message, or "N problems found. The first: <message>".
  - Never return a raw Pydantic dump.

### `gen:api`
Run it in task 12. `frontend/src/api/types.ts` is regenerated and the diff is committed. The M0 anchor `src/api/health.ts` is deleted in task 2.

## Parallelism map

| Task | Owner | Writes only under | Runs in parallel with |
|---|---|---|---|
| 1 | backend-engineer | `backend/app/db.py`, `backend/app/models/document.py`, `backend/app/services/errors.py`, `backend/app/api/errors.py`, `backend/app/schemas/errors.py`, `backend/app/main.py`, `backend/tests/conftest.py`, `backend/tests/core/`, `backend/tests/db/` | 2 |
| 2 | frontend-engineer | `frontend/src/app/`, `frontend/src/api/health.ts` (delete), `shared/design-tokens.json` (add only), `.claude/skills/prototype-parity/scripts/capture.mjs` | 1, 3–11 |
| 3 | backend-engineer | `backend/app/schemas/documents.py`, `backend/app/documents/{__init__,geometry,defaults}.py`, `backend/tests/documents/test_schemas.py`, `test_geometry.py` | 2, 8–10 |
| 4 | backend-engineer | `backend/app/documents/{migrations,errors}.py`, `backend/tests/documents/test_migrations.py`, `backend/tests/documents/fixtures/` | 2, 5, 8–10 |
| 5 | backend-engineer | `backend/app/documents/ops.py`, `backend/app/schemas/document_api.py` (op types only), `shared/document-ops.cases.json`, `backend/tests/documents/test_ops.py`, `docs/data-model.md` | 2, 4, 8–10 |
| 6 | backend-engineer | `backend/app/repositories/{__init__,documents}.py`, `backend/app/services/documents.py`, `backend/app/schemas/document_api.py` (envelopes), `backend/tests/services/` | 2, 8–10 |
| 7 | backend-engineer | `backend/app/api/routers/{roadmaps,diagrams}.py`, `backend/app/main.py` (two `include_router` lines), `backend/tests/api/test_roadmaps_api.py`, `test_diagrams_api.py` | 2, 8–10 |
| 8 | backend-engineer | `backend/app/models/{mapping_template,watermark_preset,asset,setting,__init__}.py`, `backend/alembic/versions/0002_*.py`, `backend/tests/db/test_migrations.py` | 2, 3–7 (after 1) |
| 9 | backend-engineer | `backend/app/{schemas,repositories,services}/{mapping_templates,watermark_presets}.py`, `backend/app/api/routers/{mapping_templates,watermark_presets}.py`, `backend/app/main.py` (two lines), `backend/tests/api/test_mapping_templates_api.py`, `test_watermark_presets_api.py` | 2, 3–7 (after 8) |
| 10 | backend-engineer | `backend/app/{schemas,services}/{settings,assets}.py`, `backend/app/services/svg_sanitizer.py`, `backend/app/repositories/{settings,assets}.py`, `backend/app/api/routers/{settings,assets}.py`, `backend/app/main.py` (two lines), `backend/tests/api/test_settings_api.py`, `test_assets_api.py`, `backend/tests/services/test_svg_sanitizer.py` | 2, 3–7 (after 9) |
| 11 | backend-engineer | `backend/app/seed.py`, `backend/tests/test_seed.py`, `Makefile`, `README.md` | 2, 8–10 (after 7) |
| 12 | frontend-engineer | `frontend/src/api/types.ts` (generated), `frontend/src/api/client.ts`, `client.test.ts` | none (needs 7, 9, 10) |
| 13 | frontend-engineer | `frontend/src/lib/documentOps/` | 14, 16 (after 12) |
| 14 | frontend-engineer | `frontend/src/api/{useRoadmap,useDiagram}.ts` + tests | 13, 16 (after 12) |
| 15 | frontend-engineer | `frontend/src/api/useAutosave.ts` + test, `frontend/src/features/{roadmap,swimlane}/` | 16 (after 13, 14) |
| 16 | frontend-engineer | `frontend/src/api/{useSettings,useWatermarkPresets}.ts`, `frontend/src/features/settings/`, `frontend/src/app/AppShell.tsx` | 13, 14, 15 (after 12 and 2) |
| 17 | test-engineer | `frontend/e2e/`, `.github/workflows/ci.yml`, `backend/tests/api/test_nf3_uploads.py`, `backend/tests/api/test_rm16_round_trip.py` | none (needs everything) |

- **There are three lanes.**
  - **Backend documents** (1 → 3 → {4 ‖ 5} → 6 → 7 → 11).
  - **Backend tables** (8 → 9 → 10), which starts after task 1.
  - **Frontend nits** (2), which runs from the start.
- **Tasks 4 and 5** write disjoint files in the same package, so they can run together.
- **The only file shared across lanes is `backend/app/main.py`.** Tasks 7, 9 and 10 each add `include_router` lines only. If two of them run at once, the later one re-reads `main.py` before its edit. Task 1 sets up `register_error_handlers(app)` there first.
- **`app/schemas/document_api.py`** is created in task 5 (op types) and extended in task 6. Those tasks are sequential.
- **The frontend lane (12–16)** waits for every backend route, so `gen:api` runs once.

## Ordered tasks

### 1. M0 backend nits and shared error plumbing (backend-engineer). About 250 lines.
- **Lazy engine** in `app/db.py`:
  - replace the module-level `engine`/`SessionLocal` with `@lru_cache def get_engine() -> Engine` and `@lru_cache def get_sessionmaker() -> sessionmaker[Session]`;
  - `get_session()` uses `get_sessionmaker()()`;
  - `alembic/env.py` already reads settings and needs no change. Check it doesn't import `engine`.
  - The point: importing `app.main` no longer creates `./product_studio.db`.
- **Test session override** in `tests/conftest.py`:
  - add a fixture `db_engine(tmp_database_url)` that runs `create_engine` and `Base.metadata.create_all` (the migration tests keep covering Alembic) and disposes on teardown;
  - add a fixture `db_session(db_engine)`;
  - `client` now builds `app = create_app()` and sets `app.dependency_overrides[get_session]` to yield sessions from a `sessionmaker(db_engine, expire_on_commit=False)`.
- **`updated_at` onupdate:** `Document.created_at` and `updated_at` gain `default=clock.now`, and `updated_at` also gains `onupdate=clock.now`. Comment why: frozen in tests, and services must not call `datetime.now`.
- **Clock flake:** in `tests/core/test_clock.py::test_freeze_none_restores_real_date`, capture `before = datetime.now(UTC).date()`, call `clock.today()`, capture `after`, and assert `today in {before, after}`.
- **Errors:**
  - `app/services/errors.py` defines `ServiceError(detail: str)` and its subclasses `NotFoundError`, `ConflictError`, `InvalidInputError(detail, errors: list[ErrorItem] | None)`, `PayloadTooLargeError` and `UnsupportedMediaTypeError`;
  - `app/schemas/errors.py` is as in the contract;
  - `app/api/errors.py: register_error_handlers(app)` maps these to 404, 409, 422, 413 and 415, returning `ProblemRead` JSON;
  - `create_app()` calls it.
- **Satisfies:** the M0 nits, and `NF-3` (error shape).
- **Tests:**
  - `tests/db/test_session.py::test_client_uses_temporary_database`: POST nothing, then assert `Path("product_studio.db")` was not created in `tmp_path`/cwd by the fixture, and that `get_session` is overridden;
  - `test_updated_at_moves_on_update`: freeze at 2026-11-06, insert, freeze at 2026-11-07, update `name`, assert `updated_at.date() == 2026-11-07`;
  - `tests/api/test_errors.py::test_not_found_error_returns_problem_json`, using a throwaway route on a fresh app.
- **Proof:** `make lint`, `uv run --directory backend pytest -q`, and `alembic check` reporting no new operations.

### 2. M0 frontend nits and demo nav (frontend-engineer, parallel with everything backend). About 120 lines.
- **Breakpoints comment:** in `frontend/src/app/theme.ts`, extend the comment on `custom.media` to say: use `theme.custom.media.mobile` for the 720px layout, and never `theme.breakpoints.down(...)`. MUI's breakpoints keep their defaults (600/900) and `down()` excludes the boundary.
- **Snackbar action token:**
  - add `"snackbarAction": "#90caf9"` to `color` in `shared/design-tokens.json`. It's a new token, the prototype's `.toast .tbtn` colour. No existing value changes;
  - it reaches `neutralPalette` automatically;
  - in `SnackbarProvider.tsx` the Undo button uses `color: 'neutral.snackbarAction'` plus `caption` typography, `textTransform: 'uppercase'` and `fontWeight: 'fontWeightBold'`, matching `.tbtn`. Remove `color="inherit"`;
  - check contrast against MUI's snackbar background: ≥ 4.5:1 (NF-2).
- **Demo nav:**
  - new `frontend/src/app/demoDocuments.ts` exports `DEMO_ROADMAP_ID = '0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31'` and `DEMO_DIAGRAM_ID = '5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50'`, with a comment: these are the ids `make seed` loads from `docs/examples/`, and M2/M3 replace them with the last-opened document;
  - `MainNav.tsx` uses them, and the old ASSUMPTION comment is replaced;
  - update the `ROUTES` map in `.claude/skills/prototype-parity/scripts/capture.mjs` (`roadmap`, `swimlanes`) to the same UUID paths.
  - **ASSUMPTION:** keep the examples' real UUIDs rather than seeding the id `demo`. `id` is a UUID in the schema, and the two examples link to each other by these ids.
- **Delete** `frontend/src/api/health.ts`, as M0 asked. Task 12 regenerates the types.
- **Tests:**
  - `theme.test.ts`: `it('G-3 exposes the snackbar action colour from tokens')`;
  - `AppShell.test.tsx`: `it('G-1 Roadmap and Swimlanes link to the seeded demo documents')`;
  - `SnackbarProvider.test.tsx`: the existing undo test still passes.
- **Proof:** `pnpm -C frontend lint && pnpm -C frontend typecheck && pnpm -C frontend test`.

### 3. Document schemas and geometry (backend-engineer, after 1). About 380 lines.
- **Files:** `app/schemas/documents.py`, `app/documents/__init__.py`, `geometry.py` and `defaults.py`, as in Contract changes.
- **Satisfies:** `NF-3` (validation), `SW-21` (the geometry contract), and brief step 1.
- **Tests** in `tests/documents/test_schemas.py`. The examples load from `REPO_ROOT / "docs/examples"`, held in the fixtures `roadmap_example` and `diagram_example`.
  - `test_NF_3_roadmap_example_validates`, `test_NF_3_diagram_example_validates`.
  - `test_RM_16_roadmap_dump_equals_example_json` and `test_SW_21_diagram_dump_equals_example_json`: `dump_document(model_validate(x)) == x`.
  - `test_NF_3_end_before_start_message` ("Item PAY-142 has an end date before its start date").
  - `test_NF_3_start_without_end_rejected`, `test_NF_3_unknown_lane_id_rejected`, `test_NF_3_duplicate_item_ids_rejected`, `test_NF_3_freeze_needs_start_and_end`.
  - `test_SW_21_lane_height_131_rejected`.
  - `test_SW_21_non_orthogonal_connector_listed`: change c9's middle point, and the error names `c9`.
  - `test_SW_21_endpoint_within_1px_accepted`, `test_SW_21_endpoint_2px_off_rejected_lists_all_ids` (c3 and c5).
  - `test_SW_21_connector_without_points_accepted_with_warning` (`caplog`).
  - `test_team_colors_match_design_tokens` and `test_lane_min_height_matches_design_tokens`, which read `shared/design-tokens.json`.
- **Tests** in `tests/documents/test_geometry.py`: `test_lane_tops_follow_position_not_list_order`, `test_anchor_sides_for_task_and_decision`.
- **Proof:** `pytest -q tests/documents` and `mypy --strict app`.

### 4. Migrations and `load_document` (backend-engineer, after 3; parallel with 5). About 300 lines.
- **Files:** `app/documents/migrations.py` and `app/documents/errors.py`, as in Contract changes.
- **Expected v1 fixture:** `tests/documents/fixtures/roadmap.v1-from-v0.json`, written by hand from the rules above. It contains the four default statuses, ten items with `inProgress: 0`, `linkedDiagrams: []` and the uuid5 id.
- **Satisfies:** brief step 2, `RM-16` (migrate and plain errors), `NF-3`.
- **Tests** in `tests/documents/test_migrations.py`:
  - `test_RM_16_v0_example_migrates_to_expected_v1`: `dump_document(load_document(v0, "roadmap")) == expected`;
  - `test_migration_does_not_mutate_input` (deep-copy comparison);
  - `test_migration_is_deterministic` (two runs, same id);
  - `test_v0_detected_despite_schema_version_1`;
  - `test_RM_16_newer_version_rejected` ("…made by a newer version…");
  - `test_RM_16_diagram_file_opened_as_roadmap` ("This file is a swimlane diagram, not a roadmap") and the reverse;
  - `test_RM_16_non_object_rejected`;
  - `test_RM_16_validation_error_is_plain_language`: `detail` doesn't contain "Value error" or "pydantic", and `errors[0].path == "/items/0/end"`;
  - `test_every_migration_step_has_a_fixture`: for each key in `MIGRATIONS`, a matching fixture exists.
- **Proof:** `pytest -q tests/documents`.

### 5. Document ops and the shared op cases (backend-engineer, after 3; parallel with 4). About 300 lines.
- **`app/documents/ops.py`:**
  - `apply_ops(body: Mapping[str, Any], ops: Sequence[DocumentOp]) -> dict[str, Any]` (pure, deep copy);
  - `class OpError(Exception)` with `path` and `message`;
  - `parse_pointer(path) -> list[str]`.
- **`app/schemas/document_api.py`:** `DocumentOp`, `DocumentPatch` and `PatchResult` only.
- **`shared/document-ops.cases.json`.** Cover:
  - set a scalar;
  - set a new optional key;
  - set a whole element by id;
  - set `null` (error);
  - insert with and without `position`;
  - insert a duplicate id (error);
  - remove an element by id;
  - remove an optional key;
  - remove a missing target (error);
  - move by id;
  - index addressing on `stories`;
  - `~1` escaping;
  - a protected path (error).
- **Docs:** add the "Autosave ops" section to `docs/data-model.md`, and a line under Migrations about v0 detection.
- **Satisfies:** `G-2` (server semantics).
- **Tests** in `tests/documents/test_ops.py`:
  - `test_G_2_shared_op_cases` (parametrised over the JSON file, ids = case names);
  - `test_apply_ops_does_not_mutate_input`.
- **Proof:** `pytest -q tests/documents/test_ops.py`.

### 6. Documents repository and service (backend-engineer, after 4 and 5). About 400 lines. If it grows, split the delete/cascade code into 6b.
- **`app/repositories/documents.py`**, typed SQLAlchemy only:
  - `get(session, kind, id) -> Document | None`;
  - `exists(session, id) -> bool`;
  - `list_by_kind(session, kind) -> list[Document]`, ordered `updated_at desc, name, id`;
  - `add(session, row)`;
  - `update_if_revision(session, id, base_revision, body, name) -> bool`. This runs `UPDATE … SET body, name, revision = revision + 1, updated_at = clock.now() WHERE id = :id AND revision = :base`, and returns `rowcount == 1`;
  - `delete(session, row)`.
  - Always assign a **new** dict to `body`, because the SQLAlchemy JSON type doesn't track in-place mutation.
- **`app/services/documents.py`.** Every function takes `session` first and has no user parameter (ADR-5):
  - `file_name_for(kind, name)`;
  - `list_documents`;
  - `get_roadmap` / `get_diagram`, which raise `NotFoundError`;
  - `create_document(session, document)`, which keeps the id or assigns `uuid4` when it's taken;
  - `create_diagram(session, request: DiagramCreate)`:
    - **blank:** `BLANK_LANE_NAMES` with ids `lane-1..3`, positions 1000/2000/3000 and `height=132`, `width=1016`, and one `start` shape `{id: "start", laneId: "lane-1", x: 128, y: 46}`, as the prototype `createDg` does;
    - **from a roadmap:** the roadmap lanes sorted by position, keeping their ids and names, `height=132`, the same start shape, `linkedRoadmapId` set, and the new id appended to the roadmap's `linkedDiagrams` (bumping its revision);
  - `import_json(session, kind, raw: bytes)`: `json.loads` with a `JSONDecodeError` giving "This file isn't valid JSON", then `load_document`, then `create_document`;
  - `patch_document(session, kind, id, patch) -> PatchResult`:
    - loads the row, and a stale `base_version` raises `ConflictError`;
    - runs `apply_ops`, where an `OpError` becomes `InvalidInputError` with `errors=[{path, message}]`;
    - runs `model_validate` (`to_problem` on failure), then `dump_document`;
    - calls `update_if_revision`, which raises `ConflictError` if it returns false;
  - `delete_impact(session, kind, id) -> DeleteImpact` and `delete_document(session, kind, id) -> DeleteImpact`, which unlink as described in the contract. **ASSUMPTION:** linked documents are found by scanning `list_by_kind` bodies in Python, which is fine at v1 sizes and portable SQL;
  - `download(session, kind, id) -> tuple[dict[str, Any], str]`.
- **Satisfies:** brief step 3, `G-2`, `RM-16`, `SW-21`.
- **Tests** in `tests/services/test_documents_service.py`, using `db_session`:
  - `test_G_2_patch_increments_revision`;
  - `test_G_2_stale_base_version_conflicts`;
  - `test_G_2_invalid_op_rolls_back_and_keeps_revision`;
  - `test_G_2_rename_updates_name_column_and_file_name`;
  - `test_SW_21_blank_diagram_has_three_lanes_and_start`;
  - `test_SW_21_diagram_from_roadmap_uses_its_teams_and_links_both_ways`;
  - `test_delete_roadmap_unlinks_diagram_and_names_it`;
  - `test_delete_diagram_removes_it_from_linked_diagrams`;
  - `test_create_keeps_id_or_assigns_new_when_taken`;
  - `test_NF_3_file_name_is_sanitised` (with `"../Q3: Plan/??"`, `""` and a 300-character name).
- **Proof:** `pytest -q tests/services` and `mypy --strict app`.

### 7. Roadmap and diagram routers (backend-engineer, after 6). About 300 lines.
- **Routers:** `app/api/routers/roadmaps.py` and `diagrams.py`, thin.
  - Each route validates, calls the service, and returns a Pydantic model.
  - `import-json` takes an `UploadFile`, checks `file.size` when it's known, then reads `MAX_UPLOAD_BYTES + 1` (20 MB, a constant in `app/core/limits.py`). Too big gives `PayloadTooLargeError` "Files must be 20 MB or smaller".
  - Declare `/import-json` before `/{id}`.
  - `/document` returns `JSONResponse(content=body, headers={"Content-Disposition": f'attachment; filename="{file_name}"'})` with `response_model=RoadmapDocument`.
  - Register both routers in `app/main.py`.
- **Satisfies:** brief step 3, `RM-16`, `SW-21`, `G-2`, `NF-3`.
- **Tests** in `tests/api/test_roadmaps_api.py`:
  - `test_RM_16_round_trip_download_then_import_is_lossless`: POST the example, then GET `/document`, which equals the example JSON. Import that into an empty DB and the id is kept and the content is equal. Import it again and you get a new id, with everything else equal;
  - `test_G_2_patch_409_on_stale_base_version` (two PATCHes with the same `baseVersion`; the second returns 409 with `detail`);
  - `test_G_2_patch_422_lists_op_path`;
  - `test_RM_16_import_json_rejects_diagram_file`;
  - `test_RM_16_import_json_invalid_json`;
  - `test_download_has_attachment_file_name` (`payments-platform-h1-2027.json`);
  - `test_list_returns_summaries_with_file_name`;
  - `test_delete_impact_then_delete`;
  - `test_get_missing_returns_404_detail`.
- **Tests** in `tests/api/test_diagrams_api.py`:
  - `test_SW_21_round_trip_download_then_import_is_lossless`;
  - `test_SW_21_bad_geometry_422_lists_connector_ids`;
  - `test_SW_21_create_from_roadmap`;
  - `test_G_2_patch_409_on_stale_base_version`.
- **Proof:** `pytest -q tests/api` and `make lint`.

### 8. New tables and migration 0002 (backend-engineer, after 1; parallel with 3–7). About 200 lines.
- **Models:** `app/models/mapping_template.py`, `watermark_preset.py`, `asset.py` and `setting.py`, as in Contract changes. Re-export them from `app/models/__init__.py`.
- **Alembic:** `alembic/versions/0002_templates_presets_assets_settings.py`, with `down_revision = "0001…"` and a `downgrade` that drops the four tables.
- **Satisfies:** brief step 4.
- **Tests** in `tests/db/test_migrations.py`:
  - extend `test_upgrade_head_creates_documents_table` into `test_upgrade_head_creates_all_tables`, which also checks the columns per table;
  - `test_models_match_migrations` (already exists, and must pass);
  - `test_downgrade_to_0001_drops_new_tables`.
- **Proof:** `pytest -q tests/db` and `alembic check`.

### 9. Mapping templates and watermark presets CRUD (backend-engineer, after 8). About 380 lines.
- **Files:** schemas, repositories, services and routers as listed in the parallelism map. Register them in `main.py`.
- **Service behaviour:**
  - creating or updating a preset with `is_default=True` calls `services.watermark_presets.set_default_preset(session, preset_id | None)`. That one function clears `is_default` on the others and writes `settings.defaultPresetId`, so the two never disagree. **ASSUMPTION:** `settings.defaultPresetId` is the source of truth, and the `is_default` column mirrors it;
  - an `image` preset with an unknown `imageAssetId` gives 422 "That logo no longer exists. Upload it again.";
  - deleting the default preset clears the setting.
- **Satisfies:** brief step 4, `G-4` (default preset).
- **Tests:**
  - `test_mapping_template_crud` (create, list, get, patch, delete; `updatedAt` moves under a changed freeze);
  - `test_mapping_template_404`;
  - `test_G_4_setting_default_preset_clears_previous_default`;
  - `test_text_preset_requires_text`;
  - `test_opacity_bounds_5_to_50_percent`;
  - `test_image_preset_requires_existing_asset`;
  - `test_deleting_default_preset_clears_setting`;
  - `test_default_opacity_matches_design_tokens`.
- **Proof:** `pytest -q tests/api` and `mypy --strict app`.

### 10. Settings and assets (backend-engineer, after 9). About 380 lines.
- **Settings:** `services/settings.py` has `get_settings_read(session)` (defaults for missing keys) and `update_settings(session, update)`.
  - It writes only the fields that were set.
  - An unknown `defaultPresetId` gives 422 "That watermark preset doesn't exist".
  - A changed `defaultPresetId` goes through `set_default_preset`.
- **Asset upload:** `services/assets.py` has `upload_logo(session, data: bytes) -> AssetRead`.
  - Over `MAX_LOGO_BYTES = 2 * 1024 * 1024` gives 413 "Logos must be 2 MB or smaller".
  - The type is sniffed from the bytes, never from the client's content type:
    - PNG: `\x89PNG\r\n\x1a\n`;
    - JPEG: `\xff\xd8\xff`;
    - WebP: `RIFF????WEBP`;
    - SVG: UTF-8 that defusedxml parses with an `{http://www.w3.org/2000/svg}svg` root.
  - Anything else gives 415 "Logos must be PNG, SVG, JPEG or WebP".
  - The upload dedupes by sha256 of the stored (sanitised) bytes.
- **`services/svg_sanitizer.py`:** `sanitize_svg(data: bytes) -> bytes`.
  - It parses with `defusedxml.ElementTree.fromstring`. DTDs, entities and external references raise, and that gives 415 "This SVG uses features we can't accept".
  - It removes every `script` and `foreignObject` element in any namespace.
  - It strips every `on*` attribute.
  - It strips `href`/`xlink:href` unless the value starts with `#` or `data:image/png|jpeg|webp`.
  - It serialises with `xml.etree.ElementTree.tostring`, after registering the `svg` and `xlink` namespaces so the output has no `ns0:` prefixes.
  - The brief only asks for scripts and foreignObject. Handlers and `javascript:` links are the same attack class, so the sanitiser strips them too.
- **Routers:** `settings.py` (`GET`, `PUT`) and `assets.py` (`POST`, `GET /{id}` with the headers from the routes table). Register them in `main.py`.
- **Satisfies:** brief step 4, `G-4`, `NF-3`.
- **Tests:**
  - `test_G_4_settings_defaults` (`displayName ""`, cadence 6/true);
  - `test_G_4_put_display_name_persists`;
  - `test_G_4_put_partial_keeps_other_fields`;
  - `test_G_4_unknown_default_preset_422`;
  - `test_NF_3_logo_png_upload_and_fetch_headers`;
  - `test_NF_3_logo_over_2mb_413`;
  - `test_NF_3_logo_type_sniffed_not_trusted` (PNG bytes sent as `image/svg+xml` are stored as `image/png`, and text sent as `image/png` gives 415);
  - `test_logo_dedupes_on_sha256`;
  - `tests/services/test_svg_sanitizer.py`: `test_NF_3_strips_script`, `test_NF_3_strips_foreign_object`, `test_NF_3_strips_event_handlers`, `test_NF_3_strips_javascript_href`, `test_NF_3_rejects_entities`, and `test_keeps_paths_and_internal_use_refs`.
- **Proof:** `pytest -q` and `make lint`.

### 11. Seed and `make seed` (backend-engineer, after 7; parallel with 8–10). About 120 lines.
- **`app/seed.py`:**
  - `EXAMPLES_DIR = Path(__file__).resolve().parents[2] / "docs" / "examples"`;
  - `seed_examples(session, examples_dir) -> list[str]` loads `roadmap.example.json` and `diagram.example.json` through `load_document` and `create_document`. It **skips ids that already exist**, so it's idempotent (**ASSUMPTION:** no `--reset` flag), and it returns the created ids;
  - `main()` uses `get_sessionmaker()` and prints one line per document.
- **`Makefile`:** add `seed` to `.PHONY`, then `seed: uv run --directory backend alembic upgrade head && uv run --directory backend python -m app.seed`.
- **`README.md`:** under "Run the app", add `make seed` (loads the demo roadmap and diagram that the Roadmap and Swimlanes nav links open). Note that it's a dev command: the Docker image doesn't contain `docs/`.
- **Satisfies:** brief step 5, and "the demo roadmap and diagram load through the API".
- **Tests** in `tests/test_seed.py`:
  - `test_seed_creates_demo_documents_loadable_via_api` (seed into `db_session`, then GET both ids through `client` returns 200 with the names);
  - `test_seed_is_idempotent`.
- **Proof:** `make seed` twice against a fresh DB, then `curl localhost:8000/api/roadmaps/0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31` returns 200.

### 12. `gen:api` and client upload support (frontend-engineer, after 7, 9, 10). About 120 lines plus the generated diff.
- **Generate:** start the backend and run `pnpm -C frontend gen:api`. Commit `src/api/types.ts`.
- **`src/api/client.ts`:**
  - `ApiError` gains `readonly errors: readonly ErrorItem[]` (empty by default), parsed from a 422 body's `errors` when it's an array of `{path: string, message: string}`;
  - add `apiUpload<T>(path: string, file: Blob, fileName: string): Promise<T>` (multipart `file`, same error handling). It's still the only `fetch` in the app.
- **Tests** in `client.test.ts`:
  - `it('RM-16 exposes the server errors list on 422')`;
  - `it('uploads a file as multipart with field "file"')`;
  - `it('apiUpload throws ApiError status 0 on network failure')`.
- **Proof:** typecheck, lint and test. Running `gen:api` again gives no diff.

### 13. Pure `applyOps` (frontend-engineer, after 12; parallel with 14 and 16). About 200 lines.
- **`src/lib/documentOps/applyOps.ts`:**
  - `applyOps<T>(document: T, ops: readonly DocumentOp[]): T` (immutable, no React) and `class DocumentOpError extends Error { path }`;
  - `DocumentOp` is a type-only import from `src/api/types.ts`;
  - it mirrors `backend/app/documents/ops.py` exactly;
  - the module comment says: change one, change the other, and the shared cases lock both.
- **Tests** in `src/lib/documentOps/applyOps.test.ts`: `it.each` over `../../../../shared/document-ops.cases.json`, named `G-2 op case: <name>`. Extend `tsconfig.app.json` `include` if needed, as was done for the tokens.
- **Proof:** `pnpm -C frontend test` and the backend `test_G_2_shared_op_cases`, both green on the same file.

### 14. Roadmap and diagram hooks (frontend-engineer, after 12; parallel with 13 and 16). About 300 lines.
- **`src/api/useRoadmap.ts`:**
  - `roadmapKeys = { list: ['roadmaps'] as const, detail: (id: string) => ['roadmap', id] as const }`;
  - type aliases from `components['schemas']`;
  - `useRoadmaps()`, `useRoadmap(id)`, `useRoadmapDeleteImpact(id, enabled)`;
  - `useCreateRoadmap()`;
  - `useImportRoadmapJson()` (`apiUpload`), which seeds the detail cache on success;
  - `useDeleteRoadmap()`: optimistic removal from the list, rollback, and `snackbar.error("Couldn't delete that roadmap")`. On settled it invalidates the list and the diagram queries, because unlinking changed them.
- **`src/api/useDiagram.ts`:** the same, with `diagramKeys` (`['diagrams']`, `['diagram', id]`), plus `useCreateDiagram()` taking `DiagramCreate`.
- **Satisfies:** brief step 6, and `RM-16`/`SW-21` (client side).
- **Tests** in `useRoadmap.test.tsx` and `useDiagram.test.tsx`, with `vi.mock('./client')` and `renderHook` in `AppProviders`:
  - `it('uses the ["roadmap", id] query key')`;
  - `it('RM-16 import-json puts the new roadmap in the cache')`;
  - `it('rolls back an optimistic delete and shows a snackbar on failure')`;
  - `it('SW-21 creates a diagram from roadmap teams')`.
- **Proof:** typecheck, lint and test.

### 15. `useAutosave` and the document pages (frontend-engineer, after 13 and 14). About 400 lines. If it grows, split into 15a (hook) and 15b (pages).
- **`src/api/useAutosave.ts`:**
  - `export const TEXT_DEBOUNCE_MS = 500`;
  - `useAutosave(kind: 'roadmap' | 'diagram', id: string): { save(ops: DocumentOp[], mode: 'text' | 'immediate'): void; flush(): void; state: 'saved' | 'unsaved' }`.
- **Behaviour:**
  1. `save` applies the ops optimistically to the cached `document` right away with `applyOps`. If that throws, nothing is sent and the user gets `snackbar.error("Couldn't save that change")`.
  2. `text` ops are coalesced by `path` (last wins) and sent after 500 ms of quiet. `immediate` flushes the pending text ops and its own ops in one PATCH, text first.
  3. There's at most one request in flight. Ops that arrive meanwhile queue for the next request.
  4. The hook keeps a `confirmed` snapshot `{document, revision}`. On success it sets the cached `revision` and `fileName` from `PatchResult` and advances `confirmed`.
  5. On a 409 it runs `queryClient.fetchQuery` (staleTime 0), re-applies the sent and queued ops on the fresh document, writes the cache, and retries once with the fresh revision. If the retry fails, it puts the fresh server document in the cache, drops the pending ops, and shows `snackbar.error("Couldn't save — reloaded the latest version")` (`document-format` skill copy).
  6. On any other error it restores `confirmed`, drops the pending ops, and shows `snackbar.error("Couldn't save that change")`.
  7. **Save state:** `useSaveStateStore.set('unsaved', fileName)` while anything is pending or in flight, and `set('saved', fileName)` when idle. On unmount it flushes (fire-and-forget) and calls `set(null)`. It also flushes on `visibilitychange` → hidden. **ASSUMPTION:** no `beforeunload` prompt.
- **`features/roadmap/RoadmapPage.tsx` and `features/swimlane/SwimlanePage.tsx`:**
  - `useParams` id, then `useRoadmap(id)` / `useDiagram(id)`;
  - while loading: `<Skeleton/>`;
  - a 404 `ApiError` shows the empty state "We couldn't find that roadmap." with an "Import from Jira" button to `/import`. For diagrams: "We couldn't find that diagram." with a "Go home" button. **ASSUMPTION:** this copy;
  - other errors show `Alert severity="error"` "Couldn't load the roadmap." with Retry;
  - once loaded: `PageHeading` shows the document name, with the lede "The roadmap editor arrives in a later milestone." (or "diagram editor"), plus a temporary labelled `TextField` "Roadmap name" / "Diagram name" that calls `save([{op:'set', path:'/name', value}], 'text')`.
  - **ASSUMPTION:** this field exists only to exercise G-2 end to end until M3/M4 replace these pages.
- **Satisfies:** `G-2`, `G-1`.
- **Tests** in `useAutosave.test.tsx` (fake timers, mocked client):
  - `it('G-2 debounces text edits by 500 ms into one PATCH')`;
  - `it('G-2 saves an immediate edit without waiting')`;
  - `it('G-2 sends pending text ops before an immediate op')`;
  - `it('G-2 on 409 refetches, re-applies pending ops and retries once')`;
  - `it('G-2 after a second 409 reloads and says "Couldn\'t save — reloaded the latest version"')`;
  - `it('G-2 rolls back and tells the user when a save fails')`;
  - `it('G-1 shows Unsaved changes while saving and Saved to <file> after')`.
- **Tests** in `RoadmapPage.test.tsx` and `SwimlanePage.test.tsx`: loading, error with Retry, the 404 empty state, and `it('G-1 shows Saved to payments-platform-h1-2027.json once loaded')`.
- **Proof:** typecheck, lint and test, then `make dev` + `make seed`. Open Roadmap from the nav, rename, watch "Unsaved changes" become "Saved to …", and reload: the change persists.

### 16. Settings gear and dialog (frontend-engineer, after 12 and 2; parallel with 13–15). About 300 lines.
- **`src/api/useSettings.ts`:** `settingsKeys = ['settings']`, `useSettings()`, and `useUpdateSettings()`. The update is optimistic, rolls back with `snackbar.error(detail)`, and calls `notify('Settings saved')` on success.
- **`src/api/useWatermarkPresets.ts`:** `useWatermarkPresets()` (list only, key `['watermarkPresets']`).
- **`src/features/settings/SettingsDialog.tsx`:**
  - an MUI `Dialog` titled "Settings", which traps focus and restores it on close;
  - fields:
    - "Display name", with helper "Fills the {user} watermark token";
    - "Sprints per PI" (number 1–12);
    - checkbox "Last sprint is an IP sprint";
    - "Default watermark preset" (`Select`: "None" plus the presets; when there are no presets, it's disabled with helper "Save a preset from the Exports page");
    - "Jira site URL", with helper "Used for Open in Jira links";
  - buttons Cancel and Save;
  - the dialog shows loading and error-with-retry states;
  - **ASSUMPTION:** the copy above, and Save/Cancel rather than autosave for settings.
- **`AppShell.tsx`:** after `SaveStateSlot`, add an `IconButton aria-label="Settings"` with `SettingsOutlined` that opens the dialog. The prototype has no gear, so this is a listed deviation.
- **Satisfies:** `G-4`, NF-2 (labels, focus).
- **Tests** in `SettingsDialog.test.tsx`:
  - `it('G-4 opens from the gear and focuses the dialog')`;
  - `it('G-4 saves the display name and shows "Settings saved"')`;
  - `it('G-4 rolls back and shows the server detail on 422')`;
  - `it('G-4 lists presets in the default preset select')`.
- **Tests** in `AppShell.test.tsx`: `it('G-4 shows a labelled Settings button')`.
- **Proof:** typecheck, lint and test.

### 17. E2E, CI and acceptance gaps (test-engineer, after all)
- **`frontend/e2e/documents.spec.ts`** (getByRole/getByLabel only):
  - `test('G-1 Roadmap nav opens the demo roadmap and shows Saved to payments-platform-h1-2027.json')`;
  - `test('G-2 renaming the demo diagram autosaves and survives reload')`. Type, expect "Unsaved changes", then "Saved to customer-refund-flow.swimlane.json", reload, and the field has the new value. `afterEach` restores the name through `request` (GET the revision, then PATCH);
  - `test('G-4 settings dialog saves the display name')`, which restores it afterwards;
  - mobile: `test('G-5 demo roadmap page has no horizontal scroll at 390px')`.
- **`.github/workflows/ci.yml`:** in the e2e job, run `make seed` before `make dev &`.
- **`backend/tests/api/test_nf3_uploads.py`:**
  - `test_NF_3_import_json_rejects_over_20mb` (413 and its detail);
  - `test_NF_3_import_json_never_evaluates` (a JSON string containing `__import__('os')` stays a plain string or fails validation);
  - `test_NF_3_svg_upload_served_sanitised`: upload an SVG with `<script>`, `onload` and `<foreignObject>`, then GET `/api/assets/{id}`, whose body has none of them and has the CSP header.
- **`backend/tests/api/test_rm16_round_trip.py`:** `test_RM_16_v0_file_imports_then_downloads_as_v1` (upload `docs/examples/roadmap.v0.json` through `import-json`, and the download equals `tests/documents/fixtures/roadmap.v1-from-v0.json`).
- **Parity:** run `node .claude/skills/prototype-parity/scripts/capture.mjs home`, plus `roadmap` and `swimlanes` (header only; the page bodies are placeholders). List the differences: the gear and the placeholder bodies.
- **Report** the pass/fail counts per suite.

## Risks and assumptions
- **ASSUMPTION (v0 detection):** `roadmap.v0.json` says `schemaVersion: 1` but is the pre-contract prototype shape. A file with no `kind` and string `lanes` is treated as v0. The user may prefer to fix the example to `"schemaVersion": 0` instead. It's not a protected path, but this plan doesn't edit it.
- **ASSUMPTION (v0 lossy fields):** v0 `source.mappingTemplate` (a name) and `linkedDiagrams` (file names) are dropped. `issues.done` is derived from progress, `inProgress` is 0, and the id is a deterministic uuid5.
- **ASSUMPTION (demo ids):** the nav and the parity script use the examples' real UUIDs, not `demo`. `make seed` must run before e2e and parity captures, and CI runs it.
- **ASSUMPTION:** `extra="forbid"` on documents. Unknown keys get a 422, which catches typos and hand edits. The trade-off: a file from a *newer* build with a new optional field and the same `schemaVersion` is rejected. This build should then say "newer version". Revisit if that bites.
- **ASSUMPTION:** delete *unlinks* linked documents and never deletes them. The confirmation names what gets unlinked.
- **ASSUMPTION:** `PatchResult` carries `fileName` as well as `revision`.
- **ASSUMPTION:** `settings.defaultPresetId` is the source of truth, and `watermark_presets.is_default` mirrors it through one service function.
- **ASSUMPTION:** default PI cadence = sprints per PI (6) + IP flag (true), and status `color` is a free string until M3.
- **ASSUMPTION:** built-in watermark presets are deferred to M5. Connectors with no points are accepted, with a warning.
- **ASSUMPTION:** the temporary name field on placeholder pages, the empty-state copy and the Settings dialog copy. The gear is not in the prototype, but `G-4` requires it.
- **Risk: lossless round-trip.** It depends on the "required or `None`" rule and on `exclude_none`. A future field with a non-`None` default breaks it, and the round-trip tests catch that. Floats (`1000` vs `1000.0`) compare equal after `json.loads`. Datetimes keep their `+05:30` offset.
- **Risk: JSON mutation tracking.** SQLAlchemy won't see an in-place `body` change. The repository always assigns a new dict.
- **Risk: list ordering under a frozen clock.** All rows share `updated_at` in tests. The tie-break is `name, id`, and order tests change the freeze between writes.
- **Risk: concurrent edits to `app/main.py`** by tasks 7, 9 and 10. They're one-line additions; re-read the file before editing.
- **Risk: `from` alias.** It needs an explicit `Field(alias="from")`, because the alias generator would give `from_`. Check that the generated TS has `from: string`.
- **Spec vs prototype:** the prototype's file names are `payments-roadmap-h1-2027.json` and `refund-flow.swimlane.json`. Ours derive from the document name (`payments-platform-h1-2027.json`, `customer-refund-flow.swimlane.json`), because the spec doesn't fix them and the document stores no file name.

## Done when
- [ ] `G-2`:
  - autosave PATCH works with `baseVersion`;
  - text is debounced at 500 ms and other edits are immediate;
  - a 409 refetches, re-applies and retries once, then shows "Couldn't save — reloaded the latest version";
  - a failure rolls back and tells the user;
  - `GET …/document` downloads the document.
- [ ] `G-1`: the indicator shows "Saved to `<file>`" / "Unsaved changes" from a real document, and is hidden on Home.
- [ ] `G-4`: the gear opens Settings, and the display name, PI cadence, default preset and Jira URL persist through `GET/PUT /api/settings`.
- [ ] `RM-16` (backend): the round-trip test passes for roadmaps. `import-json` migrates v0 and rejects bad files in plain language.
- [ ] `SW-21` (backend):
  - the round-trip test passes for diagrams;
  - geometry is validated (orthogonal, ±1px anchors, lane ≥ 132), and a failure gives a 422 listing the connector ids;
  - a diagram can be created blank or from a roadmap's teams.
- [ ] `NF-3`: Pydantic validation, the 20 MB `import-json` limit, the 2 MB logo limit with type sniffing, SVG sanitising (script, foreignObject, handlers, `javascript:` links, entities), sanitised file names, and no eval.
- [ ] The migration test (`test_RM_16_v0_example_migrates_to_expected_v1`), the 409 tests (API and `useAutosave`) and both round-trip tests pass.
- [ ] `make seed` is idempotent, and the demo roadmap and diagram load through the API and from the nav.
- [ ] `shared/document-ops.cases.json` passes in pytest **and** vitest.
- [ ] Alembic `0002` is up, down and check clean. `updated_at` moves on update, using the clock.
- [ ] M0 nits are closed:
  - lazy engine and test DB override (no `product_studio.db` created by tests);
  - `updated_at` onupdate;
  - the clock test is midnight-safe;
  - the breakpoints comment;
  - the `snackbarAction` token (a new token; no existing value changed);
  - `demo` links resolved.
- [ ] `gen:api` has been rerun, the `types.ts` diff is included, and running it again gives no diff. `src/api/health.ts` is removed.
- [ ] `make lint` and `make test` pass. `make e2e` passes `shell.spec.ts` and `documents.spec.ts` (desktop + mobile).
- [ ] `docs/data-model.md` documents the autosave ops and v0 detection. The README documents `make seed`.
- [ ] Screens changed (shell gear, document placeholder pages) were compared with the prototype at 1440×900 and 390×844, and the differences are listed.
- [ ] Protected files are untouched: `git diff --stat -- docs/fixtures docs/design/prototype docs/design/screens docs/product-spec.md` is empty.
- [ ] The summary ticks G-1, G-2, G-4, RM-16 (backend), SW-21 (backend) and NF-3, and lists the ASSUMPTIONs above.
