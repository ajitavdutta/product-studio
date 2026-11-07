---
name: export-rendering
description: How Product Studio renders exports — roadmap and diagram SVG, column boundaries, milestone tags and legends, fit-to-space layout, watermark (text/image, diagonal/tiled/corner, tokens), PDF/PNG via CairoSVG, PPTX via python-pptx with native shapes, previews and file names. Use for any work in backend/app/render, backend/app/exports or the export screens.
---

# Export rendering

Requirements: `EX-1`–`EX-13`, `SW-20`. Architecture: ADR-1, ADR-6.

## Pipeline
```
document ──▶ render/*.py ──▶ SVG (deterministic) ──▶ watermark.apply ──┬─▶ CairoSVG → PDF / PNG
                    │                                                    └─▶ preview (SVG pages)
                    └─▶ fit.layout(...) numbers ──▶ exports/pptx.py (python-pptx native shapes)
```
- Fonts: register `Roboto` and `Roboto Mono` from `app/exports/fonts/` with fontconfig in the Docker image. Every SVG uses `font-family="Roboto"`.
- Colours: `render/theme.py` loads `shared/design-tokens.json`.
- Output is deterministic: format floats with `:.2f`, use stable ids, and embed no dates except the document's own.

## Roadmap chart (`render/roadmap_svg.py`)
Constants: label column `LW = 250`, base timeline `TW = 1150`, header `HD = 58`, milestones row `MR = 24`, base epic row `ER = 34`, team row `GR = 26`.
- **Header:** the cells of the selected view come from `timeline.py`. Sprint view: a PI band row (bold, centred) and sprint cells with `S3` and `2 Nov – 15 Nov`; use compact dates when narrow (see `roadmap-timeline`). The current sprint is filled `#e3f2fd`, IP cells use a hatched pattern, and every header cell is stroked.
- **Column boundaries:** draw one line per column edge from the header bottom to the body bottom. PI edges are 1.6px `#90a4ae`; other edges are 1px `#cfd8dc`. Add row separators, zebra epic rows, team rows tinted `#eef1f3`, a label-column divider and an outer frame.
- **Layers, bottom to top:**
  1. zebra rows;
  2. IP bands;
  3. the freeze band;
  4. column lines;
  5. row lines;
  6. milestone lines (dashed purple, so they sit **behind the bars**);
  7. labels and bars;
  8. milestone tags (diamond + `M1`, `M2`…; `CF` over freeze windows);
  9. the frame.
- **No Today** in exports.
- **Bars:**
  - `bh = min(rowH − 12, 30)`, centred in the row;
  - a 2.5px white progress line;
  - the title truncated to fit, plus `NN%` at the right when `w > 70`;
  - `◂` / `▸` arrows when the bar is clipped by the range.
- **Per-PI range** (PPTX Per PI): include only items overlapping the range. Drop empty teams, and show only the milestones and freeze windows inside the range.

## Legend
- **PDF/PNG** (`legend.py`), under the chart, with three labelled rows: MILESTONES (M1…, CF), STATUS (four colours plus the progress line), and SPRINTS (Sprint and PI views: IP sprint, current sprint with its dates, PI boundary). Item width is about `26 + chars*6.1 + 22`. **Wrap** onto a new line at `x > W − 4` and return the height so the fit maths can use it.
- **Slides:** a compact block top-right beside the title. Row 1 lists the milestones in range; row 2 lists the statuses, IP sprint and current sprint. It is at most 62% of the slide width and right-aligned.

## Fit to space (`fit.py`, `EX-9`)
Inputs: rows, view, legend height, target aspect `A` (available width / height of the page or slide content box).
```
for pass in (0, 1):                       # pass 2 re-measures legend height at the new width
    W0 = LW + TW + 2;  fixed = HD + MR + legendH;  avail = W0 / A − fixed
    GR = 26 * clamp(avail / (nE*34 + nG*26), 0.8, 1.25)       # team rows stay compact
    ER = 34 * clamp((avail − nG*GR) / (nE*34), 0.72, 2.6)     # epic rows take the slack
    Hused = fixed + nG*GR + nE*ER
    TW = max(600, round(Hused * A) − LW − 2)                  # then match the aspect
```
The content box aspects come from the page or slide layout, for example 16:9 with title and legend about 2.13, 4:3 about 1.5, and A4 landscape minus the title block. The backend computes them from the same layout constants the preview uses.

## Diagram (`render/diagram_svg.py`)
Draw the stored geometry exactly (`SW-21`):
- lanes with tints and the label column;
- connectors from `points`, with a filled arrow for flow and dashed with no head for association;
- labels: Yes green, No red, others grey;
- shapes by type (see `swimlane-editor`).

The frame header has the title, the subtitle "v3 · Owner · N teams" and the shape legend.

## Watermark (`watermark.py`, `EX-3`)
- **Tokens:** `{project}` is the roadmap name or the linked roadmap's project, `{user}` is the Settings display name, and `{date}` is the export date formatted as `06 Nov 2026`.
- **Diagonal:** centred, rotated −28°, letter-spacing 0.15em, font size `min(6, 96/len)%` of the page width.
- **Tiled:** a 3×4 grid of rotated text at 1.6% of the width.
- **Corner:** bottom-right, inset 4% and 6%, size 1.5% of the width, opacity `min(1, op*3)`.
- **Image:** the uploaded asset, at most 40% of the page (diagonal), 12% (corner) or 60% of a tile (tiled), with the same opacity.
- SVG: one `<g opacity>` group at the end of the document. PDF stays vector.
- PPTX: a rotated text box with fill alpha, set through the XML `<a:alpha val="14000"/>`, or a picture with transparency, added to **every** slide as the last shape.

## PowerPoint (`exports/pptx.py`, `EX-10`–`EX-13`)
- Slide sizes: 16:9 is `13.333in × 7.5in` and 4:3 is `10in × 7.5in`. Margins are 3.2% of the width.
- Slides:
  1. Title slide (optional): a blue accent bar, "PRODUCT ROADMAP", the name, view and range, four counters, the source line, and the exported-by line when the footer is on.
  2. Roadmap: one slide (Single), or one per PI touching the range (Per PI).
  3. Epic summary table (optional): a native `table` sorted by start, with a status dot and a progress bar drawn as two rectangles.
- **No footer, slide numbers or date placeholders.** Delete any placeholders that the layout adds.
- Roadmap slides: the title and subtitle top-left, the legend group top-right, and the chart as **native shapes** (rectangles, lines, text boxes) laid out with `fit.py` for that slide's content box. Group the chart.
- Speaker notes (optional) per roadmap slide: at-risk epics, epics crossing milestones, and unscheduled count.

## Files and previews
- Preview: `POST /api/exports/preview` returns `{pages: [svg], fileName, summary}`. For PPTX, `pages` holds one SVG per slide, rendered from the same layout.
- File names:
  - `<roadmap-slug>-roadmap-<view>_<yyyy-mm-dd>.<ext>`;
  - `<diagram-slug>-swimlane_<yyyy-mm-dd>.<ext>`.
- PNG width is `1600 × scale`, with the height following the aspect. PDF is one page fitted to the page box (multi-page tiling is out of scope).

## Edge cases to test
- An empty roadmap (it shows "No scheduled items").
- A team with no items (hidden in Per PI, shown elsewhere).
- Only undated items.
- A 120-character title.
- A range wider or narrower than the items.
- 300 epics (`ER` clamps at 0.72 and the timeline widens).
- A diagram with 0 connectors.
- A watermark text of 1 or 80 characters.
- A transparent PNG background with the image watermark.
