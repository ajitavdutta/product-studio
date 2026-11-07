# Prototype deviations

Intentional differences from `docs/design/prototype/index.html`, with the reason. Remove an entry when the gap closes.

## M1

| Where | Deviation | Reason |
|---|---|---|
| Top bar, all routes | A Settings gear (icon button, "Settings") sits at the right of the top bar. At 390px it and the save state wrap onto a third row. | G-4 needs a way to open Settings (display name for the `{user}` watermark token); the prototype has none. |
| `#roadmap`, `#swimlanes` | The page body is a placeholder with a temporary document-name field, not the editor. | The editors arrive in M3 (roadmap) and M4 (swimlane). The name field exercises autosave and the "Saved to `<file>`" state until then. |
| Top bar save state | File names are derived from the document name (slug + `.json`, or `.swimlane.json` for diagrams; `untitled` when empty), e.g. "Payments Platform H1 2027" → `payments-platform-h1-2027.json`. The prototype hard-codes names such as `payments-roadmap-h1-2027.json`. | The backend owns one safe naming rule (NF-3, `file_name_for` in `backend/app/services/documents.py`), so renaming a document renames its file. |
