---
paths:
  - "**/tests/**"
  - "**/__tests__/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "frontend/e2e/**"
---

# Test conventions

- Name tests after requirement IDs: `test_EX_7_no_today_line_in_export`, `it('SW-15 deletes a shape and its connectors with undo')`.
- Freeze today at **2026-11-06**, through `app/core/clock.py` (backend) or `vi.setSystemTime` (frontend).
- Shared timeline fixtures in `docs/fixtures/timeline/` are read-only inputs for **both** test suites.
- Golden SVGs live in `backend/tests/render/golden/`. Update them with `pytest --update-golden` and only on purpose. Explain the change in the PR.
- Never assert exact PDF, PNG or PPTX bytes. Assert structure: page count and size, image dimensions, slide count, shapes and text.
- Playwright: use `getByRole` and `getByLabel` selectors, not CSS classes. Run at 1440×900, plus one 390×844 smoke test per journey.
