---
name: document-format
description: The roadmap and swimlane JSON document formats, schemaVersion migrations, lossless .json round-trip, autosave PATCH and validation errors. Use when changing document shapes, Save/Open JSON, import-json, autosave, or migrations.
---

# Document format

Reference: `docs/data-model.md`, examples in `docs/examples/`.

## Rules
- The Pydantic models in `backend/app/schemas/documents.py` are the source. TypeScript types are generated (`pnpm gen:api`), never hand-written.
- `schemaVersion` is an integer. **Any** change that an older client would misread bumps it:
  - a rename, a removal, or a meaning change;
  - a new required field.

  Optional, additive fields do not.
- Migrations live only in `app/documents/migrations.py`: `MIGRATIONS[N] = fn(dict) -> dict` (N → N+1). `load_document(raw)` runs the migrations, then `model_validate`. Never mutate the input dict.
- **Round-trip is lossless:** `GET /document`, then upload with `POST /import-json`, gives an equal document, except a new `id` when importing as a copy. Test this for both kinds.
- Diagram documents carry resolved geometry (lane `height`, `width`, shape `x`/`y`, connector `points`). The backend checks that:
  - points are orthogonal;
  - the first point is on the `from` anchor and the last on the `to` anchor, within 1px;
  - lane heights are at least 132.

  If a check fails, reject with a 422 that lists the connector ids.

## Autosave
- The frontend sends `PATCH /api/{kind}s/{id}` with `{baseVersion, ops: [{op: "set"|"insert"|"remove"|"move", path, value?, position?}]}`.
- The server applies the ops in a transaction, increments `revision`, and returns `{revision}`.
- On a `409` (stale `baseVersion`), the client refetches, re-applies its pending local ops, retries once, and then shows "Couldn't save — reloaded the latest version".

## Validation errors (Open JSON / import-json)
Show plain language, never a Pydantic dump. For example: "This file is a swimlane diagram, not a roadmap", "This file was made by a newer version of Product Studio", or "Item PAY-142 has an end date before its start date".
