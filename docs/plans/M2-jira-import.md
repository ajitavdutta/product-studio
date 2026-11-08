# M2 · Jira import and Home: plan

Brief: `.claude/skills/milestone/milestones/M2-jira-import.md`. Branch: `milestone/M2-jira-import`. Skills: `jira-field-mapping`, `prototype-parity`, `document-format`. Prototype routes: `#home`, `#import`, `#map`. Screens: `01-home.png`, `02-import-upload.png`, `03-import-map.png`, `03b-import-create-dialog.png`. Tests freeze today at **2026-11-06**.

## Goal
Turn a Jira export into a saved roadmap. The backend reads CSV, JSON and XML exports (`app/importers/jira/`), suggests a column mapping (template → exact → alias → sniff, with confidence), merges repeated columns, maps statuses, rolls stories up into epics, and builds a schema-v1 `RoadmapDocument`. It keeps an import session between upload, live preview and commit. The frontend gets a three-step import flow: Upload, Map fields, and Preview & save (shown beside Map, as in the prototype). It also gets a real Home page with three tiles, recent roadmaps and diagrams, and delete with a confirmation. The acceptance gate is that `docs/fixtures/jira/payments-export.csv` produces exactly `payments-export.expected.json`, and that the Playwright journey "import sample → fix Components → create" passes.

## In scope
- `HOME-1` and `HOME-2`, plus the M1 deferral: the delete confirmation UI on the Home lists.
- `IMP-1` to `IMP-12`.
- `NF-3` for the new upload: the 20 MB cap, defusedxml for XML, utf-8-sig then cp1252, and CSV streamed rather than loaded whole.
- Carry-overs from `docs/plans/STATUS.md` that M2 touches:
  - **M1 deferral:** `columnMap` values in mapping templates are now validated as `RoadmapField`.
  - **M1 nit:** a non-UUID id in a path returned a raw Pydantic message. It now returns the same plain 404 as a missing document, for `/api/imports/{id}`, `/api/roadmaps/{id}` and `/api/diagrams/{id}`. This fixes the old `/roadmaps/demo` bookmark.
  - **M0/M1 ASSUMPTION:** the nav links Roadmap and Swimlanes pointed at hard-coded demo UUIDs. They now open the most recently updated document, which the M1 comment in `demoDocuments.ts` planned for.

## Out of scope (deferred)
- `RM-15` Re-sync goes to **M3**. M2 keeps the mapping functions pure and template-driven so that re-sync can reuse them.
- Save JSON and Open JSON inside the roadmap editor (`RM-16` UI) go to **M3**. Home and Import already use `useImportRoadmapJson` for the `.json` upload.
- The PI cadence editor (`RM-4`) goes to **M3**. Imported roadmaps get a generated cadence (see ASSUMPTIONs) that the user can fix in M3.
- A saved-diagrams list page and the new-diagram dialog go to **M4**. In M2 the Home Swimlanes tile opens the latest diagram, or creates a blank one if there are none.
- Still open from M1, and not touched here: a partial `piCadence` PUT, raw Pydantic messages for settings fields, the asset sha256 race, and the preset→asset FK on SQLite.

## Contract changes (first)

### New schemas: `backend/app/schemas/imports.py` (task 1), camelCase via `ApiModel`
- `RoadmapField = Literal["key","title","type","epic","team","status","sprint","release","points","start","end","tags","ignore"]`. The UI labels are Key, Title, Type, Epic, Swimlane / Team, Status, Sprint, Release, Points, Start, End, Tags and Don't import (`IMP-4`).
- `ImportFormat = Literal["csv","json","xml"]` and `MatchConfidence = Literal["template","exact","alias","sniffed"]`.
- `ImportColumn`, one row of the Map table, with repeated columns already merged:
  - `id: str` is stable within a session: the normalised name, or the `fieldId` when there is one;
  - `name` is the original header (for example `Custom field (Story Points)`);
  - `label` is the header without its `Custom field (…)` wrapper (for example `Story Points`). The table shows this, as the prototype does;
  - `field_id: str | None`, `samples: list[str]` (up to 5 non-empty values), `fill: float`, `repeat_count: int` (at least 1);
  - `suggested_field: RoadmapField | None`, `confidence: MatchConfidence | None`;
  - `note: str | None`, for example "Used when Parent is empty" on Epic Link.
- `StatusSuggestion{jira_status, count, status_id}`.
- `RollupRules{roll_up_stories: bool = True, use_sprint_dates: bool = True, unscheduled_tray: bool = True, fix_versions_as_milestones: bool = False}` (`IMP-8`).
- `ImportSessionRead`:
  - `id: UUID`, `file_name`, `size: int`, `format`, `format_label`, `encoding: Literal["utf-8-sig","cp1252"]`, `row_count`;
  - `columns: list[ImportColumn]`, `ignored_columns: list[str]` (original names, for "+N other columns…");
  - `statuses: list[StatusSuggestion]`, `template_id: str | None`, `suggested_name: str`;
  - `created_at`.
- `CustomStatus{id, name (1–40), color: TeamColor}`.
- `ImportMapping`, the body of preview and commit:
  - `columns: dict[str, RoadmapField]` (column id → field; ids that are missing count as unmapped);
  - `status_map: dict[str, str]` (Jira status → status id), `custom_statuses: list[CustomStatus] = []`;
  - `rollup: RollupRules`, `name: str (1–200)`.
  - The validator rejects:
    - any field other than `epic` or `ignore` mapped twice: "Two columns are mapped to Start: “Start date” and “Target start”";
    - an unknown column id;
    - a status id that is neither a default nor a custom status.
- `ImportCommit(ImportMapping)` adds `update_template: bool = True`.
- `ImportPreview`:
  - `epics: int`, `issues: int`, `teams: int`, `milestones: int`;
  - `warnings: list[str]`, `first_epics: list[PreviewEpic{key, title, start: date | None, end: date | None}]` (up to 5), `more_epics: int`;
  - `unmapped_columns: list[str]`, `missing_required: list[Literal["key","title"]]`;
  - `file_name: str`, which is `file_name_for("roadmap", name)`;
  - `size_estimate_bytes: int`;
  - `document: RoadmapDocument`, the exact document that commit will save.
- `SampleExportInfo{file_name, row_count}`.

### Changed schemas
- `backend/app/schemas/mapping_templates.py`: in `MappingTemplateCreate`/`Update`, `column_map` becomes `dict[str, RoadmapField]`. This was deferred from M1. Existing dev rows with other values fail on read. **ASSUMPTION:** acceptable before release; `make seed` creates no templates.
- **The document schema does not change.** `schemaVersion` stays **1**, and there is no document migration. Points, Tags and the sprint list are mapped and remembered in the template, but the v1 document has no fields for them (`docs/data-model.md`), so they are not saved. **ASSUMPTION**, recorded in Risks.

### Model and Alembic (task 1)
- `backend/app/models/import_session.py` defines `ImportSession`:
  - `id` String(36) PK, `file_name` String(255), `format` String(8) with a check, `encoding` String(16), `size` Integer, `row_count` Integer;
  - `columns` JSON (the `ImportColumn` list plus the source indexes);
  - `rows` JSON: `list[list[list[str]]]`, meaning per row, per kept column, the values of its repeated cells in header order. Only relevant columns are kept; ignored ones are dropped;
  - `extras` JSON: `{sprintWindows: {name: [start, end]}, releaseDates: {name: date}}`, from exports that carry them (JSON/XML);
  - `template_id` String(36) nullable, `created_at` indexed (`default=clock.now`).
- `backend/alembic/versions/0003_import_sessions.py`, with a downgrade that drops the table.
- `IMPORT_SESSION_TTL = timedelta(hours=1)` (from the backend-engineer rules). Each upload purges expired sessions first, and a commit deletes its own session.

### Routes: `backend/app/api/routers/imports.py`
| Method & path | Response | Notes |
|---|---|---|
| `POST /api/imports/jira?templateId=` | 201 `ImportSessionRead` | Multipart `file`, at most 20 MB through `read_capped` (413). 422 on empty, unreadable or non-Jira files |
| `GET /api/imports/jira/sample` | `SampleExportInfo` | For the button label "Use the sample export (55 issues)" |
| `POST /api/imports/jira/sample?templateId=` | 201 `ImportSessionRead` | Parses the bundled sample (below) |
| `GET /api/imports/{id}` | `ImportSessionRead` | So a reload of the Map page works. 404 "That import has expired. Upload the file again." |
| `POST /api/imports/{id}/preview` | `ImportPreview` | Body `ImportMapping`. Pure: it writes nothing |
| `POST /api/imports/{id}/commit` | 201 `RoadmapRead` | Body `ImportCommit`. 422 "Map Key and Title before creating the roadmap" (`IMP-10`) |

- Declare `/jira/sample` before `/{id}`. Path ids are `str`, and the service treats an unparseable one as not found. Apply the same change to the `{id}` routes in `roadmaps.py` and `diagrams.py` (the M1 nit).
- **Bundled sample:** `backend/app/importers/jira/sample/payments-export.csv` is a byte-for-byte copy of `docs/fixtures/jira/payments-export.csv`. The Docker image has no `docs/`. A test asserts the two files are equal.
- `gen:api` runs in task 8. `frontend/src/api/types.ts` is regenerated and the diff is committed.

## Importer design (`backend/app/importers/jira/`, pure, no DB)
| Module | Public functions | Notes |
|---|---|---|
| `types.py` | `RawColumn{name, field_id}`, `ParsedExport{format, encoding, columns: list[RawColumn], rows: Iterator/list[list[list[str]]], extras}`, `ColumnGroup{id, name, label, field_id, source_indexes, samples, fill}` | Shared dataclasses, so tasks 2–5 can run in parallel |
| `detect.py` | `detect_format(file_name, head: bytes) -> ImportFormat`, `decode(data) -> tuple[str, encoding]` | Skill §1: `{` plus `issues` → json; `<rss` → xml; `.csv`/`.txt`, or a first line containing `Issue key`/`Summary` → csv. Otherwise "This file doesn't look like a Jira export. Upload a CSV, JSON or XML file exported from Jira." Empty input → "This file is empty". Undecodable input → "We couldn't read this file's text encoding. Save it as UTF-8 and try again." |
| `csv_reader.py` | `read_csv(text) -> ParsedExport` | `csv.reader` over `io.StringIO` line by line. `csv.Sniffer().sniff(sample, delimiters=",;")`, falling back to `,`. The BOM is stripped by utf-8-sig. Each header cell is its own `RawColumn`; repeats are grouped later |
| `json_reader.py` | `read_json(data) -> ParsedExport` | REST/JQL `issues[]`. Top-level `key` → column `Issue key`. Each `fields.*` → a column named by `names[id]` when `names` is present, otherwise by the id, with `field_id=id`. Values are flattened: `{name}`/`{value}`/`{key}`/`{displayName}` → that string, and a list → repeated cells. Sprint objects carrying `startDate`/`endDate` fill `extras.sprintWindows`, and `fixVersions[].releaseDate` fills `extras.releaseDates`. **ASSUMPTION:** `json.loads` on the whole payload (capped at 20 MB, no new dependency) |
| `xml_reader.py` | `read_xml(data) -> ParsedExport` | `defusedxml.ElementTree.iterparse` over `rss/channel/item`. Child tags become columns (`key`, `summary`, `type`, `status`, `parent`, `due`, `fixVersion`, `component`, `labels/label`). Each `customfields/customfield` becomes a column named `customfieldname` with `field_id=@id`. Repeated tags become repeated cells |
| `names.py` | `normalise_name(name) -> str` | Skill §2. Also holds `STANDARD_NAMES`, `ALIASES` (from `references/aliases.md`) and `NEVER_MAP` |
| `columns.py` | `merge_repeated_columns(parsed) -> list[ColumnGroup]` | Groups columns with the same normalised name, or the same `field_id`. `samples` and `fill` are computed over the merged cells. Sprint keeps the *last* non-empty cell; Labels, Components and Fix versions join into a list (`IMP-6`), and `value_for(group, row)` exposes this |
| `suggest.py` | `suggest_mapping(groups, template) -> list[ImportColumn]`, `classify(groups, suggestions) -> (columns, ignored)` | Skill §3 order, with each field used at most once. The exception is **Epic**: Parent and Epic Link both map to it, and Parent wins per row when both have values. `NEVER_MAP` columns are never sniffed (otherwise `Created` would be sniffed as Start). Team order: `team` → Atlassian Team → components → labels, with the last two `sniffed`. **Relevance rule (ASSUMPTION, see Risks):** a column is listed when it has a suggestion, or when its normalised name is in `STANDARD_NAMES` (which is why Components is listed as "Choose a field…"). Everything else goes into `ignored`. Template keys match on the column name *or* the `field_id` |
| `statuses.py` | `DEFAULT_STATUS_MAP`, `map_statuses(distinct, template_map) -> list[StatusSuggestion]` | Skill §5 table, compared case-insensitively. An unknown status maps to `not-started`. The template wins |
| `dates.py` | `parse_jira_date(value, dayfirst) -> date | None`, `detect_dayfirst(samples) -> bool` | `dateutil.parser` (already a dependency). Handles ISO, ISO datetimes and `16/Nov/26 12:00 AM`. Numeric `a/b/yy` is dayfirst when any sample has a first part greater than 12 |
| `build.py` | `build_roadmap(session_data, mapping, settings, now) -> BuildResult{document, epics, issues, teams, warnings, unmapped}` | Skill §6, detailed below |
| `warnings.py` | `collect_warnings(result, mapping, columns) -> list[str]` | Exact copy from the fixture (below) |

### `build_roadmap` rules
- **Rows** read through the mapping. Epic = the Parent value, else the Epic Link value. Type equals `Epic` case-insensitively. If Type isn't mapped, an epic is any key that some row's Epic points to. **ASSUMPTION.**
- **Roll-up on:**
  - items are the epics, in file order;
  - stories whose Epic is an epic's key roll up into it: `start = min`, `end = max` over the dated stories;
  - `issues.total/done/inProgress` count every story, using the mapped statuses: status id `done` counts as done, and `in-progress` and `at-risk` (Blocked) count as in progress, as the fixture requires (RSK-031 expects inProgress 4 = 3 In Progress + 1 Blocked);
  - `progress = round(100 * (done + 0.5 * inProgress) / total)` with Python `round` (half-to-even). This gives 62 for MX-070's 62.5, as the fixture expects. With no stories, progress is 0;
  - an epic with no dated stories falls back to its own Start/End;
  - stories without an epic become items of their own type;
  - `item.stories = [{key, title, statusId}]`.
- **Roll-up off:** every row is an item with its own dates, and `issues` is `{total: 0, done: 0, inProgress: 0}`.
- **Use sprint dates**, when an issue has no Start or End:
  1. the window of its latest sprint from `extras.sprintWindows`;
  2. otherwise a window learned from the same file: `[min start, max end]` of the dated issues whose latest sprint has that name.
  - **ASSUMPTION** (a product question): this replaces the skill's "cadence lookup by sprint name". The generated cadence has no sprint names, and Jira CSV carries sprint names only.
- **Without dates:** with the Unscheduled tray on, an item keeps no `start`/`end`, so it is unscheduled. With it off, the item is left out of the document. **ASSUMPTION.**
- **Lanes** come from Team values in order of first appearance: `id = slugify(name)`, `color = TEAM_COLOR_ORDER[i % 6]`, `position = (i+1)*1000`.
  - An item's team is its own row's team. Failing that, it's the most common team among its stories. Failing that, it goes to the `{id: "unassigned", name: "Unassigned"}` lane, added last and only when used.
- **Items:** `id = "it-" + slugify(key)`, `type` is the row's Type (or `"Epic"`), `statusId` from `status_map`, `position = (i+1)*1000`. When `settings.jiraBaseUrl` is set, `jiraUrl = jiraBaseUrl + "browse/" + key`.
- **Statuses:** `DEFAULT_STATUSES` plus `custom_statuses`. Each status's `jiraStatuses` lists the Jira statuses *in this file* that map to it.
- **Timeline:** `sprintLengthDays = 14`, and the cadence comes from `settings.piCadence`.
  - PI 1 starts on the Monday on or before the earliest item start; with no dates, the Monday of `clock.today()`.
  - The importer adds PIs until they cover the latest end (at least 1, at most 12).
  - Each PI gets `id "pi-N"` and name `"PI N"`. `timeline.start` is PI 1's start.
  - **ASSUMPTION**: the spec has no PI anchor. RM-4 edits it in M3.
- **Milestones**, when Fix versions as milestones is on: one `{id: "ms-"+slug, name, kind: "milestone", date}` per distinct release. The date is `extras.releaseDates[name]`, else the latest item `end` in that release. A release with neither is skipped. **ASSUMPTION.**
- **Source:** `{type: "jira-" + format, file: file_name, importedAt: now, mappingTemplateId}`. The document `id` is the import session id, so the preview and the commit show the same id.
- **Warnings**, copy exactly as in the fixture, with straight quotes, singular and plural forms, and in this order:
  1. "N epics have no dates → Unscheduled" (or "1 epic has…"; with the tray off: "… → not imported"; with roll-up off the noun is "issue");
  2. "N issues have no dates → excluded from its epic's range" (stories under an epic, without dates);
  3. "N issues have no team → Unassigned lane" (every row without a team, whatever its type; this matches the fixture's `storiesWithoutTeam`);
  4. "\"<label>\" isn't mapped yet", one per listed column with no field;
  5. `IMP-10`: "Neither Start/End nor Sprint is mapped, so every item will go to Unscheduled" when start, end and sprint are all unmapped. **ASSUMPTION** about the copy.

## Parallelism map
| Task | Owner | Writes only under | Can run in parallel with |
|---|---|---|---|
| 1 | backend-engineer | `backend/app/schemas/imports.py`, `backend/app/schemas/mapping_templates.py`, `backend/app/models/{import_session,__init__}.py`, `backend/alembic/versions/0003_import_sessions.py`, `backend/app/importers/{__init__,jira/__init__,jira/types,jira/names}.py`, `backend/tests/db/test_migrations.py`, `backend/tests/api/test_mapping_templates_api.py` | 7 |
| 2 | backend-engineer | `backend/app/importers/jira/{detect,csv_reader,dates}.py`, `backend/tests/importers/test_detect.py`, `test_csv_reader.py`, `test_dates.py` | 3, 4, 5, 7 (after 1) |
| 3 | backend-engineer | `backend/app/importers/jira/{json_reader,xml_reader}.py`, `backend/tests/importers/test_json_reader.py`, `test_xml_reader.py`, `backend/tests/importers/builders.py` | 2, 4, 5, 7 (after 1) |
| 4 | backend-engineer | `backend/app/importers/jira/{columns,suggest,statuses}.py`, `backend/tests/importers/test_columns.py`, `test_suggest.py`, `test_statuses.py` | 2, 3, 5, 7 (after 1) |
| 5 | backend-engineer | `backend/app/importers/jira/{build,warnings}.py`, `backend/tests/importers/test_build.py`, `test_warnings.py` | 2, 3, 4, 7 (after 1) |
| 6 | backend-engineer | `backend/app/{repositories,services}/imports.py`, `backend/app/api/routers/imports.py`, `backend/app/api/routers/{roadmaps,diagrams}.py` (path id type only), `backend/app/services/documents.py` (`parse_document_id` only), `backend/app/main.py` (one line), `backend/app/importers/jira/sample/`, `backend/tests/api/test_imports_api.py`, `backend/tests/importers/test_payments_fixture.py` | 7 (after 2–5) |
| 7 | frontend-engineer | `frontend/src/features/home/`, `frontend/src/components/RecentDocumentList.tsx` (+ test), `frontend/src/app/{MainNav,demoDocuments}.tsx/.ts`, `frontend/src/app/AppShell.test.tsx` | 1–6 |
| 8 | frontend-engineer | `frontend/src/api/types.ts` (generated), `frontend/src/api/{useImports,useMappingTemplates}.ts` (+ tests), `frontend/src/api/client.ts` (`documentDownloadUrl` only) | none (needs 6) |
| 9 | frontend-engineer | `frontend/src/features/import/{ImportPage.tsx,components/{ImportStepper,UploadDropZone,SavedRoadmapsPanel,MappingTemplateSelect,JiraExportHelp}.tsx}` + tests, `frontend/src/app/router.tsx`, `.claude/skills/prototype-parity/scripts/capture.mjs` | 10 (after 8) |
| 10 | frontend-engineer | `frontend/src/lib/importMapping/`, `frontend/src/features/import/{state.ts,MapFieldsPage.tsx,components/{ColumnMappingTable,StatusMappingGrid,NewStatusDialog,RollupRules}.tsx}` + tests | 9 (after 8) |
| 11 | frontend-engineer | `frontend/src/features/import/components/{ImportPreviewPanel,DocumentJsonPreview,ImportActionBar,CreateRoadmapDialog}.tsx` + tests, `frontend/src/features/import/MapFieldsPage.tsx` (composition) | none (after 9, 10) |
| 12 | test-engineer | `backend/tests/importers/test_edge_cases.py`, `backend/tests/api/test_imports_nf3.py` | 9–11 (after 6) |
| 13 | test-engineer | `frontend/e2e/import.spec.ts`, `frontend/e2e/home.spec.ts`, `docs/design/deviations.md` | none (after all) |

- **Two lanes from the start:** the backend (1 → {2 ‖ 3 ‖ 4 ‖ 5} → 6) and the Home frontend (7), which uses only M1 hooks.
- **Tasks 2–5** write disjoint modules. They agree through `types.py` and `names.py` from task 1, so they can run at the same time. Task 5's unit tests use hand-built `ColumnGroup`s and rows, not the readers; the end-to-end fixture test is in task 6.
- **Task 8** waits for task 6, so `gen:api` runs once. Tasks 9 and 10 can then run together. Router edits: task 9 owns `router.tsx` and adds both routes. Task 10 creates `MapFieldsPage.tsx`, which task 11 extends.
- **Task 12** (backend edge cases) runs alongside the frontend lane.

## Ordered tasks

### 1. Contracts, model, migration, names (backend-engineer). About 350 lines.
- **Files:** as in the map.
  - `schemas/imports.py` follows the contract above.
  - `importers/jira/types.py` holds the dataclasses.
  - `importers/jira/names.py` holds `normalise_name`, `STANDARD_NAMES`, `ALIASES: dict[RoadmapField, tuple[str, ...]]` and `NEVER_MAP`, copied from `.claude/skills/jira-field-mapping/references/aliases.md`. Add a comment pointing at that file.
  - Add the `ImportSession` model and migration 0003.
  - In the template schemas, `column_map` becomes `dict[str, RoadmapField]`.
- **Satisfies:** the contract for `IMP-1`, `IMP-4`, `IMP-5` and `IMP-9`; the M1 `columnMap` deferral.
- **Tests:**
  - `tests/importers/test_names.py`: `test_IMP_5_normalise_strips_custom_field_wrapper` (`Custom field (Start date)` → `start date`), `test_IMP_5_normalise_strips_trailing_brackets_and_collapses_space`;
  - `tests/db/test_migrations.py`: `test_upgrade_head_creates_import_sessions`, `test_downgrade_to_0002_drops_import_sessions`, and `test_models_match_migrations` still passes;
  - `tests/api/test_mapping_templates_api.py`: `test_IMP_9_column_map_rejects_unknown_field` (422 with a plain `detail`).
- **Proof:** `pytest -q tests/importers tests/db tests/api/test_mapping_templates_api.py`, `alembic check`, `mypy --strict app`.

### 2. Detect, decode, CSV, dates (backend-engineer, after 1). About 300 lines.
- **Files:** `detect.py`, `csv_reader.py` and `dates.py`, as in Importer design.
- **Satisfies:** `IMP-1` (CSV), `NF-3`.
- **Tests:**
  - `test_IMP_1_detects_csv_json_xml` (parametrised);
  - `test_IMP_1_non_jira_file_rejected_in_plain_language`;
  - `test_IMP_1_empty_file_rejected`;
  - `test_NF_3_utf8_bom_decoded_as_utf8_sig`;
  - `test_NF_3_cp1252_fallback_reported` (`"Café"` encoded as cp1252);
  - `test_IMP_1_semicolon_delimiter_sniffed`;
  - `test_IMP_1_payments_fixture_has_55_rows_and_21_columns`;
  - `test_IMP_6_repeated_headers_kept_as_separate_raw_columns`;
  - `test_jira_date_16_Nov_26_parses_to_iso`;
  - `test_numeric_dates_dayfirst_detected_from_samples`;
  - `test_iso_datetime_keeps_date`.
- **Proof:** `pytest -q tests/importers`, `mypy --strict app`.

### 3. JSON and XML readers (backend-engineer, after 1; parallel with 2, 4, 5). About 350 lines.
- **Files:** `json_reader.py`, `xml_reader.py`, and `tests/importers/builders.py`.
  - The builders are test helpers: `build_rest_json(rows, with_names: bool) -> bytes` and `build_rss_xml(rows) -> bytes`. Both generate the payments export from the CSV fixture's rows. Sprints become objects with dates, Story Points becomes `customfield_10016` and Team becomes `customfield_10001`.
- **Satisfies:** `IMP-1` (JSON including the `names` expansion, and XML).
- **Tests:**
  - `test_IMP_1_json_names_expansion_maps_customfield_10016_to_story_points`;
  - `test_IMP_1_json_without_names_uses_field_id`;
  - `test_IMP_1_json_sprint_objects_fill_sprint_windows`;
  - `test_IMP_1_json_without_issues_rejected`;
  - `test_IMP_1_xml_customfield_named_by_customfieldname_with_id`;
  - `test_IMP_6_xml_repeated_component_tags_become_repeated_cells`;
  - `test_NF_3_xml_entity_expansion_rejected` (billion laughs → 422 "This XML file uses features we can't accept").
- **Proof:** `pytest -q tests/importers`, `mypy --strict app`.

### 4. Merge, suggest, statuses (backend-engineer, after 1; parallel with 2, 3, 5). About 380 lines.
- **Files:** `columns.py`, `suggest.py` and `statuses.py`.
- **Satisfies:** `IMP-4`, `IMP-5`, `IMP-6`, `IMP-7`, `IMP-9` (template first, matched by name or field id).
- **Tests.** Groups are built inline from `RawColumn` lists and sample rows:
  - `test_IMP_6_sprint_keeps_latest_non_empty`;
  - `test_IMP_6_labels_and_components_join_into_list`;
  - `test_IMP_5_exact_names_match_with_exact_confidence`;
  - `test_IMP_5_custom_field_story_points_matches_points_by_alias`;
  - `test_IMP_5_issue_id_not_key_when_issue_key_present`;
  - `test_IMP_5_status_category_not_status`;
  - `test_IMP_5_sniffs_key_pattern_then_epic`;
  - `test_IMP_5_sniffs_dates_earlier_median_is_start`;
  - `test_IMP_5_sniffs_sprint_and_points`;
  - `test_IMP_5_never_sniffs_created`;
  - `test_IMP_5_fill_below_0_3_not_sniffed`;
  - `test_IMP_5_each_field_used_once_except_epic`;
  - `test_IMP_5_epic_link_and_parent_both_map_to_epic`;
  - `test_IMP_5_team_falls_back_to_components_as_sniffed` (no team column);
  - `test_IMP_4_components_listed_unmapped_when_team_taken`;
  - `test_IMP_4_priority_assignee_created_description_ignored`;
  - `test_IMP_9_template_entry_by_column_name_wins`;
  - `test_IMP_9_template_entry_by_field_id_wins`;
  - `test_IMP_7_default_status_table` (parametrised over the skill table);
  - `test_IMP_7_unknown_status_defaults_to_not_started`;
  - `test_IMP_7_template_status_map_wins`.
- **Proof:** `pytest -q tests/importers`, `mypy --strict app`.

### 5. Build items and warnings (backend-engineer, after 1; parallel with 2, 3, 4). About 400 lines. If it grows, split 5b off for timeline and milestones.
- **Files:** `build.py` and `warnings.py`, following the `build_roadmap` rules above.
- **Satisfies:** `IMP-8`, `IMP-11` (counts, warnings, the document), `IMP-10` (the warning).
- **Tests.** Small hand-built inputs; `now` is fixed at `2026-11-06T17:10:00+05:30`:
  - `test_IMP_8_rollup_span_and_counts`;
  - `test_IMP_8_progress_rounds_half_to_even` (2 done + 1 in progress of 4 gives 62);
  - `test_IMP_8_story_without_dates_excluded_from_range`;
  - `test_IMP_8_epic_without_dated_stories_uses_own_dates`;
  - `test_IMP_8_sprint_dates_from_export_windows`;
  - `test_IMP_8_sprint_dates_learned_from_same_file`;
  - `test_IMP_8_tray_off_drops_undated_items`;
  - `test_IMP_8_rollup_off_every_row_is_an_item`;
  - `test_IMP_8_fix_versions_become_milestones_when_on`;
  - `test_IMP_8_unassigned_lane_only_when_used`;
  - `test_IMP_7_jira_statuses_recorded_on_document_statuses`;
  - `test_IMP_7_custom_status_added`;
  - `test_timeline_covers_latest_end_from_cadence`;
  - `test_IMP_11_document_validates_as_roadmap_v1`;
  - `test_IMP_11_warning_copy_singular_and_plural`;
  - `test_IMP_10_warns_when_no_dates_or_sprint_mapped`;
  - `test_jira_url_from_settings_base_url`.
- **Proof:** `pytest -q tests/importers`, `mypy --strict app`.

### 6. Session service, routes, sample, templates, fixture gate (backend-engineer, after 2–5). About 400 lines.
- **`repositories/imports.py`:** `add`, `get`, `delete`, `purge_older_than(session, cutoff)`.
- **`services/imports.py`:**
  - `create_session(session, file_name, data, template_id)` runs detect → read → merge → suggest/classify → statuses, then stores the session;
  - `create_sample_session`, `sample_info`, `get_session`;
  - `preview(session, id, mapping) -> ImportPreview`;
  - `commit(session, id, request) -> RoadmapRead`:
    - it requires Key and Title;
    - it runs `build_roadmap` and then `documents.create_document`;
    - it updates the template, then deletes the session, all in one transaction;
  - `parse_session_id(raw: str) -> UUID`, where an invalid id gives `NotFoundError` "That import has expired. Upload the file again.".
- **Template update (`IMP-9`):** when `update_template` is on:
  - **if the session had a template,** only the entries the user changed are written. A changed entry is one whose field differs from the suggestion, or a status map entry that differs. The key is `field_id`, or the column name when there's no id;
  - **otherwise** a new template is created, named `"<roadmap name> mapping"`, with `jira_site` set to the `settings.jiraBaseUrl` host;
  - the document's `source.mappingTemplateId` is set to the template's id.
  - **ASSUMPTION** about the naming and site.
- **`services/documents.py`:** add `parse_document_id(raw, kind) -> UUID`, which raises the existing `_not_found(kind)`. In `routers/roadmaps.py` and `diagrams.py`, path `id: str` goes through it. This is the M1 nit.
- **Router** `routers/imports.py`, registered in `main.py`.
- **Satisfies:** `IMP-1`, `IMP-9`, `IMP-10`, `IMP-11`, `IMP-12` (commit), `NF-3`.
- **Tests** in `tests/importers/test_payments_fixture.py`, the **acceptance gate**. Load the expected JSON from `REPO_ROOT/docs/fixtures/jira/payments-export.expected.json`, then:
  - `test_IMP_payments_csv_epics_match_expected` (key, title, lane name, start, end, issues, progress, in order);
  - `test_IMP_payments_csv_unscheduled_match_expected`;
  - `test_IMP_payments_csv_stories_without_dates_and_team`;
  - `test_IMP_payments_csv_mapping_matches_expected`: `expectedMapping` labels normalised to `RoadmapField` with a small table in the test (`"Swimlane / Team"` → `team`; anything starting with `Epic` → `epic`; …), plus `notMapped` == `ignored_columns` and `needsChoice` == the unmapped listed columns;
  - `test_IMP_payments_csv_status_mapping_matches_expected`;
  - `test_IMP_payments_csv_warnings_exact`;
  - `test_IMP_payments_csv_file_format_encoding_rowcount`;
  - `test_IMP_payments_json_and_xml_give_the_same_epics` (through `builders.py`);
  - `test_bundled_sample_equals_fixture` (bytes).
- **Tests** in `tests/api/test_imports_api.py`:
  - `test_IMP_1_upload_returns_session_with_format_and_row_count`;
  - `test_IMP_1_sample_info_reports_55_issues`;
  - `test_IMP_11_preview_is_pure_and_returns_document`;
  - `test_IMP_12_commit_creates_roadmap_and_deletes_session`;
  - `test_IMP_10_commit_without_title_422`;
  - `test_IMP_9_commit_creates_template_then_next_upload_applies_it` (Components → ignore is remembered: the second upload has 0 unmapped);
  - `test_IMP_9_update_writes_only_changed_entries`;
  - `test_IMP_5_duplicate_field_422_names_both_columns`;
  - `test_expired_session_404`;
  - `test_non_uuid_session_id_404_plain`;
  - `test_non_uuid_roadmap_id_404_plain` (the M1 nit).
- **Proof:** `pytest -q`, `make lint`, `alembic check`, then `curl -F file=@docs/fixtures/jira/payments-export.csv localhost:8000/api/imports/jira`.

### 7. Home page and nav (frontend-engineer, parallel with 1–6). About 380 lines.
- **`components/RecentDocumentList.tsx`:** props only, `{title, items: {id, name, fileName, updatedAt}[], onOpen, onDelete?, emptyState: ReactNode, loading, error, onRetry}`. Each row shows a file icon, then the name, the file name in mono caption, and "Updated 2 Nov 2026". It has an `Open` text button and, when `onDelete` is set, an `IconButton aria-label="Delete <name>"`. Home's side panel and Import's side panel both reuse it.
- **`features/home/HomePage.tsx`** and `features/home/components/{HomeTiles,DeleteDocumentDialog}.tsx`:
  - **Tiles**, with the copy from prototype line 446–448:
    - Import from Jira goes to `/import`;
    - Open a saved roadmap opens a `.json` file picker, then `useImportRoadmapJson`, then navigates to `/roadmaps/:id`. Errors show `snackbar.error(detail)`;
    - Swimlane diagrams opens the most recent diagram, or `useCreateDiagram({})` and opens the new one when there are none.
  - **Lists:** "Recent roadmaps" uses `useRoadmaps()` and "Swimlane diagrams" uses `useDiagrams()`, showing the first 5 of each (**ASSUMPTION**). Empty states:
    - "No roadmaps yet. Import a Jira export to make one." with an "Import from Jira" button;
    - "No diagrams yet." with "New diagram".
  - **Delete:** `DeleteDocumentDialog` fetches `use…DeleteImpact(id, open)`, shows `impact.message`, and confirms with "Delete". This is the confirmation that names what cascades. On success, `notify('Deleted <name>')`.
- **`app/MainNav.tsx`:** Roadmap goes to the first of `useRoadmaps()`, falling back to `/import`. Swimlanes goes to the first of `useDiagrams()`, falling back to `/`. Delete `app/demoDocuments.ts` and replace its ASSUMPTION comment. The parity script keeps its UUID routes, which `make seed` provides.
- **Satisfies:** `HOME-1`, `HOME-2`, `G-5`, NF-2 (labels).
- **Tests:**
  - `HomePage.test.tsx`: `it('HOME-1 shows the three tiles')`, `it('HOME-1 open a saved roadmap uploads the json and opens it')`, `it('HOME-2 lists recent roadmaps with name, file name and updated date')`, `it('HOME-2 shows the empty state with Import from Jira')`, `it('HOME-2 shows an error with Retry')`, `it('deletes a roadmap after confirming the unlink message')`;
  - `AppShell.test.tsx`: `it('G-1 Roadmap links to the most recently updated roadmap')`, `it('G-1 Roadmap falls back to Import when there are none')`.
- **Proof:** `pnpm -C frontend lint && pnpm -C frontend typecheck && pnpm -C frontend test`, and a parity capture of `home` at both widths.

### 8. `gen:api` and import hooks (frontend-engineer, after 6). About 250 lines plus the generated diff.
- **Generate:** run `pnpm -C frontend gen:api` and commit `types.ts`.
- **`api/useMappingTemplates.ts`:** `templateKeys = ['templates']` and `useMappingTemplates()`.
- **`api/useImports.ts`:**
  - `importKeys.session(id)`, `importKeys.preview(id, mapping)`, `importKeys.sample`;
  - `useSampleExportInfo()`;
  - `useUploadJiraExport()` (`apiUpload('/imports/jira?templateId=…')`) and `useStartSampleImport()`. Both seed `importKeys.session`;
  - `useImportSession(id)`;
  - `useImportPreview(id, mapping)`: a `useQuery` whose `queryFn` POSTs `/preview`, with `placeholderData: keepPreviousData`. The caller passes a mapping debounced by 300 ms (**ASSUMPTION**);
  - `useCommitImport(id)`: on success it seeds `roadmapKeys.detail`, invalidates `roadmapKeys.list` and `templateKeys`, and removes the session.
- **`client.ts`:** `documentDownloadUrl(kind, id): string` returns the `/api/...` path. Downloads go through an `<a download>` to the backend file, so no client-side file generation and no new `fetch`.
- **Tests:** `useImports.test.tsx`: `it('IMP-1 upload seeds the session cache')`, `it('IMP-11 preview keeps the previous data while refetching')`, `it('IMP-12 commit seeds the roadmap and invalidates lists')`.
- **Proof:** typecheck, lint and test. Running `gen:api` again gives no diff.

### 9. Upload step (frontend-engineer, after 8; parallel with 10). About 350 lines.
- **Routes** in `router.tsx`: `import` → `ImportPage`, and `import/:sessionId` → `MapFieldsPage`.
- **`ImportPage.tsx`:**
  - `PageHeading` "Import from Jira" with the lede from the prototype, and `ImportStepper active={0}`;
  - `UploadDropZone`: a real `<input type="file" accept=".csv,.json,.xml,.txt">` inside a labelled button-like drop area. It handles drag-over styling, the "Drop your Jira export here" copy and "or click to choose a file · CSV, JSON or XML". While uploading it shows the file name and size. A 413 or 422 shows `Alert` with `detail` and a "Choose another file" action;
  - the "or" divider and the "Use the sample export (55 issues)" button, whose count comes from `useSampleExportInfo`;
  - `JiraExportHelp`, a `<details>`-style MUI Accordion "How do I export from Jira?" with three steps. Step 3 drops the prototype's "Nothing is uploaded… in this prototype" and reads "Drop the file here." (`IMP-3`);
  - on success it navigates to `/import/:id`. `?sample=1` starts the sample import on mount, through a mutation and never `useEffect` fetching.
- **Side panel:**
  - `SavedRoadmapsPanel`: "Or open a saved roadmap", built on `RecentDocumentList`, plus a dashed "Load .json from computer…" button that runs `useImportRoadmapJson` and navigates on success (`IMP-2`);
  - `MappingTemplateSelect`: "Mapping template", with the saved templates plus "None — map manually". It defaults to the most recently updated template (**ASSUMPTION**), with the helper "Saved templates re-apply your field mapping next time.". The selected id goes into the upload query (`IMP-9`).
- **Detected format and row count (`IMP-1`)** appear in the Map page lede: `<file name> · 55 issues · Jira CSV` (prototype line 492).
- **`capture.mjs`:** `map: '/import?sample=1'`.
- **Satisfies:** `IMP-1`, `IMP-2`, `IMP-3`, `IMP-9` (select).
- **Tests:**
  - `ImportPage.test.tsx`: `it('IMP-1 uploads a dropped CSV and opens Map fields')`, `it('IMP-1 shows the server reason when a file is rejected')`, `it('IMP-1 sample button shows the issue count and starts the sample import')`, `it('IMP-2 opening a saved roadmap bypasses mapping')`, `it('IMP-3 export help discloses three steps')`, `it('IMP-9 sends the selected template id')`;
  - `ImportStepper.test.tsx`: `it('marks the current step with aria-current="step"')`.
- **Proof:** typecheck, lint and test.

### 10. Map table, status mapping, roll-up rules (frontend-engineer, after 8; parallel with 9). About 400 lines.
- **`lib/importMapping/`** (pure, no React):
  - `fieldLabels.ts` (`ROADMAP_FIELD_LABELS`);
  - `assignField(columns, columnId, field)`: a field already used elsewhere moves here and the other column becomes unmapped, except `epic` and `ignore`;
  - `mappingStats(columns) -> {mapped, total}` for "Auto-mapped N of M". A column counts as mapped when it has any field, including Don't import, as in the prototype;
  - `missingRequired(columns)`;
  - `initialMapping(session) -> ImportMapping`.
- **`features/import/state.ts`:** a Zustand store keyed by session id holding the draft `ImportMapping`, `updateTemplate` and `createOpen`. This is editor-local state; the document is never stored here.
- **`MapFieldsPage.tsx`:**
  - `useImportSession(id)`, with a Skeleton while loading. A 404 shows the empty state "That import has expired." with an "Upload again" button. Other errors show `Alert` with Retry;
  - heading "Map Jira fields", and `ImportStepper active={1}`.
- **`ColumnMappingTable`:**
  - title "Map Jira columns to roadmap fields", and the badge "Auto-mapped N of M", warning-coloured until N = M;
  - columns: Jira column (`label`), Sample value (mono), Roadmap field (`Select`, `aria-label="Roadmap field for <label>"`);
  - **styling by confidence:**
    - `sniffed` rows get a highlighted background token and a "Check this" caption;
    - unmapped rows show an orange outlined "Choose a field…" select (`warning` palette);
    - `note` appears as a caption;
  - the footer row reads "+ N other columns aren't needed and will be ignored" (prototype copy; `IMP-4`).
- **`StatusMappingGrid`:** per status, `<jira status> → dot → Select` (`aria-label="Roadmap status for <status>"`). The dot colour comes from the theme status tokens, or the team token for custom statuses. The select's last option is "New status…", which opens `NewStatusDialog` (name and colour from the team tokens, focus-trapped) (`IMP-7`).
- **`RollupRules`:** four labelled checkboxes with the prototype copy and the defaults on, on, on, off (`IMP-8`).
- **Satisfies:** `IMP-4` to `IMP-8`.
- **Tests:**
  - `lib/importMapping/*.test.ts`: `it('IMP-5 counts Auto-mapped N of M')`, `it('IMP-5 assigning a used field frees the other column')`, `it('IMP-5 Epic can be used twice')`, `it('IMP-10 reports missing Key and Title')`;
  - `ColumnMappingTable.test.tsx`: `it('IMP-5 highlights sniffed rows')`, `it('IMP-5 unmapped rows show Choose a field…')`, `it('IMP-4 shows the ignored column count')`;
  - `StatusMappingGrid.test.tsx`: `it('IMP-7 remaps a status')`, `it('IMP-7 adds a custom status')`;
  - `RollupRules.test.tsx`: `it('IMP-8 defaults match the spec')`.
- **Proof:** typecheck, lint and test.

### 11. Preview, action bar, create dialog (frontend-engineer, after 9 and 10). About 380 lines.
- **`ImportPreviewPanel`:**
  - "Preview", with Epics, Issues and Teams stat cards;
  - a warnings box listing `preview.warnings`;
  - the first five epics as `KEY title  16 Nov → 29 Jan`, plus "+ N more epics";
  - loading: a skeleton on the first load, after which the previous data is shown with a subtle progress bar. An error gives `Alert` with Retry (`IMP-11`).
- **`DocumentJsonPreview`:**
  - "What gets saved", with the caption "roadmap JSON · schema v1";
  - a `pre` showing `preview.document`, pretty-printed and abbreviated by `lib/importMapping/abbreviateJson.ts` (`"items": [ … 15 epics ]`, `"pis": [ … 3 PIs ]`, as in the prototype). It updates live from the debounced preview.
- **`ImportActionBar`:**
  - "Roadmap name" (`TextField`, starts at `session.suggestedName`);
  - "Save as": read-only mono `TextField` showing `preview.fileName`, with the helper "Follows the roadmap name" (**ASSUMPTION**, see Risks);
  - a checkbox: "Update mapping template" when the session has a template, otherwise "Save as mapping template";
  - "Back", which goes to `/import`;
  - "Create roadmap & save JSON", disabled while `missingRequired` is non-empty, with the helper "Map Key and Title to continue" (`IMP-10`).
  - The stepper shows step 3 "Preview & save" as current while the dialog is open (**ASSUMPTION**: the prototype shows Map and Preview on one page).
- **`CreateRoadmapDialog`** (focus-trapped, prototype line 1174–1179):
  - "This creates **<name>** from N Jira issues and saves it as:", then the file name, "E epics · L lanes · M milestones · about K KB" (from `sizeEstimateBytes`), and, when unmapped columns remain, "N column(s) is/are still unmapped and will be ignored.";
  - buttons Cancel and "Create & save";
  - on confirm: `useCommitImport`. On success it triggers the download of `documentDownloadUrl('roadmap', id)`, navigates to `/roadmaps/:id`, and calls `notify('Saved <fileName>')`. On failure the dialog stays open with an error `Alert` showing `detail`.
- **Layout:** at 390px the side panel stacks below the table, the table scrolls inside its own box, and the action bar wraps (`G-5`).
- **Satisfies:** `IMP-10`, `IMP-11`, `IMP-12`.
- **Tests:**
  - `ImportPreviewPanel.test.tsx`: `it('IMP-11 shows counts, warnings and the first five epics')`;
  - `DocumentJsonPreview.test.tsx`: `it('IMP-11 abbreviates items and PIs')`;
  - `ImportActionBar.test.tsx`: `it('IMP-10 disables create until Key and Title are mapped')`;
  - `CreateRoadmapDialog.test.tsx`: `it('IMP-12 confirms file name, size estimate and unmapped count')`, `it('IMP-12 creates, downloads and opens the roadmap')`, `it('IMP-12 keeps the dialog open and shows the reason on failure')`.
- **Proof:** typecheck, lint and test, then parity captures of `import` and `map` at both widths.

### 12. Backend edge cases (test-engineer, after 6; parallel with 9–11)
- **`tests/importers/test_edge_cases.py`**, generated in `tmp_path`. These come from `.claude/agents/test-engineer.md`:
  - `test_NF_3_bom_csv`;
  - `test_IMP_1_semicolon_csv`;
  - `test_IMP_6_three_duplicate_sprint_columns_keep_latest`;
  - `test_IMP_5_custom_field_story_points`;
  - `test_IMP_5_epic_link_vs_parent_prefers_parent`;
  - `test_IMP_1_empty_file_422`;
  - `test_IMP_1_header_only_csv_rejected_as_empty_export` and `test_IMP_1_header_only_csv_422_empty_export` (changed during the build: a header-only CSV is rejected with 422 "This export has no issues in it", the same as an empty JSON/XML export, instead of giving zero rows);
  - `test_IMP_5_200_column_export_streams` (asserts the result, not the memory use).
- **`tests/api/test_imports_nf3.py`:** `test_NF_3_upload_over_20mb_413`, `test_NF_3_xml_external_entity_rejected`, `test_NF_3_binary_file_rejected_plainly`.
- **Report:** failures go back to backend-engineer with a one-line diagnosis.

### 13. E2E, parity and deviations (test-engineer, after all)
- **`frontend/e2e/import.spec.ts`**, using `getByRole`/`getByLabel` only:
  - `test('IMP import sample → fix Components → create')`:
    - Home → Import from Jira → "Use the sample export (55 issues)";
    - expect "Auto-mapped 13 of 14" and the warning `"Components" isn't mapped yet`;
    - select **Don't import** for "Roadmap field for Components", then expect "Auto-mapped 14 of 14" and no Components warning;
    - Create roadmap & save JSON → the dialog shows `payments-export.json` → Create & save;
    - expect a download event with that file name, the URL `/roadmaps/<uuid>`, and the snackbar "Saved payments-export.json".
  - `test('IMP-10 create is disabled when Title is set to Don\'t import')`.
  - `test('IMP-1 uploading the fixture CSV shows 55 issues · Jira CSV')`, using `setInputFiles` with `docs/fixtures/jira/payments-export.csv`.
  - Mobile at 390×844: `test('G-5 map page stacks the preview below the table with no page-level horizontal scroll')`.
  - `afterEach` deletes the created roadmaps and templates through `request`.
- **`frontend/e2e/home.spec.ts`:** `test('HOME-2 lists the seeded demo roadmap and opens it')`, `test('HOME-1 open a saved roadmap with docs/examples/roadmap.v0.json migrates and opens')`.
- **Parity:** run `node .claude/skills/prototype-parity/scripts/capture.mjs home`, then `import`, then `map`. Append the differences to `docs/design/deviations.md`:
  - Save as is read-only;
  - the sample count is 55, not 148;
  - the stepper shows step 3 during the dialog;
  - the "Check this" caption on sniffed rows;
  - Delete buttons on the Home lists;
  - straight quotes in warnings.
- **Report:** pass/fail counts per suite.

## Decisions confirmed by the user (2026-11-08)

- **Save as** is read-only: it follows the roadmap name, with no stored file name and no model change.
- **Use sprint dates** for CSV: dates come from the sprint dates in JSON/XML exports, or else are inferred from dated issues in the same sprint. Items with neither stay unscheduled, with a warning.
- **IMP-7 custom statuses:** a "New status…" option that asks for a name and a team colour, as planned.

## Risks and assumptions
- **ASSUMPTION (relevance rule):** the skill's §3.5 ("fill ≥ 0.5, short values → Choose a field…") would list Priority and Issue id, but the fixture puts them in `notMapped`. It would also hide Components (fill 0.27), but the fixture puts it in `needsChoice`. The fixture wins: a column is listed only if it has a suggestion or a standard Jira name. Ignored columns can't be expanded in v1, as in the prototype.
- **ASSUMPTION (team warning):** the fixture counts MX-771, a story whose epic has a team, as "1 issue has no team → Unassigned lane". So the warning counts every row without a team, while the Unassigned lane is only created when an *item* has none. With the fixture, the warning appears but no Unassigned lane is created. The copy is slightly misleading, but the fixture is protected.
- **ASSUMPTION (progress rounding):** Python `round` (half-to-even) gives 62 for 62.5, which the fixture needs. JavaScript's `Math.round` would give 63. M3 must not recompute progress in TypeScript with `Math.round`; it should use the saved value or a half-even helper.
- **ASSUMPTION (sprint dates):** sprint windows come from the export when it has them (JSON/XML), otherwise from dated issues in the same sprint. There is no name-based cadence lookup.
- **ASSUMPTION (timeline):** PI 1 starts on the Monday on or before the earliest start, the PIs are named "PI N", and the cadence comes from Settings.
- **ASSUMPTION (Save as):** the document stores no file name, and M1 derives it from the name, so the Save-as field is read-only and follows the name.
- **ASSUMPTION (unsaved fields):** Points, Tags and the per-item sprint list are not saved, because the v1 document has no fields for them. Adding them later as optional fields needs no `schemaVersion` bump.
- **ASSUMPTION:** sessions live in SQLite for 1 hour and are deleted on commit; the document id equals the session id; the sample button reflects the real 55 rows; the default template is the most recently updated one; a new template is named "<name> mapping"; dateless items are dropped when the tray is off; Fix-version milestone dates fall back to the latest end; Home lists show 5 rows each; the Swimlanes tile creates a blank diagram when none exist.
- **ASSUMPTION (stepper):** the prototype shows Preview beside Map on one page, and this plan keeps that. Step 3 becomes current while the confirmation dialog is open. The spec's three-step flow is honoured visually without a separate page.
- **Risk: concurrent edits to `backend/app/main.py`** (task 6 only) and `router.tsx` (task 9 only). Each has a single owner.
- **Risk: preview load.** Each mapping change POSTs a preview, debounced at 300 ms. For a 20 MB export the build runs over stored rows (no re-parse), which should take well under a second. If it doesn't, cache the merged groups per session.
- **Risk: the template `columnMap` type change** breaks dev rows saved with free-form values. A local DB may need its templates deleted.
- **Spec vs prototype:** the prototype's warnings use curly quotes and "→ Unscheduled tray". The expected fixture (which the spec defers to) uses straight quotes and "→ Unscheduled", and we follow the fixture. The prototype says "148 issues"; the real sample has 55.

## Done when
- [ ] Importing `docs/fixtures/jira/payments-export.csv` produces exactly `payments-export.expected.json`: the mapping, ignored and needs-choice columns, statuses, roll-up dates and progress, unscheduled epics, stories without dates or team, warnings, format, encoding and row count (`test_payments_fixture.py`).
- [ ] The JSON (with and without `names`) and XML builds of the same data give the same epics.
- [ ] `HOME-1`, `HOME-2`: three tiles; recent roadmaps and diagrams with name, file name, updated date and Open; loading, error-with-Retry and empty states; delete with a confirmation naming what gets unlinked.
- [ ] `IMP-1` to `IMP-3`: drop or pick a CSV/JSON/XML file; file name, size, format and row count shown; the sample export; the saved-roadmap list and `.json` upload bypass mapping; the template select; the export help.
- [ ] `IMP-4` to `IMP-8`: the Map table with sample values, field selects, sniffed highlight, orange "Choose a field…", "Auto-mapped N of M" and "+N other columns…"; repeated columns merged; status mapping with dots and custom statuses; the four roll-up rules with their defaults.
- [ ] `IMP-9`: a template is applied first (by name and by field id) and "Update mapping template" writes only the changed entries; `columnMap` values are validated.
- [ ] `IMP-10`: Create is disabled without Key and Title (and the server returns 422); the no-dates warning appears.
- [ ] `IMP-11`, `IMP-12`: counts, warnings, the first five epics and the live "What gets saved"; the name, Save as, Back, and the confirmation (file name, size estimate, unmapped count) → the roadmap is created, the JSON downloads from the backend, and the roadmap opens.
- [ ] The Playwright journey "import sample → fix Components → create" passes at 1440×900, plus the 390×844 smoke test.
- [ ] `NF-3`: the 20 MB cap, defusedxml (entities rejected), utf-8-sig then cp1252, CSV streamed, plain-language errors.
- [ ] Carry-overs closed: `columnMap` validation; non-UUID path ids → plain 404; nav goes to the most recent documents and `demoDocuments.ts` is removed.
- [ ] Alembic `0003` is up, down and `alembic check` clean. `gen:api` was rerun, the `types.ts` diff is included, and running it again gives no diff.
- [ ] No document shape change, so `schemaVersion` stays 1, with no migration needed (stated in the PR).
- [ ] `make lint` and `make test` pass. `make e2e` passes `shell`, `documents`, `home` and `import` (desktop + mobile).
- [ ] Home, Import and Map were compared with the prototype at 1440×900 and 390×844, and the differences are listed in `docs/design/deviations.md` and the PR.
- [ ] Protected files are untouched: `git diff --stat -- docs/fixtures docs/design/prototype docs/design/screens docs/product-spec.md` is empty.
- [ ] The summary ticks HOME-1, HOME-2, IMP-1 to IMP-12 and NF-3 (import), and lists the ASSUMPTIONs above.
