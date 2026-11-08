# Prototype deviations

Intentional differences from `docs/design/prototype/index.html`, with the reason. Remove an entry when the gap closes.

## M1

| Where | Deviation | Reason |
|---|---|---|
| Top bar, all routes | A Settings gear (icon button, "Settings") sits at the right of the top bar. At 390px it and the save state wrap onto a third row. | G-4 needs a way to open Settings (display name for the `{user}` watermark token); the prototype has none. |
| `#roadmap`, `#swimlanes` | The page body is a placeholder with a temporary document-name field, not the editor. | The editors arrive in M3 (roadmap) and M4 (swimlane). The name field exercises autosave and the "Saved to `<file>`" state until then. |
| Top bar save state | File names are derived from the document name (slug + `.json`, or `.swimlane.json` for diagrams; `untitled` when empty), e.g. "Payments Platform H1 2027" → `payments-platform-h1-2027.json`. The prototype hard-codes names such as `payments-roadmap-h1-2027.json`. | The backend owns one safe naming rule (NF-3, `file_name_for` in `backend/app/services/documents.py`), so renaming a document renames its file. |

## M2

Captured with `capture.mjs home`, `import` and `map` at 1440×900 and 390×844 against a seeded scratch DB. The M1 Settings-gear row above still applies to these routes.

| Where | Deviation | Reason |
|---|---|---|
| `#home` lists | Rows have three lines (name, file name in mono, "Updated 8 Nov 2026") instead of a file name and date. | HOME-2 asks for name, file name and updated date; the documents have real names. |
| `#home` lists | Each row has a Delete icon button that opens a confirmation naming what gets unlinked. | M1 deferral; CLAUDE.md requires a confirmation for destructive actions. |
| `#home` lists | Real documents from the API (the prototype shows three canned rows each). | Real data; up to 5 rows each (ASSUMPTION in the M2 plan). |
| `#home` tiles | MUI icons instead of the prototype's inline SVGs; tile titles are 16px (`subtitle1`) instead of 15px. | MUI 7 is the stack's icon set; 16px is the nearest theme type step. |
| Top bar, all routes | The Roadmap and Swimlanes nav links briefly point at their fallbacks (`/import`, `/`) until the document lists load. | They now open the most recently updated document (M2 carry-over), which needs the list. |
| `#import` | The sample button reads "Use the sample export (55 issues)", not 148. | The count comes from the real sample file, `payments-export.csv`. |
| `#import` help | Step 3 reads "Drop the file here." instead of the prototype's "nothing is uploaded… in this prototype". | The app really uploads the file (IMP-3). |
| `#import` side panel | Saved roadmaps use the shared RecentDocumentList (up to 3 rows, name truncated, with an empty state). | One list component for Home and Import. |
| `#import` side panel | The mapping template is an MUI outlined Select with a floating "Mapping template" label, not a heading plus native select. | MUI-only styling; the label is the accessible name. |
| `#import` drop zone | The dashed border uses the `progressTrack` token and `radius.lg`, and keyboard focus shows a ring on the drop area. | Design tokens only; the real file input is visually hidden, so focus is shown on its label (NF-2). |
| `#import`, `#map` at 390 | The stepper wraps whole steps onto a second line. | Keeps each step's number and label together on a narrow screen (G-5). |
| `#map` lede | The lede shows the file size: `payments-export.csv · 10 KB · 55 issues · Jira CSV`. | IMP-1 asks for file name, size, detected format and row count (spec wins over the prototype). |
| `#map` table | Columns are listed in the file's order (Summary first) and sample values are shown raw (`16/Nov/26 12:00 AM`). | The real fixture's order and values; dates are parsed only when building the document. |
| `#map` table | Sniffed rows carry a "Check this" caption, and suggestion notes (for example "Used when Parent is empty") show as captions. | IMP-5 asks for sniffed suggestions to be confirmed; colour alone is not enough (NF-2). |
| `#map` table | Rows are about 50px tall instead of 47px. | MUI's small Select height. |
| `#map` table at 390 | The table scrolls horizontally inside its card; the Roadmap field column starts off-screen. | No page-level horizontal scroll (G-5). |
| `#map` badge | The complete "Auto-mapped N of N" badge uses an alpha tint of `success`. | No solid success-tint token exists. |
| `#map` status mapping | The last option is "New status…", which opens a name-and-colour dialog. | User decision 2026-11-08 (IMP-7 custom statuses). |
| `#map` empty and error states | Copy for "no statuses" and for an expired session ("That import has expired." with Upload again). | The prototype has no such states; every query needs a real empty state. |
| `#map` preview | Warnings use straight quotes and "→ Unscheduled" (not curly quotes and "→ Unscheduled tray"), plus "1 issue has no dates → excluded from its epic's range". | The protected fixture `payments-export.expected.json` defines the warnings. |
| `#map` preview | Warning text uses `text.secondary` instead of the prototype's brown. | Design tokens only; it keeps 4.5:1 contrast. |
| `#map` preview | Epics, Issues, Teams and the epic list show the sample's real numbers (15 / 55 / 4, "+ 10 more epics"). | Real data. |
| `#map` preview | The side panel is wider than the prototype's, and "What gets saved" shows the real document (with `id` and `mappingTemplateId`). | Live preview of the schema-v1 document (IMP-11). |
| `#map` action bar | "Save as" is read-only and follows the roadmap name. | User decision 2026-11-08: the file name is derived from the name. |
| `#map` action bar | Create is also disabled while the preview loads or the name is empty, with a helper such as "Map Key and Title to continue". | IMP-10, and no commit against a stale preview. |
| `#map` action bar at 390 | Back and Create stack into one full-width row. | G-5. |
| `#map` stepper | Step 3 "Preview & save" is current while the Create roadmap dialog is open. | ASSUMPTION: the prototype shows Map and Preview on one page. |
| `#map` dialog | The footnote reads "The JSON downloads now. Reopen it later with “Load .json from computer…”…". | The JSON is really downloaded from the backend. |
| `#map` copy | Epic wording ("epics", "+ N more epics") is kept even when "Roll stories up into their epic" is off. | ASSUMPTION: the items are still the roadmap's epics. |
