# M3 · Roadmap editor: plan

Brief: `.claude/skills/milestone/milestones/M3-roadmap-editor.md`. Branch: `milestone/M3-roadmap-editor`. Skills: `roadmap-timeline`, `prototype-parity`, `document-format`. Prototype route: `#roadmap`. Screens: `04-roadmap-months.png`, `04-roadmap-sprints.png`, `04-roadmap-sprints-fit.png`, `04-roadmap-pis.png`, `04-roadmap-panel-collapsed.png`, `04b-roadmap-resync-dialog.png`, `10-mobile-roadmap.png`. Tests freeze today at **2026-11-06**.

## Goal
Replace the M1 placeholder at `/roadmaps/:id` with the real editor. First, write the timeline maths twice (ADR-3), in `frontend/src/lib/timeline` and `backend/app/render/timeline.py`; both must pass `docs/fixtures/timeline/{sprints,months,pis}.json`. On top of that maths, build the editor:
- the toolbar and the summary cards;
- the timeline: Sprint, Month and PI headers, team and epic rows, bars, the milestones row, milestone lines, freeze bands and the Today line;
- the unscheduled tray and the legend;
- the detail panel, which edits optimistically through the existing `useAutosave` and collapses to a rail;
- per-view zoom with Fit, Ctrl/Cmd+wheel and keyboard shortcuts;
- Save JSON and Open JSON;
- a Manage PIs dialog;
- Re-sync from a newer Jira export, which reuses the M2 import pipeline, shows a diff and keeps the user's edits.

The acceptance gate has three parts:
- at 1440×900, the three views match the `04-roadmap-*` screens;
- editing an epic's start date moves its bar and autosaves;
- a collapsed panel stays collapsed after a reload.

## In scope
- `RM-1` to `RM-16` and `RM-20`. **There is no `RM-17`, `RM-18` or `RM-19` in `docs/product-spec.md`.** The brief's "RM-1–RM-20" therefore means these 17 IDs.
- `G-2` (autosave of every editor edit), `G-3` (Undo snackbar on Unschedule) and `G-5` (wrapping toolbar, panel stacked below the timeline at 390px).
- `NF-2` for the new screen: keyboard paths, `aria-pressed`, labels, focus-trapping dialogs.
- `NF-4`: Open in Jira is a plain link.
- STATUS carry-over (M2): item `progress` is stored with Python half-to-even rounding. **The frontend never recomputes an item's progress.** It shows `item.progress` and the `issues` counts as stored. The only number the frontend derives is the summary's Issues done %, using `roundHalfEven` (task 5).
- STATUS carry-over (M2): the generated PI cadence is now fixable in the Manage PIs dialog (`RM-4`).
- **User-requested addition beyond the spec (decision of 2026-11-08):** a small **Milestones** dialog to add, edit and delete milestones and freeze windows (task 13). No spec ID covers it. Tests use the prefix `RM-9-editor` so the reviewer can trace them.

## Out of scope (deferred)
- Export files and previews, `EX-*` → **M5**. In M3, **Export…** navigates to `/exports?source=roadmap&id=<id>&view=<view>`; M5 reads those params. The roadmap SVG renderer (`roadmap_svg.py`) is M5. M3 only adds `render/timeline.py`.
- Performance verification for `NF-1` (300 epics at 60 fps) → **M6**. M3 memoises rows per item id but does not virtualise.
- A `release` field on items, and real Release grouping. By user decision, Release shows disabled in Group by.
- Still open from earlier milestones and not touched here: the partial `piCadence` PUT, the asset sha256 race, and the "+ 1 other columns" plural.

## Contract changes (first, task 2)

### Document: `backend/app/schemas/documents.py`
These are additive and optional, so **no `schemaVersion` bump** (`document-format`: optional additive fields do not bump). Both default to `None`, which keeps the M1 lossless rule (`exclude_none`).
- `RoadmapItem.edited_fields: list[EditableField] | None`, where `EditableField = Literal["title", "statusId", "laneId", "start", "end"]`. Description: "Fields the PM changed by hand; re-sync keeps them".
  - Unique values are enforced by a validator: "Item PAY-142 lists an edited field twice".
- `RoadmapSource.synced_at: dt.datetime | None`. Description: "Last re-sync from Jira". The panel footer shows `syncedAt ?? importedAt`.
- New validator in `RoadmapDocument._check_consistency`: after sorting PIs by `start`, a PI must not start before the previous one ends (`start + sprints × sprintLengthDays`).
  - Message: "PI 1 · 2027 starts before PI 4 · 2026 ends".
  - Gaps are allowed.
  - Test: `docs/examples/roadmap.example.json`, the payments fixture document and every seeded document still validate.
- Tightened `Milestone` validation, for the milestone editor (task 13). The shape is unchanged, so there is **no `schemaVersion` bump**.
  - `name`: `min_length=1`, `max_length=120`. Message: "Give the milestone a name".
  - In `_check_milestone`, a `milestone` must not carry `start`/`end`, and a `freeze` must not carry `date`. Message: "Milestone “Beta launch” can't have both a date and a date range". This stops a half-converted kind change from saving.
  - The existing rules stay: a milestone needs a date; a freeze needs a start and an end, with the end on or after the start.
- Data-model doc: add both new fields to `docs/data-model.md` (items row and source row), and note the milestone rules in the milestones row.

### New API schemas: `backend/app/schemas/resync.py` (camelCase via `ApiModel`)
- `ResyncChangeKind = Literal["new", "removed", "dates", "status", "progress", "stories"]`.
- `ResyncChange`:
  - `id: str`: stable within a diff, e.g. `"dates:PAY-155"`;
  - `kind`, `item_key: str`, `item_title: str`;
  - `before: str | None` and `after: str | None`: **display strings** built by the server, e.g. "12 Mar 2027", "In progress", "0%", "4 stories";
  - `conflict: bool`, and `conflict_reason: str | None`, e.g. "You changed the dates by hand";
  - `already_applied: bool`: the roadmap already has the incoming value. Shown, but not selectable and not counted.
- `RoadmapResyncRead`:
  - `id: UUID`, `roadmap_id: UUID`, `base_revision: int`, `file_name: str`;
  - `template_name: str | None`;
  - `changes: list[ResyncChange]`;
  - `unchanged: int`: items with no change;
  - `warnings: list[str]`.
- `ResyncApply`: `base_version: int` and `change_ids: list[str]`. `change_ids` has at least one entry, with the message "Choose at least one change to apply".

### Routes: `backend/app/api/routers/roadmaps.py`
| Route | Request | Response | Errors |
|---|---|---|---|
| `POST /api/roadmaps/{id}/resync` | multipart: `file` (20 MB cap via `read_capped`) and optional form field `templateId` | `RoadmapResyncRead`, 201 | 404 roadmap; 413; 422 (unreadable file, Key/Title not found, unknown template) |
| `POST /api/roadmaps/{id}/resync/{resyncId}/apply` | `ResyncApply` | `RoadmapRead` (`response_model_exclude_none`) | 404 for an expired or unknown resync: "This re-sync has expired. Upload the export again." 409 for a stale `baseVersion`: "The roadmap changed after you uploaded this export. Upload it again." 422 for an unknown change id. |

### Table and migration
- `backend/app/models/roadmap_resync.py`, table `roadmap_resyncs`:
  - `id` str PK;
  - `roadmap_id` str FK → `documents.id`, `ondelete="CASCADE"`, indexed;
  - `base_revision` int;
  - `file_name` str;
  - `template_id` str | None;
  - `changes` JSON: each change plus its private `payload`, the values to write;
  - `warnings` JSON;
  - `created_at`.
- Lifetime: **1 h TTL**, purged on create, the same as `IMPORT_SESSION_TTL`.
- Alembic: `backend/alembic/versions/0004_roadmap_resyncs.py`.

### Generated types
`pnpm -C frontend gen:api` runs after task 2 and again after task 3. Include both diffs.

## Shared timeline maths (ADR-3): exact API
Both implementations work in **ISO date strings in, integer day numbers inside**: UTC epoch days in TS, `date.toordinal()` in Python. This avoids DST and timezone drift. Names are camelCase in TS and snake_case in Python, with the same meaning.

| Function | Returns | Notes |
|---|---|---|
| `programIncrements(pis, sprintLengthDays)` | `Pi[]`: `{id, name, start, endExclusive, sprints: Sprint[]}` | Sprint `j` starts at `pi.start + j*len`. Label `sprintNames[j] ?? "S{j+1}"`, plus `" · IP"` on the last sprint when `ipSprint` is set. `tickLabel` is `"IP"` or the label. |
| `currentSprint(pis, today)` | `Sprint \| null` | The sprint containing today. |
| `defaultRange(view, timeline, items)` | `{start, endExclusive}` | Sprints: the first sprint whose start ≥ `timeline.start` (ASSUMPTION, see below), then 13 sprints, or fewer if the PIs run out. Months: from the 1st of the month of the earliest scheduled item start (else `timeline.start`) to the 1st after the month of the latest end. PIs: the whole PIs that overlap the items. |
| `columns(view, range, pis, today)` | `Column[]`: `{row: "pi"\|"sprint"\|"month"\|"tick", label, start, endExclusive, dates?, sub?, current, ip, clipped}` | Must equal the fixture `columns`. A missing `current`, `ip` or `clipped` in the fixture means `false`. Month `sub` is the PI containing `start + floor(days/2)`, or absent. |
| `boundaries(view, range, pis)` | `{date, strong}[]` | Compared **order-insensitively**: `pis.json` lists the strong boundaries first. Excludes the range start and the range end. |
| `sprintDateLabel(start, endExclusive, colW)` | string | The ≥96 / ≥70 / ≥44 rules, with fixture `compactDates`. Use the en dash. A cross-month compact label has no spaces (`30 Nov–13 Dec`). |
| `formatDayMonth(date)` | `"2 Nov"` | Used by labels, Today and milestones. |

Frontend-only (not mirrored, because the export has no zoom or DOM): `fraction`, `leftCss`, `widthCss`, `timelineWidth`, `sprintColumnWidth` and the zoom helpers in `lib/timeline/zoom.ts`.

## Ordered tasks

Parallel groups. Tasks in the same group touch disjoint directories and can run at the same time.
- **Group A:** tasks 1, 2 and 4. Task 1 is `backend/app/render/` and `backend/tests/render/`. Task 2 is `backend/app/{schemas,models}/`, `alembic/` and `backend/tests/documents/`. Task 4 is `frontend/src/lib/timeline/`.
- **Group B:** task 3 (backend, after 2) and task 5 (frontend, after 4) run at the same time.
- **Group C:** tasks 6 and 7 can run in parallel. Each creates only its own files under `features/roadmap/components/`. Task 8 owns `RoadmapPage.tsx` and runs after both.
- **Group D:** tasks 9, 10, 11 and 13 each create their own component files. Each also makes a one-line wiring edit in a file it does not own:

  | Task | Shared-file edit |
  |---|---|
  | 9 | `RoadmapPage.tsx` |
  | 10 | `RoadmapToolbar.tsx` (Save JSON / Open JSON), and `TimelineHeader.tsx` (Manage PIs trigger in the corner cell) |
  | 11 | `RoadmapToolbar.tsx` (Re-sync) and `useAutosave.ts` |
  | 13 | `MilestonesRow.tsx` (edit trigger in the row's label cell) |

  The only real collision is 10 with 11 on `RoadmapToolbar.tsx`: run those two one after the other, or merge by hand. Task 13 shares no file with 9, 10 or 11, so it can run in parallel with all of them. Task 11 also needs task 3's `gen:api`. Task 13 needs task 2 (the tightened milestone validation) merged so its error-path tests hit the real messages.
- Task 12 runs last, after task 13.

---

### 1. `export-engineer`: `render/timeline.py` (`RM-4`–`RM-7`, ADR-3)
- Create:
  - `backend/app/render/__init__.py`;
  - `backend/app/render/timeline.py`, with the API in the table above. It holds frozen dataclasses `Pi`, `Sprint`, `Column`, `Boundary`, `DateRange` and takes `ProgramIncrement`-like input. It may import `app.schemas.documents` but **must not import `app.api`**. `today` is a parameter, never `date.today()`.
- Tests: `backend/tests/render/__init__.py` and `backend/tests/render/test_timeline.py`. It loads `docs/fixtures/timeline/*.json` and has:
  - `test_RM_5_sprint_columns_match_fixture`, `test_RM_5_compact_dates_match_fixture`, `test_RM_6_month_columns_match_fixture`, `test_RM_7_pi_columns_match_fixture`;
  - `test_RM_4_boundaries_match_fixture[view]`;
  - `test_RM_4_ip_sprint_label_and_custom_sprint_names`;
  - `test_RM_4_default_range_from_example_document[view]`, using `docs/examples/roadmap.example.json`. The expected range per view equals the fixture `range`.
  - `test_RM_4_no_current_sprint_outside_pis`.
- About 300 lines.

### 2. `backend-engineer`: document contract additions and the resync table (`RM-13`, `RM-15`, `RM-4`)
- Change:
  - `backend/app/schemas/documents.py`: `edited_fields`, `synced_at`, and the PI overlap validator (see Contract);
  - `docs/data-model.md`.
- Create:
  - `backend/app/models/roadmap_resync.py`, registered in `models/__init__.py`;
  - `backend/alembic/versions/0004_roadmap_resyncs.py`;
  - `backend/app/schemas/resync.py`;
  - `backend/app/repositories/resyncs.py`: `add`, `get`, `purge_older_than`.
- Tests:
  - `tests/documents/test_schemas.py`: `test_RM_15_edited_fields_round_trip`, `test_RM_15_duplicate_edited_field_rejected`, `test_RM_4_overlapping_pis_rejected`, `test_RM_4_contiguous_and_gapped_pis_accepted`, `test_RM_9_editor_blank_milestone_name_rejected`, `test_RM_9_editor_milestone_with_range_rejected`, `test_RM_9_editor_freeze_with_date_rejected`;
  - `tests/api/test_roadmaps_api.py`: `test_RM_9_editor_patch_insert_and_remove_milestone`. It inserts a milestone through the autosave `PATCH`, then removes it, and checks the 422 message for a freeze whose end is before its start.
  - `tests/api/test_rm16_round_trip.py`: extend so a document with `editedFields` and `syncedAt` round-trips;
  - `tests/db/test_migrations.py`: upgrade and downgrade 0004;
  - deleting a roadmap cascades its resync rows.
- Run `gen:api`. About 250 lines.

### 3. `backend-engineer`: the re-sync service and routes (`RM-15`)
- Create `backend/app/services/resync_diff.py`. It is pure: no DB, no clock.
  - `diff_roadmaps(current: RoadmapDocument, incoming: RoadmapDocument) -> list[StoredChange]`. Items are matched by `key`.
    - **new**: the incoming key is missing from current. The payload is the incoming item, with a unique id and `position = max + 1000`, plus its lane `{name, color}`.
    - **removed**: the current key is missing from incoming. It is a conflict if the item has `notes` or `editedFields`.
    - **dates**: `start` or `end` differs. It is a conflict if `start` or `end` is in `editedFields`.
    - **status**: `statusId` differs. It is a conflict if `statusId` is in `editedFields`.
    - **progress**: `progress` or `issues` differs.
    - **stories**: the stories list differs. The display text is "2 new stories" or "4 → 6 stories".
    - `already_applied` is set when a field in `editedFields` already equals the incoming value. This is the prototype's "RSK-031 … (already applied)".
  - `apply_changes(current, changes, selected_ids, file_name, now) -> RoadmapDocument`.
    - Writes the payloads.
    - A new item's lane is matched by name, case-insensitively. Otherwise a lane is added, with the next `TEAM_COLOR_ORDER` colour and `position = last + 1000`.
    - An applied conflict removes those fields from `editedFields`.
    - Sets `source.file` and `source.synced_at`.
    - **Never touches** `notes`, `milestones`, `timeline`, `linkedDiagrams` or unselected items.
  - Selection rule: changes with `conflict == False` and `already_applied == False` are pre-selected **in the UI**. The server applies exactly the ids it is sent.
- Change `backend/app/services/imports.py`: add a public `build_from_upload(file_name, data, column_map, status_map, custom_statuses, settings, now) -> BuildResult`. It reuses `_parse`, `merge_repeated_columns`, `suggest_mapping`, `_kept_cells` and `build_roadmap`, and does not change `create_session`.
  - Columns are accepted only at confidence `template`, `exact` or `alias`.
  - Missing Key or Title → `InvalidInputError("Couldn't find the Key and Summary columns in this file. Import it from the Import page instead.")`.
- Create `backend/app/services/resync.py`:
  - `create_resync(session, roadmap_id, file_name, data, template_id)`:
    - Purges expired rows.
    - Template = `template_id`, else `source.mappingTemplateId` if it still exists, else none.
    - `status_map` comes from the **current document's** `statuses[].jiraStatuses`, with template `status_map` entries as a fallback.
    - Unknown Jira statuses go to `not-started`, with the warning "2 issues have a Jira status this roadmap doesn't map (QA) — they show as Not started".
    - Items ending after the last PI get the warning "PAY-200 ends after the last PI — add one in Manage PIs".
    - Stores the row and returns `RoadmapResyncRead`.
  - `apply_resync(session, roadmap_id, resync_id, request)`:
    - Checks the TTL and `base_revision == row.revision == request.base_version`, else 409.
    - `apply_changes`, then validate, then `update_if_revision` (the same path as `patch_document`).
    - Deletes the resync row and returns `RoadmapRead`.
- Routes: add both to `api/routers/roadmaps.py`, declared after `/{roadmap_id}`. They are thin: they validate and delegate.
- Tests:
  - `tests/services/test_resync_diff.py`: `test_RM_15_new_item_added_to_matching_lane`, `test_RM_15_new_team_gets_new_lane`, `test_RM_15_removed_item_with_notes_is_conflict`, `test_RM_15_edited_dates_are_conflict_and_kept_when_unselected`, `test_RM_15_status_already_applied`, `test_RM_15_notes_and_milestones_never_change`, `test_RM_15_apply_sets_synced_at_and_file`.
  - `tests/api/test_resync_api.py`. Upload `docs/fixtures/jira/payments-export.csv` against a roadmap committed from the same file with three hand edits; expect zero non-conflict changes plus the conflicts. Also: `test_RM_15_stale_base_version_409`, `test_RM_15_expired_resync_404`, `test_RM_15_key_title_missing_422`, `test_NF_3_resync_upload_over_20mb_413`.
- Run `gen:api`. About 400 lines. If it grows past that, split the routes and API tests into **3b**.

### 4. `frontend-engineer`: `lib/timeline` (ADR-3), in parallel with 1–2
- Create:
  - `frontend/src/lib/timeline/dates.ts`: `toDay`, `fromDay`, `addDays`, `todayIso(now = new Date())` (local calendar date);
  - `cadence.ts`: `programIncrements` and `currentSprint`;
  - `scale.ts`: `defaultRange`, `columns`, `boundaries`, `fraction`, `leftCss(range, day, offsetPx)` (returns the `calc(220px + (100% − 220px) * f ± n px)` string), `widthCss`, `timelineWidth(containerWidth, view, zoom)` and `sprintColumnWidth(...)`. Where `W = 220 + max(cw − 220, baseMinW − 220) × z`, `colW = (W − 220) × 14 / rangeDays`.
  - `labels.ts`: `sprintDateLabel`, `formatDayMonth`, `formatDayMonthYear`, `sprintTooltip(pi, sprint)` (`PI 4 · 2026 · S3 · 2 Nov – 15 Nov`), `spanText(item, pis, milestones)` (`Runs PI 4 · 2026 S4 → PI 1 · 2027 S3 · crosses Beta launch`);
  - `zoom.ts`: `ZOOM_STEPS`, `ZOOM_MIN = 0.5`, `ZOOM_MAX = 3`, `stepZoom(z, dir)`, `clampZoom`, `wheelZoom(z, deltaY)` (`exp(−clamp(deltaY, ±60) × 0.004)`, rounded to 0.001), `fitZoom(cw, baseMinW)` (floor to 0.001), `anchoredScrollLeft(oldW, newW, scrollLeft, ax)`, `baseMinWidth(view)` (`220 + 13*104` or 900);
  - `index.ts`.
  - All constants come from `shared/design-tokens.json` → `timeline.*`.
- Tests:
  - `frontend/src/lib/timeline/fixtures.test.ts` imports the three fixture JSONs: `it('RM-5 sprint columns match the fixture')`, `it('RM-5 compact dates match the fixture')`, `it('RM-6 …')`, `it('RM-7 …')`, `it('RM-4 boundaries match the fixture (order-insensitive)')`.
  - `scale.test.ts`: default ranges from `roadmap.example.json` equal the fixture ranges; `it('RM-5 colW is 104 at 100% in a 1120px container')`.
  - `labels.test.ts`: `spanText` with and without a milestone crossing.
  - `zoom.test.ts`: `it('RM-20 steps …')`, `it('RM-20 Fit rounds down')`, `it('RM-20 wheel clamps deltaY')`, `it('RM-20 anchor keeps the pointer date still')`.
- About 380 lines.

### 5. `frontend-engineer`: editor state, storage and the shared zoom control (`RM-14`, `RM-20`, `RM-2`)
- Create:
  - `frontend/src/lib/storage.ts`: `readStored<T>(key, fallback, isT)` and `writeStored(key, value)`, both in try/catch (architecture: persisted panels and zoom).
  - `frontend/src/features/roadmap/state.ts`: Zustand `useRoadmapEditor`.
    - `view: 'sprints'|'months'|'pis'`, persisted as `ps-roadmap-view`, default `months` as in the prototype.
    - `zoom: Record<View, number>`, persisted as `ps-roadmap-zoom`.
    - `selectedItemId: string | null`.
    - `panelOpen`, persisted as `ps-panels.detail`. It uses the prototype's `ps-panels` object so that M4 can add `insp`.
    - `groupBy: 'team'|'epic'`.
    - `showMilestoneLines`, default `true`.
    - Actions: `setView`, `setZoom(view, z)`, `select`, `togglePanel`.
    - No document data in the store.
  - `frontend/src/lib/roadmap/summary.ts`, pure:
    - `roundHalfEven`;
    - `issuesDonePercent(items)` = `roundHalfEven(Σ progress×issues.total / Σ issues.total)`, or 0 when there are no issues (the example gives 28);
    - `atRisk(items)`;
    - `nextMilestone(milestones, today)` returns `{name, date, daysToGo}`;
    - `currentSprintSummary(pis, today)` returns `{label: "PI 4 · 2026 · S3", dates, daysLeft, percent}` (example: 9 days left, 36%);
    - `unscheduled(items)`.
  - `frontend/src/lib/roadmap/schedule.ts`, pure:
    - `nextSprint(pis, today)`: the first sprint whose start is after today;
    - `scheduleOps(item, sprint)`: set `start`/`end` to that sprint (one sprint), plus an `editedFields` op;
    - `unscheduleOps(item)`;
    - `editOps(item, field, value)`: the set op plus adding `field` to `editedFields`.
  - `frontend/src/components/ZoomControl.tsx`: props only — `zoom, min, max, onStep, onReset, onFit`. Buttons: −, `NN%` (`aria-label="Zoom NN%, reset to 100%"`), +, Fit. Disabled at the limits. M4 reuses it for `SW-19`.
- Tests: `state.test.ts` (persistence survives a store re-create; a throwing localStorage falls back), `summary.test.ts`, `schedule.test.ts`, `ZoomControl.test.tsx`. About 350 lines.

### 6. `frontend-engineer`: timeline header, milestones row and overlays (`RM-5`–`RM-7`, `RM-9`, `RM-10`)
- Create in `frontend/src/features/roadmap/components/`:
  - `TimelineHeader.tsx`: corner cell ("TEAM / EPIC", plus "2-week sprints", "by month" or "Program Increments") and the header cells from `columns()`.
    - PI band centred on its visible part.
    - The sprint cell has `title={sprintTooltip}`.
    - The current sprint uses `timeline.currentSprint`. IP cells are hatched (`timeline.ipHatch`).
  - `MilestonesRow.tsx`:
    - The sticky left label cell reads "Milestones". Task 13 adds its edit button there.
    - Diamonds are buttons labelled "Beta launch · 15 Jan".
    - The last milestone label is right-aligned.
    - The freeze chip reads "Code freeze", or "Freeze" when 76px or narrower.
    - Clicking a milestone shows the snackbar "<name> · 15 Jan 2027 · N epics cross it".
    - The "TODAY · 6 Nov" label sits at `L(today + 0.5) + 5px`.
  - `TimelineOverlays.tsx`, `aria-hidden`:
    - column lines from `boundaries()` (strong = `timeline.piLine` at 2px);
    - IP bands in the Sprint and PI views, from `top = 90`;
    - with milestone lines on, 2px dashed `milestone.color` lines and freeze bands with dashed edges, from `top = headerHeight + 34`;
    - the Today line from `top = headerHeight` (`color.today`).
- Tests (RTL):
  - `it('RM-5 shows sprint dates on one line at 104px and compact at 70px')`;
  - `it('RM-7 highlights the current tick')`;
  - `it('RM-9 right-aligns the last milestone label')`;
  - `it('RM-10 Today label is inside the milestones row, not the header')`;
  - `it('RM-9 milestone lines hide when the checkbox is off')`.
- About 350 lines.

### 7. `frontend-engineer`: label column, rows and bars (`RM-3`, `RM-8`)
- Create:
  - `TimelineRows.tsx`: team headers (30px: colour square from `team[color]`, name, "· N epics") and epic rows (44px).
    - Grouping comes from `state.groupBy`. Team: lanes by `position`, items by `position`. Epic: one flat list sorted by start.
    - Only scheduled items get rows.
  - `EpicRow.tsx`, `memo` per item id:
    - the label button (key in mono `primary`, title);
    - the bar button at `left = L(s) + 2px`, `width = W(s, e) − 4px`, coloured by status;
    - the title with an ellipsis;
    - a 3px white progress line at `item.progress`%;
    - `aria-label="PAY-142 Saved cards…, In progress, 61% complete, 16 Nov to 29 Jan"`;
    - selected state: outline ring plus a `primaryTintSoft` row.
  - `Timeline.tsx`: the scroll box (`.tlscroll`) containing header, milestones, rows and overlays. Width is `calc(220px + (100% − 220px) * z)` with the `minWidth` from `zoom.ts`.
- Tests: `it('RM-3 renders team headers with epic counts')`, `it('RM-8 clicking a bar selects it and opens the panel')`, `it('RM-8 clicking the row label selects it')`, `it('RM-8 bar width follows the dates')`. About 330 lines.

### 8. `frontend-engineer`: page, toolbar, summary, tray and legend (`RM-1`, `RM-2`, `RM-11`, `RM-12`, `RM-20`)
- Replace the body of `frontend/src/features/roadmap/RoadmapPage.tsx`. It keeps the existing loading, 404 and error states and drops `RoadmapPlaceholder`.
- Create:
  - `components/RoadmapToolbar.tsx`:
    - Source chip: "From Jira · imported 6 Nov 2026, 17:10", or "opened from `<file>`" when `source.type === 'json'`.
    - Re-sync button, which task 11 wires.
    - Sprints / Months / PIs toggle with `aria-pressed`.
    - Group by select, by **user decision**: **Team** (default) and **Epic** (one flat list sorted by start date, no team headers) both work. **Release** is a disabled option with the tooltip "Releases aren't saved in v1 roadmaps".
    - Milestone lines checkbox.
    - `ZoomControl`.
    - Save JSON / Open JSON (task 10) and **Export…**.
  - `components/SummaryCards.tsx`, which uses `lib/roadmap/summary.ts`.
  - `components/UnscheduledTray.tsx`:
    - The label "Unscheduled (N)".
    - The first 5 chips, then a "+ N more" button that expands the rest, and the hint "click one to schedule it in the next sprint".
    - Click, or a drop onto the timeline (HTML5 drag, `dataTransfer` item id), calls `scheduleOps`. The snackbar reads "PAY-170 scheduled in PI 4 · 2026 S4".
    - When there is no next sprint, the error reads "Add a PI in Manage PIs to schedule this item".
  - `components/Legend.tsx`: statuses from `document.statuses`, the progress sample, IP sprint (not in Months) and the milestone sample.
  - `useTimelineZoom.ts`:
    - Ctrl/Cmd+wheel on the scroll box with `{passive: false}`, anchored at the pointer.
    - Ctrl/Cmd `=`, `-` and `0` while the page has focus and the target is not a text input.
    - Fit uses `clientWidth` and sets `scrollLeft = 0`.
    - After each zoom, `anchoredScrollLeft` runs in `useLayoutEffect`.
- Tests:
  - `RoadmapPage.test.tsx` (rewrite): `it('RM-1 shows the source chip')`, `it('RM-2 summary cards from roadmap.example.json')` (28%, 2 epics, Beta launch in 70 days, PI 4 · 2026 · S3 · 9 days left, 5 issues), `it('RM-11 clicking a chip schedules it in the next sprint and autosaves')`, `it('RM-12 hides IP in the legend in Months')`;
  - `useTimelineZoom.test.tsx`: `it('RM-20 each view remembers its zoom')`, `it('RM-20 Ctrl+= steps up')`, `it('RM-20 Fit fits 13 sprints')`.
- About 400 lines.

### 9. `frontend-engineer`: detail panel and rail (`RM-13`, `RM-14`, `RM-11` Unschedule)
- Create:
  - `components/DetailPanel.tsx`, 320px (`layout.sidePanelWidth`):
    - Empty: "Click a bar to see and edit an epic."
    - Header: key · type, the collapse button (`aria-expanded`, `aria-label="Collapse epic details"`), an uncontrolled title input keyed on `autosave.reloads` (text save, 500 ms), and **Open in Jira ↗** (`item.jiraUrl`, else `settings.jiraBaseUrl + "browse/" + key`, else hidden).
    - Status and Team selects save immediately.
    - Start and End `type="date"` inputs save on a valid change. An invalid range shows "End date can't be before the start date" and does not save; the field reverts on blur.
    - Every edit goes through `editOps`, which records `editedFields`.
    - `spanText` line.
    - "Progress from N Jira issues" with `item.progress`% (stored, **not recomputed**), "D done · P in progress · T to do" from `issues`. When `issues.total === 0`: "No Jira issues — progress set manually".
    - Stories with status dots: the first 4, then "+ N more" expands.
    - PM notes textarea: "PM notes (saved in the JSON, never sent to Jira)", text save.
    - Footer: **Unschedule**, which shows a 6 s snackbar "PAY-142 moved to Unscheduled" with **Undo** that re-sets the dates. "Synced from Jira 6 Nov, 17:10" from `syncedAt ?? importedAt`.
  - `components/PanelRail.tsx`, 48px:
    - The expand button.
    - A vertical button reading "PAY-142 · Saved cards…", or "Epic details".
    - Focus moves to the toggle after it switches.
  - At ≤720px the panel stacks below the timeline (`G-5`).
- Tests:
  - `it('RM-13 changing Start moves the bar and sends one PATCH')` (MSW);
  - `it('RM-13 rejects end before start')`;
  - `it('RM-13 edits add editedFields')`;
  - `it('RM-13 a failed save rolls back and shows the snackbar')`;
  - `it('RM-14 collapsed state survives a remount')`;
  - `it('RM-11 Unschedule then Undo restores the dates')`.
- Wire into `RoadmapPage.tsx` with one line. About 380 lines.

### 10. `frontend-engineer`: Save JSON, Open JSON and Manage PIs (`RM-16`, `RM-4`)
- Create:
  - `components/SaveJsonDialog.tsx`:
    - "Save roadmap JSON". The text "Saves `<fileName>`. Everything below comes back when you open the file again."
    - A `<pre>` with `JSON.stringify(document, null, 2)` from the cache.
    - **Copy JSON** (`navigator.clipboard`, "JSON copied" / "Copy was blocked").
    - **Download**: an `<a href="/api/roadmaps/{id}/document" download>`, served by the backend. While autosave is `unsaved` it is disabled and labelled "Saving…", and `autosave.flush()` runs when the dialog opens.
  - Open JSON: a toolbar file input (`accept=".json"`) that reuses `useOpenSavedRoadmap` from `features/home/useHome.ts`. It navigates to the new roadmap and shows the server's plain-language `detail` in an error snackbar.
  - `components/ManagePisDialog.tsx`:
    - One row per PI: name, start date, sprints (1–12), IP switch, and remove (`aria-label="Remove PI 2 · 2027"`).
    - **Add PI** appends `start = previous endExclusive`, named "PI n", with sprints and IP from `useSettings().piCadence`.
    - A live header preview renders the PI view's `columns()` for the edited PIs, reusing `TimelineHeader` at a fixed width.
    - Validation:
      - overlap: "PI 1 · 2027 starts before PI 4 · 2026 ends";
      - empty name.
    - Save sends **one** `set /timeline/pis` op (sorted by start, immediate). `sprintNames` is dropped from a PI whose sprint count changed.
    - The trigger is a **Manage PIs** text button in the timeline corner cell, `TimelineHeader.tsx`, added with a one-line edit (ASSUMPTION; it is not in the prototype).
- Tests: `it('RM-16 Save JSON shows the exact document and copies it')`, `it('RM-16 Open JSON error shows the plain message')`, `it('RM-4 Manage PIs preview updates live')`, `it('RM-4 overlapping PIs block Save')`, `it('RM-4 Save sends one set op')`. About 380 lines.

### 11. `frontend-engineer`: Re-sync dialog (`RM-15`), after task 3's `gen:api`
- Create:
  - `frontend/src/api/useResync.ts`:
    - `useCreateResync(roadmapId)`: multipart through `apiUpload`, with `templateId`.
    - `useApplyResync(roadmapId)`: on success, `setQueryData(roadmapKeys.detail(id), read)` and `autosave.replace(read)`.
  - Change `frontend/src/api/useAutosave.ts`: add `replace(read)`. It drops pending work, writes the cache and calls `publish(true)` so that uncontrolled fields remount. Test it in `useAutosave.test.tsx`.
  - `components/ResyncDialog.tsx`:
    - **Step 1**: "Re-sync from a new Jira export". A file drop/picker and a **Mapping template** select (`useMappingTemplates`), defaulting to `source.mappingTemplateId`.
    - **Step 2**:
      - The text "Comparing `<file>` with your roadmap:".
      - A checkbox list of changes, pre-checked when `!conflict && !alreadyApplied`.
      - A **Conflicts** section, unchecked, showing the reason.
      - Already-applied rows, without a checkbox.
      - Warnings.
      - The footnote "Your PM notes, milestones and manual edits are kept."
      - **Apply N changes**, disabled when N = 0 or autosave is `unsaved`.
    - Empty diff: "This export matches your roadmap." with Close.
    - On success the snackbar reads "Roadmap updated from Jira".
    - A 409 or 404 shows the server `detail` and goes back to step 1.
- Tests: `it('RM-15 lists changes and pre-selects non-conflicts')`, `it('RM-15 Apply sends only checked ids and updates the timeline')`, `it('RM-15 stale export returns to step 1 with the message')`. About 350 lines.

### 13. `frontend-engineer`: Milestones dialog (user-requested addition beyond the spec; runs before 12)
Numbered 13 so that the existing task numbers don't change. It runs in group D, after tasks 2, 5 and 6.
- **Entry point:**
  - A small pencil icon button in the milestones row's left label cell ("Milestones ✎"), with `aria-label="Edit milestones"` and the tooltip "Add, edit or delete milestones". This is a one-line edit to `MilestonesRow.tsx`.
  - Placed there because it sits on the row it edits, next to the Manage PIs button in the corner cell just above. The toolbar stays as in the prototype.
  - When the roadmap has no milestones, the row also shows a text button, "Add a milestone", in the empty row.
  - Clicking a diamond keeps the RM-9 snackbar from task 6. It does not open the dialog.
- **Create `frontend/src/lib/roadmap/milestones.ts`** (pure, no React):
  - `sortedMilestones(milestones)`: by `date ?? start`.
  - `newMilestone(kind, pis, today, takenIds)`: the id is `ms-<slug(name)>`, made unique with a `-2`, `-3` suffix. Defaults:
    - a milestone is named "New milestone" and dated on the next sprint's start;
    - a freeze is named "Code freeze" and spans the next sprint, start to inclusive end;
    - with no next sprint, both fall back to today.
  - `validateMilestone(draft)` returns the same plain messages as the backend:
    - "Give the milestone a name";
    - "Milestone “X” needs a date";
    - "Freeze “X” needs a start and an end date";
    - "Freeze “X” ends before it starts".
  - `milestoneOps(before, after)` returns the ops for one row:
    - `set` for name and dates;
    - a kind change becomes one batch: `set kind`, `remove` the old date fields, `set` the new ones;
    - `insert` adds to `/milestones`; `remove` deletes `/milestones/<id>`.
- **Create `components/MilestonesDialog.tsx`**, an MUI `Dialog` titled "Milestones", which traps focus and returns it to the trigger on close:
  - One row per milestone, sorted by date. Each row has:
    - a purple diamond, or the hatched freeze swatch (`milestone.*` tokens);
    - a **Type** select: Milestone or Freeze window;
    - a **Name** field;
    - **Date**, or **Start** and **End** (`type="date"`);
    - a delete icon button, `aria-label="Delete Beta launch"`.
  - Footer buttons: **Add milestone** and **Add freeze window**. Each inserts a valid row immediately and focuses its Name field.
  - **Saving goes through `useAutosave`, like every other edit.** Name saves in text mode (500 ms). Type and dates save immediately. An invalid row shows its message under the field and sends nothing until it is valid.
  - **Delete asks first.** An inline confirmation replaces the row: "Delete “Beta launch”? It disappears from the timeline, its milestone line and exports." with **Cancel** and **Delete** (danger). Focus moves to Cancel. Esc cancels the confirmation without closing the dialog. Delete sends one `remove` op and shows the snackbar "Deleted Beta launch".
  - Empty state: "No milestones yet. Add one to mark a launch or a code freeze."
  - **Done** closes the dialog. Edits have already saved.
  - Keyboard:
    - every control is a real input or button, in DOM order;
    - Enter in the Name field moves to the next field;
    - Esc closes the dialog when no confirmation is open.
  - Labels and contrast follow NF-2.
- **Re-sync:** `RM-15` already never touches `milestones`, so milestones the user edits survive a re-sync. Task 3's test `test_RM_15_notes_and_milestones_never_change` covers it.
- Tests:
  - `milestones.test.ts`: defaults, unique ids, the ops for a kind change, validation messages.
  - `MilestonesDialog.test.tsx` (MSW):
    - `it('RM-9-editor adds a milestone and autosaves one insert op')`;
    - `it('RM-9-editor renaming saves after the text debounce')`;
    - `it('RM-9-editor switching to Freeze window sends one batch')`;
    - `it('RM-9-editor rejects a freeze ending before it starts and sends nothing')`;
    - `it('RM-9-editor delete asks for confirmation; Cancel keeps the row')`;
    - `it('RM-9-editor confirmed delete removes the diamond from the timeline')`;
    - `it('RM-9-editor dialog traps focus and returns it to the trigger')`;
    - `it('RM-9-editor a failed save rolls back and shows the snackbar')`.
- About 350 lines.

### 12. `test-engineer`: journeys, parity and gaps
- Create `frontend/e2e/roadmap.spec.ts` at 1440×900, with `page.clock.setFixedTime('2026-11-06T12:00')` and the seeded example roadmap (`make seed`, id `0d3c9a52-…`):
  - `RM-5 sprint view shows dates on one line at 100% and compact at Fit`;
  - `RM-13 editing start date moves the bar and survives reload` (waits for "Saved to");
  - `RM-14 collapsed panel persists after reload`;
  - `RM-20 Ctrl+wheel zooms around the pointer`;
  - `RM-16 Save JSON → Open JSON round-trips`, plus `docs/examples/roadmap.v0.json` opens (journey 3);
  - `RM-15 re-sync from payments-export.csv shows the diff and applies`;
  - `RM-9-editor milestones`: keyboard only from the "Edit milestones" button.
    - Add a milestone, rename it to "Pilot" and set 2027-02-10. The diamond "Pilot · 10 Feb" appears and survives a reload.
    - Switch it to a freeze window. The freeze chip appears.
    - Delete it: Cancel keeps it; Delete removes it after a reload.
    - Focus returns to the trigger.
    - A re-sync afterwards keeps the edited milestones.
  - mobile 390×844 smoke: toolbar wraps, panel below, timeline scrolls inside its box.
- Update the route map in `.claude/skills/prototype-parity/scripts/capture.mjs` (`roadmap` → `/roadmaps/0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31`). Run `capture.mjs roadmap` for the three views and the collapsed panel. Add the differences to `docs/design/deviations.md` under M3.
- Fill gaps: a pytest+vitest cross-check that `defaultRange` and `columns` for `roadmap.example.json` agree between the two implementations, via a JSON snapshot written by one and read by the other — **only if** cheap; otherwise list it as a follow-up.

## ASSUMPTIONs (made by the planner; the user can override)
1. **Sprint view start:** the first sprint whose start ≥ `timeline.start`. The fixture has `timelineStart` 2026-11-01 and a range starting 2026-11-02, which rules out "the sprint containing the start".
2. **Milestone label uses the full name** ("Beta launch · 15 Jan") and "crosses Beta launch". The prototype shows "Beta"; the document's name is "Beta launch". Logged as a deviation.
3. **Schedule from the tray = one sprint** (the next sprint's start to its inclusive end), as the spec says "in the next sprint". The prototype uses two sprints. Spec wins; logged. Dropping onto the timeline does the same as a click; there is no date-under-pointer placement.
4. **View, zoom, panel and group-by are browser-local** (localStorage, except group-by, which is session-only) and are not saved in the document. Default view: Months.
5. **Nothing is selected on open.** The parity capture selects PAY-142 before shooting.
6. **Only scheduled items get rows.** A lane with no scheduled items still shows its header with "· 0 epics".
7. **Unscheduled card copy** keeps the prototype's "N issues / No start or due date in Jira", counting unscheduled items ("1 issue" for one).
8. **Source chip** is decided by `source.type`. Open JSON keeps the original source (lossless round-trip), so a re-opened Jira roadmap still says "From Jira · imported …".
9. **Issues done %** = Σ(progress × issues.total) / Σ issues.total, half-to-even, matching the Python rounding. Item progress is never recomputed.
10. **Re-sync diff fields:** dates, status, progress/issues, stories, new and removed items, as RM-15 lists. **Title and team changes in Jira are not diffed.** Columns are auto-matched only at template, exact or alias confidence. The status map comes from the roadmap's own `jiraStatuses`. Milestones are never re-derived. PIs are not auto-extended; a warning says so.
11. **Removed items:** listed and pre-selected, unless they have notes or hand edits (then a conflict, unchecked).
12. **The PI overlap rule** is enforced in the document schema as well as the dialog. Gaps are allowed. Changing a PI's sprint count drops its `sprintNames`.
13. **Open in Jira** is hidden when there is neither `jiraUrl` nor `settings.jiraBaseUrl`.
14. **Manage PIs trigger** is in the timeline corner cell, which keeps the toolbar matching the prototype.
15. **Today** is computed once per page render from the local calendar date; it does not tick over at midnight.
16. **Milestones dialog details** (task 13):
    - The entry point is the pencil in the milestones row's label cell.
    - Rows save as they change, rather than through a Save button.
    - A new milestone defaults to the next sprint's start; a new freeze to the next sprint's span.
    - Ids are `ms-<slug>` with a numeric suffix when taken.
    - Delete uses an inline confirmation, not Undo. The user asked for a confirmation.
    - Milestones are not linked to epics; "epics cross it" is still computed from dates.

## User decisions (2026-11-08)
1. **Group by (`RM-1`):** Team works; Epic is one flat list sorted by start date; Release is shown disabled. No `release` field is added. Applied in task 8.
2. **Milestones and freeze windows:** the user wants an editor. It is added as task 13, a user-requested addition beyond the spec. The backend's tightened milestone validation is in task 2. There is no `schemaVersion` bump, because the shape is unchanged.

## Open questions for the user
None outstanding.

## Risks
- **The PI overlap validator** could reject an existing dev database document with overlapping PIs. M2 only generates contiguous PIs, and seeds use the example. Mitigation: the task 2 test covers seeds and fixtures.
- **Re-sync reuses private M2 helpers.** `build_from_upload` must not change `create_session` behaviour; the M2 payments fixture test is the guard.
- **Ctrl+wheel** must call `preventDefault` on a non-passive listener, otherwise browser zoom wins. This is covered by e2e, not jsdom.
- **Older backends** reject the new optional fields (`extra="forbid"`). This is acceptable under the `document-format` rule, and nothing older is deployed.
- **Shared files in group D:**
  - `RoadmapToolbar.tsx` is touched by tasks 8, 10 and 11. Run 10 and 11 one after the other.
  - `TimelineHeader.tsx` (task 10) and `MilestonesRow.tsx` (task 13) each get a one-line edit from a task that doesn't own them, after task 6 has merged.
- **Tightened milestone validation** (blank name; mixed date and range) could reject an existing development document. The example, the fixtures, M2 import and the v0 migration all produce valid milestones. Task 2's tests cover the seeds.

## Done when
- [ ] `RM-1` toolbar: chip, Re-sync, Sprints/Months/PIs, Group by, Milestone lines, zoom, Save JSON, Open JSON, Export….
- [ ] `RM-2` five summary cards, computed from the document (28% / 2 epics / Beta launch in 70 days / PI 4 · 2026 · S3 / unscheduled count on the example).
- [ ] `RM-3` 220px label column, 30px team headers, 44px epic rows.
- [ ] `RM-4` PI cadence with IP sprint and S1…Sn; the Manage PIs dialog with live preview.
- [ ] `RM-5` Sprint header: PI band centred on its visible part, compact dates at 96/70/44, tooltip, current sprint blue, IP hatch in the header and body, stronger PI lines.
- [ ] `RM-6` Month header; `RM-7` PI header with ticks and the current tick.
- [ ] `RM-8` bars by date and status, with title and progress line; select from bar or label.
- [ ] `RM-9` milestones row, right-aligned last label, freeze chip, lines starting below the row.
- [ ] `RM-10` Today line below the header, label inside the milestones row.
- [ ] `RM-11` tray: click or drop schedules into the next sprint; Unschedule with Undo.
- [ ] `RM-12` legend (IP only in Sprint/PI).
- [ ] `RM-13` panel edits are optimistic, autosaved and roll back on failure; invalid range rejected; progress shown as stored.
- [ ] `RM-14` 48px rail with vertical text; state persists after a reload.
- [ ] `RM-15` re-sync: upload, diff, select, apply; notes, milestones and hand edits kept; conflicts listed.
- [ ] `RM-16` Save JSON shows the exact document with Copy and Download (served by the backend); Open JSON migrates v0 and shows plain errors.
- [ ] User-requested Milestones dialog (task 13):
  - add, edit and delete milestones and freeze windows;
  - edits autosave;
  - delete asks for confirmation;
  - focus is trapped and returned to the trigger;
  - fully keyboard-operable;
  - the PR names it as beyond the spec.
- [ ] `RM-1` Group by follows the user decision: Team and Epic work; Release is disabled.
- [ ] `RM-20` zoom steps, reset, Fit (rounded down), Ctrl/Cmd+wheel anchored at the pointer, Ctrl/Cmd `=` `-` `0`, per-view memory, horizontal only.
- [ ] ADR-3: `frontend/src/lib/timeline` and `backend/app/render/timeline.py` both pass `docs/fixtures/timeline/{sprints,months,pis}.json`.
- [ ] `make lint`, `make test` and `make e2e` (`roadmap.spec.ts` plus the existing journeys) pass.
- [ ] `gen:api` rerun after tasks 2 and 3, with the diff included. Alembic `0004` upgrades and downgrades. No `schemaVersion` bump; the reason (optional additive fields) is stated in the PR.
- [ ] Parity: three views and the collapsed panel compared at 1440×900 and 390×844; differences added to `docs/design/deviations.md`.
- [ ] No hardcoded colours: everything from `shared/design-tokens.json`. No new token values changed.
- [ ] Spec-versus-prototype differences are named in the summary (ASSUMPTIONs 2 and 3).
