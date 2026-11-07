---
paths:
  - "backend/app/render/**"
  - "backend/app/exports/**"
  - "frontend/src/features/export/**"
  - "backend/tests/render/**"
---

# Export rules

Load the `export-rendering` skill before editing these files.

- Previews and files come from the same backend functions (ADR-1). The frontend export UI only sends options and shows the returned SVG pages.
- Roadmap exports never draw a Today line or a Today legend entry (`EX-7`).
- Slides have no footer, and the legend sits top-right (`EX-11`). PDF and PNG put the legend under the chart and wrap it (`EX-8`).
- The chart fills its content box through `fit.py` (`EX-9`).
- Watermarks are drawn into the output, off by default, and never on the editing canvas (`SW-20`).
- Colours come only from `render/theme.py`, which reads `shared/design-tokens.json`.
