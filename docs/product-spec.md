# Product Studio — product specification (v1)

This document is the behaviour source of truth. Every requirement has an ID (for example `RM-12`). Reference these IDs in issues, PRs and tests. The look of each screen is defined by `docs/design/prototype/index.html`, which runs on sample data. Where this document and the prototype differ, this document wins.

**Personas.** The **Product manager (PM)** owns roadmaps and exports them for stakeholders. The **Process owner / BA** draws cross-team workflows. Both use one shared workspace. There are no accounts in v1.

**Global rules**

- `G-1` The app shell has a 56px top bar with the wordmark, the main navigation (Import, Roadmap, Swimlanes, Exports) and a save-state indicator on the right. The indicator reads "Saved to `<file>`" with a cloud icon, or "Unsaved changes".
- `G-2` Every change to a document autosaves to the backend (text debounced at 500 ms; selects, toggles and drops save immediately). "Save JSON" downloads the document file; it is not required to persist work.
- `G-3` Feedback uses bottom-centre snackbars. Snackbars for destructive actions carry an **Undo** action and stay for 6 s; others stay for 2.8 s.
- `G-4` Settings (gear in the top bar) hold the display name used by the `{user}` watermark token, the default PI cadence, and the default watermark preset.
- `G-5` Layouts work at 1440×900 and down to 390px wide. Toolbars wrap, side panels stack below content, and wide timelines and canvases scroll inside their own box.

---

## 1. Home (`#home` in the prototype)

- `HOME-1` Three tiles: **Import from Jira**, **Open a saved roadmap** (upload a `.json` file or pick a recent one), and **Swimlane diagrams**.
- `HOME-2` **Recent roadmaps** and **Swimlane diagrams** lists show the name, file name and last-updated date, with an Open action.

## 2. Import from Jira (`#import`, `#map`)

A three-step flow: **Upload → Map fields → Preview & save**, shown as a stepper.

### Upload
- `IMP-1` Accept Jira **CSV** (current or all fields), **JSON** (REST or JQL search export, including the `names` expansion) and **XML**, by drag-and-drop or file picker. Show the file name, size, detected format and row count.
- `IMP-2` Side panel: open a saved roadmap, either a recent one or a `.json` upload, which bypasses mapping. Also a **Mapping template** select (see `IMP-9`).
- `IMP-3` "How do I export from Jira?" disclosure with three short steps.

### Map fields
- `IMP-4` A table lists every *relevant* Jira column with a sample value and a **Roadmap field** select. The fields are Key, Title, Type, Epic, Swimlane/Team, Status, Sprint, Release, Points, Start, End, Tags and Don't import. Irrelevant columns are collapsed into "+N other columns ignored".
- `IMP-5` Columns are matched automatically. The order and rules are in the `jira-field-mapping` skill: saved template, then exact standard name, then alias, then value sniffing. Each match has a confidence. Name matches are mapped silently. Sniffed matches are pre-filled and highlighted for confirmation. Unmatched columns show an orange **Choose a field…** select. A badge reads "Auto-mapped N of M".
- `IMP-6` Repeated multi-value columns (Sprint, Labels, Components, Fix versions) are merged into one field. For Sprint, keep the most recent.
- `IMP-7` **Status mapping:** each distinct Jira status maps to a roadmap status (Not started, In progress, At risk, Done, plus custom ones), with a colour dot.
- `IMP-8` **Roll-up rules** (checkboxes):
  - roll stories up into their epic, so the bar spans the earliest start to the latest end;
  - use sprint dates when an issue has no start or due date;
  - put issues without dates in the Unscheduled tray;
  - turn Fix versions into milestones (off by default).
- `IMP-9` **Mapping templates:** saved per Jira site or project, they re-apply column choices by column name and by custom-field ID. "Update mapping template" is a checkbox in the action bar.
- `IMP-10` Key and Title must be mapped to continue. If neither Start/End nor Sprint is mapped, show a warning that items will go to Unscheduled.

### Preview & save
- `IMP-11` Preview panel:
  - counts of epics, issues and teams;
  - warnings, e.g. "9 issues have no dates → Unscheduled", "3 issues have no team → Unassigned lane", "Components isn't mapped yet";
  - the first five epics with their date ranges;
  - a **What gets saved** JSON preview of the document that updates live (`docs/data-model.md`).
- `IMP-12` Action bar: Roadmap name, Save-as file name (`.json`), Back, and **Create roadmap & save JSON**. That button opens a confirmation (file name, size estimate, number of unmapped columns), then creates the roadmap and opens it.

## 3. Roadmap editor (`#roadmap`)

### Toolbar and summary
- `RM-1` Source chip ("From Jira · imported 6 Nov 2026, 17:10" or "opened from `<file>`"), **Re-sync from new export**, timescale segmented control **Sprints / Months / PIs**, Group by (Team, Epic, Release), **Milestone lines** checkbox, the zoom control (`RM-20`), **Save JSON**, **Open JSON** and **Export…**.
- `RM-2` Summary cards: Issues done % (weighted by issue count), At risk (count and names), Next milestone (name, date, days to go), Current sprint (PI · S#, date range, days left, progress bar) and Unscheduled (count).

### Timeline
- `RM-3` Left column (220px): team header rows (colour square, name, "· N epics") and epic rows (Jira key in mono blue, title). Rows are 44px; team headers are 30px.
- `RM-4` **PI cadence:** each PI has N two-week sprints (default 6) and the last one is the **IP sprint** (Innovation & Planning). PI names and start dates are configurable (Settings and a "Manage PIs" dialog). Sprint names default to `S1…Sn` within each PI.
- `RM-5` **Sprint view:** two header rows. The top row is a PI band with the name centred; PIs clipped by the visible range are centred on the visible part. Each sprint shows "S3" plus its dates in the widest form that fits:
  - "2 Nov – 15 Nov" when the column is at least 96px;
  - "2–15 Nov" when it is at least 70px;
  - the start date only when it is at least 44px;
  - nothing below that.

  The full range is always available as a tooltip. The current sprint is highlighted in blue. IP sprints are hatched in the header and in a faint band down the body. PI boundaries are stronger lines.
- `RM-6` **Month view:** one header row with the month name (year on the first month and on January) and its PI underneath.
- `RM-7` **PI view:** the PI name with its date range, then a row of sprint ticks (S1…S5, IP), with the current sprint highlighted.
- `RM-8` Epic bars are positioned by date, coloured by status, with the title (ellipsis) and a thin white progress line. Clicking a bar or its row label selects it (outline ring plus a tinted row) and opens the detail panel.
- `RM-9` **Milestones row** under the header:
  - milestones are purple diamonds with a label ("Beta · 15 Jan");
  - the last milestone's label is right-aligned so it never overflows;
  - freeze windows are a hatched chip ("Code freeze", or "Freeze" when narrow).

  With **Milestone lines** on, each milestone draws a dashed purple line down the body and each freeze window draws a hatched band with dashed edges. The lines start below the milestones row.
- `RM-10` **Today:** a red line starts below the header, with a "TODAY · 6 Nov" label inside the milestones row. It must never overlap header text.
- `RM-11` **Unscheduled tray** under the timeline: chips for items without dates. Clicking a chip (or dragging it onto the timeline) schedules it in the next sprint. **Unschedule** in the detail panel moves an item back.
- `RM-12` Legend strip: the status colours, a progress line sample, IP sprint (Sprint and PI views) and a milestone line sample.

### Detail panel (right, collapsible)
- `RM-13` The panel shows:
  - the key, an editable title and **Open in Jira**;
  - Status and Team selects, and Start and End date inputs. Changing these moves the bar immediately; invalid ranges are rejected with a message.
  - "Runs PI 4 S4 → PI 1 S3 · crosses Beta";
  - progress from N Jira issues (done / in progress / to do), and stories for epics that have them;
  - **PM notes**, which are saved in the document and never sent to Jira;
  - Unschedule, and "Synced from Jira <time>".
- `RM-14` The panel collapses to a 48px rail. The rail shows the selected epic's key and title in vertical text. The open/closed state is remembered per browser.

### Re-sync and files
- `RM-15` **Re-sync from new export:** upload a newer Jira export (or reuse the mapping template), then show a diff of new items, removed items, and date, status and progress changes. Apply the selected changes. PM notes, milestones and manual edits are kept, and conflicts are listed.
- `RM-16` **Save JSON** shows the exact document, with Copy and Download. **Open JSON** loads a roadmap `.json` file, validates it, runs migrations and opens it. Errors are shown in plain language.

### Zoom
- `RM-20` Zoom control: **−**, percentage (click to reset to 100%), **+** and **Fit**. The range is 50–300%, with steps 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250 and 300. Ctrl/Cmd + wheel or pinch zooms continuously around the pointer. Ctrl/Cmd `=` / `-` / `0` work too. Zoom scales the timeline horizontally only. Each timescale remembers its own zoom. **Fit** fits all columns to the visible width.

## 4. Swimlane editor (`#swimlanes`)

A draw.io-style editor for cross-team business workflows.

### Canvas model
- `SW-1` A diagram has horizontal lanes (vertical lanes later). Each lane is one team or role, with a name column on the left (104px). Lanes have alternating tints from the design tokens. The white **frame** (title, subtitle "v3 · Owner · N teams", shape legend, lanes, footer) is exactly what gets exported.
- `SW-2` Shape types:

  | Type | Size (px) |
  |---|---|
  | Start | 40×40 circle |
  | End | 40×40 circle, thick border |
  | Task | 136×64 rounded |
  | Decision | 136×88 diamond |
  | Sub-process | 136×64, with a ⊞ marker |
  | Document | 136×64, wavy bottom |
  | Data store | 120×72 cylinder |
  | Note | 184×64, folded corner |

  Tasks have a label and an optional sub-label.
- `SW-3` **Lanes grow with their shapes.** A shape keeps its own vertical offset in its lane. Lane height is the larger of 132px and the bottom of its lowest shape plus 34px. The diagram width is the larger of 1016px and the right edge of its right-most shape plus 48px. Lanes shrink back when shapes move up.
- `SW-4` Manual sizing: drag a lane's bottom edge to make it taller, or the diagram's right edge to make it wider. Neither can go below the size that fits the shapes. **Shrink lanes to fit** removes extra space.

### Creating and connecting (draw.io behaviour)
- `SW-5` Shape toolbar: Select, Connector, Start, End, Task, Decision, Sub-process, Document, Data store, Note, **+ Add lane**. Pick a shape, then click inside a lane to place it, centred on the click and snapped to 8px. The palette shows a hint ("Click inside a lane to place a Task").
- `SW-6` **Hover handles:** hovering a shape (or selecting it) shows four blue arrow handles, 16px outside each side's midpoint.
- `SW-7` **Drag a handle** for a dashed blue preview line that follows the pointer.
  - Over another shape (within 10px), the target highlights, shows its four anchors, and the line snaps to the **nearest side**. Dropping creates the connector.
  - Dropping in empty lane space creates a new Task there, already connected.
  - Esc cancels.
- `SW-8` **Hover a handle for about 380 ms** to open a **shape picker** beside it ("Add below “Refund received”"). It offers Task, Decision, Sub-process, Document, Data store, Note and End. Choosing one adds it in that direction, connected, with its label selected for typing. The picker closes when the pointer leaves for about 280 ms, or on Esc or scroll.
- `SW-9` **Click a handle** (no drag) to add a copy of the current shape's type in that direction, connected. Start and End add a Task.
  - Right or left: same lane, centre-aligned, 64px gap.
  - Down or up: the next lane, or, in the last lane, the same lane below the shape, which grows the lane.
  - The new shape skips past existing shapes until it finds free space.
- `SW-10` The **Connector** tool is also available: click the source shape, then the target.
- `SW-11` **Routing:** connectors are orthogonal. They leave the middle of a side and enter the middle of a side.
  - When the simple route would cross another shape, detour through a lane gutter (14px inside a lane's top or bottom edge), choosing the shortest clear path.
  - Arrowheads are filled.
  - Labels (Yes / No / custom) sit beside the first segment; "No" is red and "Yes" green.
  - Association lines are dashed, with no arrowhead.

### Selecting, editing, moving, deleting
- `SW-12` Click a shape to select it (blue ring plus handles). Shift-click adds or removes shapes from the selection. Ctrl/Cmd+A selects all. Click empty canvas to clear the selection.
- `SW-13` Drag a shape to move it anywhere, including into another lane. It snaps to 8px. The target lane is the one under the pointer *ignoring the dragged shape's own growth*, so dragging into the next lane always works. Connectors follow. The ← → ↑ ↓ buttons in the inspector nudge by 16px.
- `SW-14` Click a connector to select it. Its click area is 14px wide and trimmed 28px from each end, so shape handles stay usable. Hit areas sit above shapes, so short connectors are always clickable.
- `SW-15` **Delete** from any of these:
  - the floating mini-toolbar above a selected shape (Duplicate, Delete) or the round delete button beside a selected connector;
  - the right-click menu:
    - on a shape: Edit label, Duplicate, Delete;
    - on a connector: Edit label, Reverse direction, Delete connector;
    - on the canvas: Select all, Undo;
  - the Delete or Backspace key;
  - the toolbar Delete button;
  - the inspector.

  Deleting a shape removes its connectors. The snackbar says how many ("Deleted “Post to ledger” and 2 connectors") and offers **Undo**.
- `SW-16` **Undo** keeps at least 60 steps (Ctrl/Cmd+Z and the toolbar button). It covers add, delete, move, connect, duplicate, reverse, lane add/reorder/resize and width resize. Duplicate (Ctrl/Cmd+D) places the copy to the right, in free space.

### Inspector (right, collapsible)
- `SW-17` Tabs **Shape | Lanes | Diagram**:
  - **Shape:** type, Label, Sub-label, Lane, Owner/role, Fill swatches, Linked Jira issue, Connections (in/out list), **Add connected step** (direction toggle plus the seven shape buttons, the keyboard-friendly twin of `SW-8`), Move buttons and Delete.
  - **Connector** (when a connector is selected): From → To, Label, Line (Flow → / Association ⋯), Leaves from / Arrives at sides, Reverse and Delete.
  - **Multi-selection:** "N shapes selected", the list, and Delete N shapes.
  - **Lanes:** orientation, rename (live), reorder, add, "Pull team names from the roadmap", and Shrink lanes to fit.
  - **Diagram:** Name, Owner, Linked roadmap, version and history, and saved diagrams.
- `SW-18` The inspector collapses to a rail with tab icons. Clicking an icon opens that tab. The rail shows the current selection, and the state is remembered.

### Zoom, files, export
- `SW-19` Zoom is 25–250% and scales the whole diagram. It uses the same control, gestures and keyboard shortcuts as `RM-20`. **Fit** fits the frame to the canvas width. Zooming keeps the point under the pointer still. All editing works at any zoom.
- `SW-20` **The watermark is never shown on the canvas.** Export PDF and Export PNG open an **export dialog** with:
  - a live preview;
  - Format (PDF: page size A4, Letter or A3, plus orientation; PNG: 1×, 2× or 3×);
  - **Add watermark** (off by default): text with tokens, Diagonal / Tiled / Corner position, opacity 5–50%, colour;
  - an "Exported by…" footer toggle;
  - **More export options** (opens the Exports page), Cancel, and Export.
- `SW-21` Save JSON shows the diagram document, including lane sizes, shape positions and resolved connector points. A new diagram can start from the roadmap's teams or from three blank lanes.

## 5. Exports (`#export`)

### Sources, formats, options
- `EX-1` Two sources:
  - **Roadmap:** in the Sprint, Month or PI view, as PDF, PNG or **PowerPoint**.
  - **Swimlane diagram:** PDF or PNG.

  Switching to a swimlane while PowerPoint is selected falls back to PDF.
- `EX-2` Options by format:
  - **PDF:** page size A4, Letter or A3; landscape or portrait.
  - **PNG:** resolution 1×, 2× or 3× (1600, 3200 or 4800px wide); white or transparent background.
  - **PPTX:** see `EX-10`.
- `EX-3` **Watermark** (off by default):
  - presets: Confidential, Draft or Company logo, plus saved custom ones;
  - type: text or image (PNG or SVG upload);
  - text tokens `{project}`, `{user}` and `{date}`, each with an insert chip;
  - position: Diagonal, Tiled (3×4) or Corner;
  - opacity 5–50% (corner placement uses three times the opacity, capped at 100%);
  - colour: red, grey, blue or black;
  - **Save as preset**, and "Use these settings for all exports".

  The watermark is drawn *into* the file (vector in PDF and PPTX), never as an overlay.
- `EX-4` "Exported by `<name>` on `<date>`" footer toggle, for PDF and PNG.
- `EX-5` The preview is rendered by the backend export renderer, debounced at 300 ms, so the preview matches the file. The file name pattern is shown, e.g. `payments-h1-2027-roadmap-sprints_2026-11-06.pdf` or `refund-flow-swimlane_2026-11-06.png`.
- `EX-6` Export runs with a progress dialog, then "Export ready" with format, watermark and footer summary, and the file downloads. **Recent exports** lists the file, source, watermark and time, with a Download action (files are kept for 30 days).

### Roadmap export content
- `EX-7` The exported roadmap chart has:
  - a header in the selected view. The Sprint view has a PI band row and sprint cells with "S3" and "2 Nov – 15 Nov". The current sprint is tinted and IP sprints are hatched.
  - **a boundary line for every column** through the whole chart, stronger at PI edges, with row separators, light zebra rows and an outer border;
  - a milestones row with **M1, M2…** diamond tags, a **CF** tag over freeze windows, and dashed lines *behind* the bars;
  - epic rows with key, title, a bar with title and progress %, and arrows when a bar runs past the visible range;
  - **no Today line and no Today legend entry.**
- `EX-8` **Legend:** PDF and PNG put it under the chart, in three rows:
  - Milestones: "M1 Beta launch · 15 Jan 2027", "M2 …", "CF Code freeze · 15–31 Mar 2027";
  - Status: the colours and the progress line;
  - Sprints (Sprint and PI views only): IP sprint, current sprint with its dates, and PI boundary.

  The legend wraps onto more lines when the page is narrow.
- `EX-9` **Fit to space:** the chart fills the area available on the page or slide. Epic rows absorb spare height (0.72–2.6× their base height); team rows stay compact (0.8–1.25×). The timeline then widens or narrows to match the target aspect ratio. No empty bands.

### PowerPoint (roadmap only)
- `EX-10` PowerPoint options:
  - Slide size: Widescreen 16:9 or Standard 4:3.
  - Roadmap slides: **Single** (the whole roadmap) or **Per PI** (one slide per PI, showing only that PI's epics and milestones).
  - Optional slides and notes:
    - **Title slide:** name, view, range, counts (epics, at risk, PIs, milestones), source, and the exported-by line when the footer is on.
    - **Epic summary table:** key, epic, team, status, start, end and progress bar, sorted by start.
    - **Speaker notes:** epic status and risks.
- `EX-11` Slides have **no footer**. Each roadmap slide has the title and subtitle top-left and a **compact legend top-right**. The legend lists the milestones in range plus the status, IP-sprint and current-sprint keys. The chart fills the rest (`EX-9`).
- `EX-12` Shapes, text, legend and table are **native, editable PowerPoint objects** (not one image). The watermark appears on every slide.
- `EX-13` Preview: the selected slide is shown large, with a thumbnail strip of all slides, and a summary such as "PowerPoint · Widescreen 16:9 · 5 slides · speaker notes included · editable shapes".

## 6. Non-functional

- `NF-1` **Performance:**
  - The roadmap supports 300 epics and 13+ sprints at 60 fps scroll and zoom.
  - The diagram supports 200 shapes and 300 connectors with drag at 60 fps; recompute only the moved shape's connectors while dragging.
  - Exports take under 5 s for those sizes.
- `NF-2` **Accessibility:** WCAG 2.1 AA. Keyboard access to every action (see `SW-12`–`SW-19`); a visible focus ring; `aria-pressed` on toggles; `role="menu"` for the context menu and picker; text contrast ≥ 4.5:1, including 11px labels.
- `NF-3` **Data safety:** documents validate against Pydantic schemas. Uploads are limited to 20 MB. CSV/JSON/XML parsing never executes content (use defusedxml, no eval). Exported file names are sanitised.
- `NF-4` **Privacy:** the app never sends data to Jira in v1. "Open in Jira" is a plain link built from a configurable base URL.

## 7. Out of scope for v1

Authentication and permissions, live Jira API sync (export files only), real-time collaboration, vertical swimlanes (the toggle is shown disabled with "Coming soon"), and multi-page PDF tiling (v1 fits to one page).
