# Screen inventory

The clickable prototype at `docs/design/prototype/index.html` is the design reference for every screen: layout, spacing, copy, colours and interactions. It is one self-contained HTML file running on sample data. Open it directly in a browser, or run `npx serve docs/design/prototype` and go to `http://localhost:3000/#<route>`.

The PNGs in `screens/` were captured from the prototype at 1440×900 (mobile at 390×844) with the journey guide hidden. Use them for a quick visual check in reviews. When a PNG and the prototype disagree, the prototype wins; when the prototype and `docs/product-spec.md` disagree, the spec wins.

What the prototype only simulates: Jira parsing (the sample export is built in), file downloads (Save JSON shows the document; exports show a "ready" state), persistence (only panel open/closed state uses localStorage) and the re-sync diff. Everything else — timeline maths, zoom, the swimlane editor's routing, connect, resize, delete and undo — is real behaviour to match.

## Screens

| # | Route | Screenshot(s) | What to look at | Spec |
|---|---|---|---|---|
| 1 | `#home` | `01-home.png` | Recent roadmaps and diagrams, the two primary actions, empty-state copy | HOME-1..2 |
| 2 | `#import` | `02-import-upload.png` | Drop zone, accepted formats, "use sample export", mapping-template picker | IMP-1..3 |
| 3 | `#map` | `03-import-map.png` | Detected columns with confidence, "not mapped" and "needs a choice" rows, status mapping, roll-up rules, live JSON preview | IMP-4..11 |
| 3b | `#map` → Create | `03b-import-create-dialog.png` | Summary counts, unmapped-column warning, file name | IMP-12 |
| 4 | `#roadmap` (Months) | `04-roadmap-months.png` | Summary cards, group-by Team, milestone lines, Today line clear of the header, detail panel | RM-1..13 |
| 4 | `#roadmap` (Sprints) | `04-roadmap-sprints.png`, `04-roadmap-sprints-fit.png` | Sprint start/end dates on one line, IP sprint hatching, compact dates when zoomed out | RM-5, RM-8, RM-20 |
| 4 | `#roadmap` (PIs) | `04-roadmap-pis.png` | PI labels centred, sprint sub-columns | RM-7 |
| 4 | `#roadmap` panel | `04-roadmap-panel-collapsed.png` | 48px rail with vertical epic key/title | RM-14 |
| 4b | `#roadmap` → Re-sync | `04b-roadmap-resync-dialog.png` | Diff list, kept items, apply count | RM-15 |
| 5 | `#swimlanes` | `05-swimlane-editor.png` | Lanes, palette toolbar, zoom control, inspector, white export frame; **no watermark on screen** | SW-1..5, SW-17, SW-20 (no canvas watermark) |
| 5b | `#swimlanes` hover | `05b-swimlane-hover-picker.png` | Blue arrows 16px out from the shape; picker of shapes after 380 ms | SW-6, SW-8 |
| 5c | `#swimlanes` drag | `05c-swimlane-drag-connect.png` | Dashed preview while dragging from a handle onto another shape | SW-7 |
| 5d | `#swimlanes` right-click | `05d-swimlane-context-menu.png` | Connector context menu (edit label, reverse, delete) | SW-15 |
| 5e | `#swimlanes` shift-click | `05e-swimlane-multi-select.png` | Multi-select count and bulk delete in the inspector | SW-12, SW-15 |
| 5f | `#swimlanes` zoomed out | `05f-swimlane-zoomed-out-rail.png` | Zoom below 100%, inspector collapsed to its rail | SW-18..19 |
| 6 | `#swimlanes` → Export PDF | `06-swimlane-export-dialog.png` | Quick export dialog with watermark on: text tokens, position, opacity, colour | SW-20, EX-3 |
| 7 | `#export` (roadmap PDF) | `07-export-roadmap-pdf.png`, `09-roadmap-pdf-sprints.png` | Sprint columns with dates and boundaries, milestone legend, **no Today line** | EX-7..9 |
| 7b | `#export` (PPTX, per PI) | `07b-export-roadmap-pptx.png`, `08-pptx-slide-pi1.png`, `08b-pptx-title-slide.png`, `08c-pptx-epic-table.png` | Slide thumbnails, legend top-right, no footer, roadmap filling the slide, title and summary slides | EX-10..13 |
| 7c | `#export` → Export | `07c-export-ready.png` | Ready state with file name and size | EX-6 |
| 10 | mobile | `10-mobile-roadmap.png`, `10-mobile-swimlanes.png`, `10-mobile-export.png` | Toolbars wrap, side panels stack below, timeline and canvas scroll inside their frame | G-5 |

## The three journeys to walk

1. **Jira → roadmap → JSON → PPTX.** Home → Import → use sample export → map fields → Create roadmap → switch Sprints / Months / PIs → zoom and Fit → select an epic, edit dates in the panel → Save JSON → Export → Roadmap → PowerPoint → Per PI.
2. **Workflow across teams.** Swimlanes → hover a shape, pick a Decision from the arrow → drag a handle onto another shape to connect → drag a shape into another lane (lane grows) → right-click a connector → Delete → Undo → Export PDF with a "Confidential — {project}" watermark.
3. **Reuse.** Open JSON with `docs/examples/roadmap.example.json` (and the old `roadmap.v0.json`, which must migrate) → Re-sync from a newer export → review the diff → apply.

## Regenerating the screenshots

When the prototype changes, regenerate these PNGs with Playwright against the same viewport sizes, hiding the journey guide (`.guide [data-act="guide"][data-v="0"]`) first, and keep the file names — prompts and reviews refer to them by name.
