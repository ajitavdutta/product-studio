---
paths:
  - "backend/**"
---

# Backend conventions

- **Layers:** `api/routers` (thin) → `services` (logic) → `repositories`/`models` (SQLAlchemy). Routers never touch the session directly.
- **Schemas:** `<R>Create`, `<R>Update` (all fields optional) and `<R>Read` (`model_config = ConfigDict(from_attributes=True)`). Use `Field(..., description=)` on public fields; it becomes the OpenAPI docs the frontend relies on.
- **Errors:** raise `HTTPException(status_code, detail="<plain sentence the UI can show>")`. Validation errors on documents return 422 with `{detail, errors: [{path, message}]}`.
- **Uploads:** check size (20 MB) and type before reading. Use `defusedxml` for XML. Decode as utf-8-sig, falling back to cp1252. Stream CSVs.
- **DB:** SQLAlchemy 2 typed `Mapped[...]`. Every model change needs an Alembic migration. JSON documents go in `documents.body` (JSON type), with indexed `kind`, `name`, `updated_at`, `schema_version` and `revision`.
- **Rendering and exports** live in `app/render` and `app/exports`. They must not import from `app/api`. Close DB sessions before rendering.
- **Determinism:** inject `today()` through `app/core/clock.py` so tests can freeze it at 2026-11-06.
- **Quality gates:** `ruff check`, `ruff format --check`, `mypy --strict app` and `pytest -q`.
