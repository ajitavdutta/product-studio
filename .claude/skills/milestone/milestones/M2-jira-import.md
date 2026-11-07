<!-- Brief for /milestone M2: M2 — Jira import: upload CSV/JSON/XML, detect and map columns (templates, aliases, value sniffing, repeated columns), status mapping, roll-up, preview and create the roadmap. Also the Home screen. -->

# M2 · Jira import and Home

Load `jira-field-mapping` and `prototype-parity`. Prototype routes: `#home`, `#import`, `#map`. Requirements: `HOME-1`, `HOME-2` and `IMP-1`–`IMP-12`.

- **Backend:** `app/importers/jira/` with:
  - `detect_format`;
  - `read_csv`, `read_json`, `read_xml` (streaming; defusedxml);
  - `normalise_name`;
  - `suggest_mapping` (template → exact → alias → sniff, with confidence);
  - `merge_repeated_columns`;
  - `map_statuses`;
  - `build_items` (roll-up and progress);
  - `warnings`.

  Endpoints: `POST /api/imports/jira`, `/{id}/preview`, `/{id}/commit`. Test every fixture in `docs/fixtures/jira/`, plus the edge cases in `.claude/agents/test-engineer.md`.
- **Frontend:** `features/import/` with a three-step stepper.
  - **Upload:** drop zone, detected format, row count, "Use the sample export", the saved-roadmap list, the template select, and the "How do I export from Jira?" disclosure.
  - **Map:** a table with confidence styling (sniffed rows highlighted, unmatched rows orange), the "Auto-mapped N of M" badge, "+N other columns ignored", status mapping and roll-up rules.
  - **Preview:** counts, warnings, the first five epics, and the live "What gets saved" JSON.
  - **Action bar:** name, file name, Update template, Back, and Create & save, with a confirmation dialog.
- **Home:** three tiles plus the recent roadmaps and diagrams lists.

## Done when
- Importing `docs/fixtures/jira/payments-export.csv` produces exactly `docs/fixtures/jira/payments-export.expected.json`: the mapping, roll-up dates and progress, unscheduled epics and warnings.
- The Playwright journey "import sample → fix Components → create" passes.
