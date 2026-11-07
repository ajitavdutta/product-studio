<!-- Brief for /milestone M1: M1 — roadmap and diagram document schemas, migrations, CRUD, autosave PATCH, JSON download/upload round-trip, settings, templates and presets tables. -->

# M1 · Documents and API

Load the `document-format` skill. Requirements: `G-2`, `G-4`, `RM-16`, `SW-21`, `NF-3`.

1. Write `app/schemas/documents.py` exactly as in `docs/data-model.md`:
   - `RoadmapDocument`, `DiagramDocument` and their nested models;
   - `CURRENT_SCHEMA_VERSION = 1`;
   - validators: `end ≥ start`; lane heights ≥ 132; orthogonal connector points that end on their anchors (±1px).
2. Write `app/documents/migrations.py` (`MIGRATIONS`, `load_document`) and `tests/documents/test_migrations.py` with a v0 → v1 fixture. v0 is the prototype's "What gets saved" JSON in `docs/examples/roadmap.v0.json`.
3. Add the `documents` repository and service, and these routes for both `roadmaps` and `diagrams`:
   - list, get, create;
   - `PATCH` autosave ops with `baseVersion` and a `409` on a stale version;
   - delete, with a confirmation-friendly response naming what cascades (a roadmap lists its linked diagrams);
   - `GET …/{id}/document` (download) and `POST …/import-json` (upload, then migrate, then validate).
4. Add tables, CRUD and tests for `mapping_templates`, `watermark_presets`, `assets` (logo uploads ≤ 2 MB, PNG/SVG/JPEG/WebP; sanitise SVG by stripping scripts and foreignObject) and `settings`.
5. Seed the demo data: `docs/examples/roadmap.example.json` and `diagram.example.json`, loaded with `make seed`.
6. Run `gen:api`. On the frontend, add `src/api/useRoadmap.ts` and `useDiagram.ts` with query keys, plus a `useAutosave(kind, id)` hook that debounces text by 500 ms and saves other edits immediately. Show the save-state indicator in the shell.

## Done when
- The round-trip tests pass for both kinds, as do the migration test and the 409 conflict test.
- The demo roadmap and diagram load through the API.
