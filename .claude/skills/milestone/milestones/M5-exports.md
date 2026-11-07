<!-- Brief for /milestone M5: M5 — exports: backend SVG renderer for roadmap and diagram, legend, fit-to-space, watermark, PDF/PNG (CairoSVG), PPTX (python-pptx), preview endpoint, export history; Exports page and the swimlane export dialog. -->

# M5 · Exports

Load `export-rendering`, `roadmap-timeline` and `prototype-parity`. Prototype routes:
- `#export`: switch Roadmap or Swimlane; PDF, PNG or PowerPoint; Single or Per PI; watermark on.
- `#swimlanes`: Export PDF opens the dialog.

Requirements: `EX-1`–`EX-13` and `SW-20`.

**export-engineer** owns the backend:
1. `render/theme.py` (reads the tokens), `render/legend.py` (wrapping), `render/fit.py` (the two-pass layout), `render/roadmap_svg.py` (column boundaries, M1/M2/CF tags, lines behind bars, no Today, per-PI ranges), `render/diagram_svg.py` (stored geometry) and `render/watermark.py` (tokens; diagonal, tiled, corner and image).
2. `exports/pdf.py` and `exports/png.py` (CairoSVG, page sizes, scale, transparent background) and `exports/pptx.py`:
   - Single or Per PI slides, the title slide, the summary table and speaker notes;
   - the legend top-right, **no footer**, native shapes, and the watermark on every slide.
3. Endpoints: `POST /api/exports/preview`, `POST /api/exports` (stream the file plus a history row) and `GET /api/exports[/{id}/file]`.
4. The golden SVG, PPTX, PDF and PNG tests listed in `.claude/agents/export-engineer.md`.

**frontend-engineer** owns the screens:
1. `features/export/ExportsPage.tsx`:
   - source and view, format cards (PowerPoint only for the roadmap), and options per format;
   - the watermark panel (presets, text/image, token chips, position tiles, opacity, colour, Save as preset, use for all);
   - the footer toggle;
   - the preview (debounced at 300 ms) with a slide thumbnail strip for PPTX;
   - the progress and "Export ready" dialog, and Recent exports.
2. `features/swimlane/ExportDialog.tsx`: the compact dialog with **Add watermark** off by default and **More export options**.

## Done when
- The roadmap PDF in the Sprint view shows sprint names with dates, every column boundary, the M1/M2/CF legend and no Today line.
- The PPTX Per-PI deck opens in PowerPoint with editable shapes, the legend top-right, no footer, and the chart filling the slide.
- A diagram PNG at 2× is 3200px wide, with a watermark only when it was ticked.
