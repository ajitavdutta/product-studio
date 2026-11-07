---
name: roadmap-timeline
description: The date-to-column maths shared by the roadmap editor (TypeScript) and the export renderer (Python) — PI cadence, sprints and IP sprints, Sprint/Month/PI views, header labels, compact sprint dates, milestones, freeze bands, Today, zoom and Fit. Use when touching the roadmap timeline, its header, zoom, or roadmap exports.
---

# Roadmap timeline

Requirements: `RM-3`–`RM-12`, `RM-20`, `EX-7`. Must pass `docs/fixtures/timeline/*.json` in **both** `frontend/src/lib/timeline` and `backend/app/render/timeline.py`.

## Model
- Work in **day offsets** from `timeline.start` (in the fixtures, `2026-11-01` is day 0). Each item uses `[s, e)`, where `e` is the inclusive end date plus 1.
- **PI cadence:** `pi.start + j*14` gives sprint `j` (0-based) for `j < pi.sprints`. The last sprint is IP when `pi.ipSprint`. A PI lasts `sprints*14` days. Sprint labels are `S{j+1}`, or `S6 · IP`, or `pi.sprintNames[j]`.
- The **current sprint** is the one containing TODAY (fixture: 2026-11-06, day 5). TODAY is injectable for tests.

## Views (range `[R0, R1)`, fraction `f(d) = (clamp(d) − R0) / (R1 − R0)`)

| View | Default range | Header rows | Column boundaries |
|---|---|---|---|
| Sprints | first sprint touching the roadmap start → 13 sprints | PI band (22px, name centred on its *visible* part) + sprint cells (33px): `S3` + dates | every sprint; PI starts stronger |
| Months | first month → last month of items | one 56px row: month name (`Nov 2026`, `Jan 2027`, others bare) + PI containing the month's midpoint | every month |
| PIs | whole PIs covering the items | PI (34px: name + "5 Oct – 27 Dec") + sprint ticks (21px: S1… IP) | PI starts strong, sprint ticks faint |

Columns are proportional to days, not equal-width.

## Sprint date labels (`RM-5`)
The column width `colW` is in CSS pixels after zoom.

| colW | Label |
|---|---|
| ≥ 96 | `2 Nov – 15 Nov` |
| ≥ 70 | `2–15 Nov` (same month) / `30 Nov–13 Dec` |
| ≥ 44 | `2 Nov` |
| < 44 | (none) |

The tooltip always has the full `PI 4 · 2026 · S3 · 2 Nov – 15 Nov`.

## Positions
- Bar: `left = L(s) + 2px` and `width = W(s, e) − 4px`, where `L(d) = 220px + (100% − 220px) * f(d)`.
- Milestone diamond centres on `L(d)`. The **last** milestone label is right-aligned (`right = (100% − 220px)*(1 − f(d)) − 9px`) so it never overflows.
- **Freeze** band: `L(s) … L(e)`, labelled "Code freeze", or "Freeze" when the band is 76px or narrower.
- Lines (with "Milestone lines" on) start *below* the milestones row: `top = headerHeight + 34`. Draw a freeze band with dashed edges, and milestones as 2px dashed purple.
- **Today**: the line starts below the header (`top = headerHeight`). The label "TODAY · 6 Nov" sits inside the milestones row at `L(today) + 5px`. It must never overlap header text.

## Zoom (`RM-20`)
- Horizontal only, per view, in the range 0.5–3.
- Steps: 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3.
- Ctrl/Cmd+wheel uses a continuous factor `exp(−deltaY * 0.004)`, with `deltaY` clamped to ±60.
- Width: `width: calc(220px + (100% − 220px) * z)` and `minWidth = 220 + (baseMinW − 220) * z`, where `baseMinW = 220 + 13*104` in the Sprint view and 900 otherwise.
- **Fit**: `z = floor(((cw − 220) / (max(cw, baseMinW) − 220)) * 1000) / 1000`. Round **down**, otherwise you get a 1–6px scrollbar.
- Anchor-preserving: before zooming, compute `pos = (scrollLeft + ax − 220) / (oldW − 220)`. After the re-render, set `scrollLeft = 220 + pos*(newW − 220) − ax`.

## Export differences (`EX-7`)
- No Today line or label.
- Milestones are tagged `M1`, `M2`… in date order, and freeze windows `CF`.
- The full legend is described in `export-rendering`.

## Fixture format (`docs/fixtures/timeline/<view>.json`)
```json
{"today":"2026-11-06","view":"sprints","range":{"start":"2026-11-02","endExclusive":"2027-05-03"},
 "pis":[{"name":"PI 4 · 2026","start":"2026-10-05","end":"2026-12-27"}],
 "columns":[{"row":"pi","label":"PI 4 · 2026","start":"2026-11-02","endExclusive":"2026-12-28","clipped":true}, {"row":"sprint","label":"S3","dates":"2 Nov – 15 Nov","start":"2026-11-02","endExclusive":"2026-11-16","current":true,"ip":false}],
 "compactDates":[{"colW":120,"label":"2 Nov – 15 Nov"},{"colW":80,"label":"2–15 Nov"},{"colW":50,"label":"2 Nov"},{"colW":30,"label":""}]}
```
