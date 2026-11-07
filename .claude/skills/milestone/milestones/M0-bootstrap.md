<!-- Brief for /milestone M0: M0 — scaffold the Product Studio monorepo: React+TS+MUI frontend, FastAPI backend, shared tokens, app shell, tooling and CI. -->

# M0 · Bootstrap

Create the repository skeleton described in `CLAUDE.md`. Requirements: `G-1`, `G-5`.

## Steps
1. **Backend** (`backend/`, uv):
   - Dependencies: FastAPI, uvicorn, pydantic-settings, SQLAlchemy 2, Alembic, python-multipart, defusedxml, python-dateutil, cairosvg, python-pptx, lxml. Dev: pytest, pytest-asyncio, httpx, ruff, mypy.
   - `app/main.py` mounts `/api` routers, adds CORS for `localhost:5173`, and exposes `GET /api/health`.
   - `app/core/settings.py`, `app/core/clock.py` (injectable `today()`) and `app/db.py` (engine and session dependency).
   - Run `alembic init` and write the first migration with an empty `documents` table: `id, kind, name, schema_version, revision, body JSON, created_at, updated_at`.
   - Ship `app/exports/fonts/` with Roboto and Roboto Mono TTF from Google Fonts (OFL). Add the licence file.
2. **Frontend** (`frontend/`, pnpm, Vite React-TS):
   - Dependencies: MUI 7 + Emotion, @mui/icons-material, TanStack Query 5, React Router 7, Zustand 5. Dev: Vitest, RTL, Playwright, openapi-typescript, eslint and typescript-eslint.
   - `src/app/theme.ts` built **from `shared/design-tokens.json`**: Roboto, primary `#1976d2`, status, lane and milestone palettes, radius and shadows.
   - `src/api/client.ts` (fetch wrapper with `/api` base and typed errors) and a `gen:api` script that runs `openapi-typescript http://localhost:8000/openapi.json -o src/api/types.ts`.
   - **App shell** to match the prototype: the 56px bar with the "Product Studio" wordmark, nav (Import, Roadmap, Swimlanes, Exports) with the active underline, and the save-state slot on the right. Add placeholder routes for `/`, `/import`, `/roadmaps/:id`, `/diagrams/:id` and `/exports`, a snackbar provider and an error boundary.
3. **Root:**
   - `Makefile`: `dev`, `test`, `e2e`, `lint`, `gen`.
   - `docker-compose.yml`: backend with fontconfig and the fonts installed, frontend dev server.
   - `.editorconfig`, `.gitignore`, `README.md`.
   - Keep `shared/design-tokens.json` as it is; `theme.ts` reads it.
   - `.gitignore` includes `parity/`, `backend/tests/render/out/`, `.claude/settings.local.json` and `CLAUDE.local.md`.
4. **CI** (`.github/workflows/ci.yml`): backend lint, typecheck and tests; frontend lint, typecheck and tests; Playwright smoke test against `make dev` with browsers cached.

## Done when
- `make dev` serves the shell at `:5173`, and `/api/health` returns `{status: "ok"}`.
- `make lint` and `make test` pass, and CI is green.
- The shell matches `docs/design/screens/01-home.png` at 1440 and 390px, apart from the content.
