# M0 · Bootstrap: plan

Brief: `.claude/skills/milestone/milestones/M0-bootstrap.md`. Branch: `milestone/M0-bootstrap`. Today is 2026-11-07, and tests freeze today at **2026-11-06**.

## Goal
Scaffold the monorepo described in `CLAUDE.md` so that every later milestone only adds features. The backend is FastAPI with settings, an injectable clock, a SQLAlchemy engine and session, Alembic with an empty `documents` table, `GET /api/health`, and bundled Roboto fonts. The frontend is Vite, React 19 and MUI 7. Its theme is built from `shared/design-tokens.json`, it has a typed `/api` client and a working `gen:api`, and it has the 56px app shell from the prototype with placeholder routes, a snackbar provider and an error boundary. The root gets the Makefile, docker-compose, editorconfig and README. CI runs lint, typecheck, unit tests and a Playwright smoke test of the shell.

## In scope
- `G-1`: the shell part only. That means the 56px bar, the "Product Studio" wordmark, the nav (Import, Roadmap, Swimlanes, Exports) with the active underline and `aria-current="page"`, and a save-state slot on the right. The slot's component renders both G-1 variants. No document feeds it until M1.
- `G-5`: the shell part only. The bar wraps at ≤720px (`layout.breakpointMobile`), there is no horizontal page scroll at 390px, and the bar becomes `position: static` on mobile, as in the prototype.
- `G-3`: the provider only. Snackbars sit bottom-centre and stay 2.8 s, or 6 s when they carry an Undo action. Destructive actions start using it in later milestones.
- `NF-2`: the shell part only. The nav is labelled, links are real elements, the focus ring is visible and text contrast is ≥ 4.5:1.

## Out of scope (deferred)
- `G-2` autosave, the save-state indicator wired to documents, and the documents API: **M1**.
- `G-4` Settings and the gear in the top bar: **M1**. The prototype has no gear, so the bar leaves room on the right only.
- `HOME-1`, `HOME-2` Home content: **M2**. In M0 the Home placeholder shows only the heading and subtitle.
- `NF-3` upload limits: M1/M2. `NF-1` performance: M6. All `IMP-`, `RM-`, `SW-` and `EX-` IDs: M2–M5.
- No package directories for later milestones (`importers/`, `render/`, `documents/`, `services/`, `lib/timeline`, `lib/diagram`). Each milestone creates its own. The one exception is `backend/app/exports/fonts/`, which the brief asks for.

## Contract changes (first)
- **Route:** `GET /api/health` → `HealthRead`.
- **Schema:** `backend/app/schemas/health.py`, `class HealthRead(BaseModel): status: Literal["ok"] = Field(..., description="Always 'ok' when the API is up")`.
- **Model:** `backend/app/models/document.py`, `Document` (table `documents`):
  - `id: Mapped[str]`, String(36), primary key (a UUID string);
  - `kind: Mapped[str]`, String(16), indexed, with `CheckConstraint("kind in ('roadmap','diagram')", name="ck_documents_kind")`;
  - `name: Mapped[str]`, String(200), indexed;
  - `schema_version: Mapped[int]`, indexed;
  - `revision: Mapped[int]`, default 0, indexed;
  - `body: Mapped[dict[str, Any]]`, JSON;
  - `created_at` and `updated_at`: `DateTime(timezone=True)`, `server_default=func.now()`, with `updated_at` indexed.
  - The indexes follow `.claude/rules/backend.md`.
- **Alembic:** the first revision `backend/alembic/versions/0001_create_documents.py`.
- **schemaVersion:** no document schema yet, so no bump. `CURRENT_SCHEMA_VERSION = 1` arrives in M1.
- **gen:api:** first generation of `frontend/src/api/types.ts`, committed (task 8).

## Parallelism map

| Task | Owner | Writes only under | Can run in parallel with |
|---|---|---|---|
| 1 | backend-engineer | repo root: `Makefile`, `.editorconfig`, `.gitignore` | none (run first, it's tiny) |
| 2 | backend-engineer | `backend/` (except `app/exports/`, `tests/exports/`) | 5, 6, 7 |
| 3 | backend-engineer | `backend/alembic*`, `backend/app/models/`, `backend/tests/db/` | 4, 5, 6, 7 (after 2) |
| 4 | export-engineer | `backend/app/exports/fonts/`, `backend/tests/exports/` | 3, 5, 6, 7 (after 2, because it needs pytest from `pyproject.toml`) |
| 5 | frontend-engineer | `frontend/` (config + `src/main.tsx`, `src/api/client.ts`) | 2, 3, 4 |
| 6 | frontend-engineer | `frontend/src/app/theme*.ts` | 2, 3, 4 (after 5) |
| 7 | frontend-engineer | `frontend/src/app/`, `frontend/src/features/*/`, `frontend/src/components/` | 2, 3, 4 (after 6) |
| 8 | frontend-engineer | `frontend/src/api/types.ts` (generated) | none (needs 2 and 7) |
| 9 | backend-engineer | `backend/Dockerfile`, `docker-compose.yml`, `README.md` | none (needs 2–8) |
| 10 | test-engineer | `frontend/e2e/`, `frontend/playwright.config.ts`, `.github/workflows/ci.yml` | none (needs everything) |

The backend lane (2 → 3, with 4 alongside) and the frontend lane (5 → 6 → 7) write to disjoint directories. Run the two lanes concurrently. Inside a lane, run tasks in order. Task 4 must not touch `backend/pyproject.toml`. If it needs a mypy override for `cairosvg`, task 2 adds it up front.

## Ordered tasks

### 1. Root tooling skeleton (backend-engineer)
- **`Makefile`**, with all of its targets fixed now so that both lanes code against them:
  - `install`: `uv sync --directory backend`, then `pnpm -C frontend install`, then `pnpm -C frontend exec playwright install chromium`;
  - `dev`: `uv run --directory backend alembic upgrade head`, then `trap 'kill 0' EXIT; uv run --directory backend uvicorn app.main:app --reload --port 8000 & pnpm -C frontend dev & wait`;
  - `test`: `uv run --directory backend pytest -q` and `pnpm -C frontend test`;
  - `e2e`: `pnpm -C frontend e2e`;
  - `lint`: `uv run --directory backend ruff check .`, then `ruff format --check .`, then `mypy --strict app`, then `pnpm -C frontend lint` and `pnpm -C frontend typecheck`;
  - `gen`: `pnpm -C frontend gen:api`;
  - all of these are `.PHONY`.
- **`.editorconfig`:** utf-8, LF, final newline, 2 spaces by default, 4 for `*.py`, tabs for `Makefile`.
- **`.gitignore`:** it already has `parity/`, `backend/tests/render/out/`, `.claude/settings.local.json` and `CLAUDE.local.md`. Only check this. `*.db` already covers the SQLite file. Add only `frontend/.vite/` and `coverage/`. **Do not** ignore `frontend/src/api/types.ts`, because `/verify` diffs it.
- **Satisfies:** brief step 3. **Proof:** `make -n dev test lint e2e gen` prints the commands.

### 2. Backend scaffold, app, settings, clock, DB session (backend-engineer)
- **Setup:** `uv init` in `backend/` with `requires-python = ">=3.12"` and `.python-version` set to `3.12`.
- **Dependencies:** fastapi, uvicorn[standard], pydantic-settings, sqlalchemy>=2, alembic, python-multipart, defusedxml, python-dateutil, cairosvg, python-pptx and lxml. Dev: pytest, pytest-asyncio, httpx, ruff and mypy. Commit `uv.lock`.
- **`pyproject.toml`:**
  - `[tool.ruff]`: line length 100, rules `E,F,I,UP,B,SIM`;
  - `[tool.mypy]`: `strict = true`, `plugins = ["pydantic.mypy"]`, with `ignore_missing_imports` overrides for `cairosvg.*` and `pptx.*`;
  - `[tool.pytest.ini_options]`: `asyncio_mode = "auto"`, `testpaths = ["tests"]`.
- **`app/__init__.py` and `app/main.py`:** `create_app() -> FastAPI` and a module-level `app = create_app()`. `CORSMiddleware` takes its origins from settings. An `api_router = APIRouter(prefix="/api")` includes `routers.health.router`.
- **`app/api/__init__.py`, `app/api/routers/__init__.py`, `app/api/routers/health.py`:** `@router.get("/health", response_model=HealthRead)`.
- **`app/schemas/__init__.py`, `app/schemas/health.py`:** as in Contract changes.
- **`app/core/settings.py`:** `class Settings(BaseSettings)`, with `model_config = SettingsConfigDict(env_prefix="PS_", env_file=".env")` and these fields:
  - `database_url: str = "sqlite:///./product_studio.db"`;
  - `cors_origins: list[str] = ["http://localhost:5173"]`;
  - `get_settings()` is wrapped in `@lru_cache`.
- **`app/core/clock.py`:** `today() -> date` and `now() -> datetime` (UTC) return the frozen value if one is set, otherwise the real one. `freeze(day: date | None) -> None` sets or clears the frozen value. The module docstring says why: tests freeze at 2026-11-06, and the renderer must not call `date.today()` directly.
- **`app/db.py`:**
  - `class Base(DeclarativeBase)`;
  - `engine = create_engine(settings.database_url, connect_args={"check_same_thread": False} if sqlite)`;
  - `SessionLocal = sessionmaker(engine, expire_on_commit=False)`;
  - `def get_session() -> Iterator[Session]` (a FastAPI dependency).
  - **ASSUMPTION:** a sync engine and sessions. SQLite with a sync driver is simplest, and tests still use httpx `AsyncClient` with `ASGITransport`.
- **`tests/conftest.py`:**
  - an autouse fixture `frozen_today` calls `clock.freeze(date(2026, 11, 6))` and resets it on teardown;
  - a fixture `client` provides an `httpx.AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test")`;
  - a fixture `tmp_database_url` uses SQLite in `tmp_path`, for task 3.
- **Tests:**
  - `tests/api/test_health.py::test_health_returns_ok` asserts 200 and `{"status": "ok"}`;
  - `test_cors_allows_vite_dev_origin` sends an OPTIONS preflight with `Origin: http://localhost:5173` and asserts `access-control-allow-origin`;
  - `tests/core/test_clock.py::test_today_is_frozen_in_tests` (2026-11-06) and `test_freeze_none_restores_real_date`.
- **Proof:** `uv run --directory backend ruff check . && ruff format --check . && mypy --strict app && pytest -q`.

### 3. Alembic and the `documents` table (backend-engineer, after 2)
- **Setup:** run `alembic init alembic` in `backend/`. Then edit `alembic/env.py`:
  - the URL comes from `get_settings().database_url`, not from `alembic.ini`;
  - `target_metadata = Base.metadata`, after importing `app.models`;
  - `render_as_batch=True`, for SQLite ALTERs later;
  - `compare_type=True`.
- **`app/models/__init__.py`** re-exports `Document`. **`app/models/document.py`** is as in Contract changes.
- **`alembic/versions/0001_create_documents.py`** creates the table, the check constraint and the indexes `ix_documents_kind`, `ix_documents_name`, `ix_documents_schema_version`, `ix_documents_revision` and `ix_documents_updated_at`. `downgrade` drops them.
- **Tests:** `tests/db/test_migrations.py`.
  - `test_upgrade_head_creates_documents_table`: run `alembic upgrade head` against `tmp_database_url` with `alembic.command`, then `sqlalchemy.inspect` the columns `id, kind, name, schema_version, revision, body, created_at, updated_at`.
  - `test_models_match_migrations`: run `alembic.command.check`, which raises if autogenerate finds a diff.
  - `test_downgrade_base_drops_documents`.
- **Proof:** the tests pass, and `uv run --directory backend alembic check` prints "No new upgrade operations detected".

### 4. Bundled fonts (export-engineer, after 2; parallel with 3 and the frontend lane)
- **Files:** in `backend/app/exports/fonts/`:
  - static TTFs from the official Google Fonts releases (`google/fonts` repo, `ofl/roboto`, `ofl/robotomono`): `Roboto-Regular.ttf`, `Roboto-Medium.ttf`, `Roboto-Bold.ttf`, `RobotoMono-Regular.ttf` and `RobotoMono-Medium.ttf`;
  - `OFL.txt`, the licence copied from the same release;
  - a short `README.md` giving the source URL and version.
- **Weights:** these cover 400, 500 and 700 (`font.weights`).
- **ASSUMPTION:** if Google now ships only variable fonts, use the static instances from the `googlefonts/roboto-3-classic` (or `roboto-mono`) GitHub release, and state the source in the README.
- **No Python module here yet.** Fontconfig registration happens in M5 (`exports/`). Only the Docker image installs the fonts system-wide in M0 (task 9).
- **Tests:** `tests/exports/test_fonts.py`.
  - `test_bundled_fonts_present_and_truetype`: each file exists and starts with `b"\x00\x01\x00\x00"` or `b"true"`.
  - `test_font_licence_present`: `OFL.txt` contains "SIL Open Font License".
- **Proof:** `uv run --directory backend pytest -q tests/exports`.

### 5. Frontend scaffold and API client (frontend-engineer)
- **Create:** `pnpm create vite frontend --template react-ts`. Then add MUI 7 (`@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`), `@tanstack/react-query@5`, `react-router@7` (v7 package, `react-router/dom` for `RouterProvider`) and `zustand@5`.
- **Dev dependencies:** vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, @playwright/test, openapi-typescript, eslint, typescript-eslint, eslint-plugin-react-hooks and prettier. The format hook calls `frontend/node_modules/.bin/prettier`. Commit `pnpm-lock.yaml`, and set `"packageManager"` and `engines.node >=20`.
- **Scripts:**
  - `dev`;
  - `build`;
  - `test` = `vitest run`;
  - `lint` = `eslint .`;
  - `typecheck` = `tsc -b --noEmit` (or `tsc --noEmit -p tsconfig.app.json`);
  - `e2e` = `playwright test`;
  - `gen:api` = `openapi-typescript http://localhost:8000/openapi.json -o src/api/types.ts`.
- **`vite.config.ts`:**
  - `server.port = 5173`;
  - `server.proxy['/api'] = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'`, so the Docker frontend can point at `http://backend:8000`;
  - `server.fs.allow = ['..']`, so the app can import `../shared/design-tokens.json`;
  - `test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'], exclude: ['e2e/**', ...] }`.
- **`tsconfig.app.json`:** `strict`, `noUncheckedIndexedAccess` and `resolveJsonModule`. `include` lists `src` and `../shared/design-tokens.json`.
- **`eslint.config.js`:** a flat config with `tseslint.configs.strictTypeChecked` and `react-hooks`. `@typescript-eslint/no-explicit-any` and `no-non-null-assertion` are errors. Ignore `src/api/types.ts` and `dist`.
- **`src/test/setup.ts`:** imports jest-dom. Tests that need a date use `vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))` locally. No global fake timers.
- **`src/api/client.ts`:** the only `fetch` in the app.
  - `export class ApiError extends Error { status: number; detail: string }`;
  - `export async function apiRequest<T>(method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE', path: string, body?: unknown): Promise<T>`;
  - `API_BASE = '/api'`;
  - it sends and reads JSON;
  - on a non-2xx response it reads `detail` (a string) from the body, falling back to `"Request failed (<status>)"`;
  - on a network failure it throws `ApiError(0, "Couldn't reach the server")`;
  - a 204 returns `undefined`.
  - `paths` from `types.ts` is used by the per-resource hooks from M1 onwards. M0 doesn't need a health hook.
- **Tests:** `src/api/client.test.ts`, which stubs `globalThis.fetch` with `vi.fn`:
  - `it('returns parsed JSON on 200')`;
  - `it('throws ApiError with the server detail on 422')`;
  - `it('throws ApiError status 0 when the network fails')`;
  - `it('prefixes paths with /api')`.
- **Proof:** `pnpm -C frontend lint && pnpm -C frontend typecheck && pnpm -C frontend test`.

### 6. Theme from design tokens (frontend-engineer, after 5)
- **`src/app/theme.ts`:**
  - it does `import tokens from '../../../shared/design-tokens.json'` and exports `theme = createTheme({...})`;
  - **palette:** `primary {main: color.primary, dark: color.primaryHover}`, `error: color.danger`, `success`, `warning`, `text {primary: color.text, secondary: color.textSecondary}`, `background {default: color.background, paper: color.surface}`, `divider: color.border`;
  - **custom palettes:** `status` (camelCased keys `notStarted`, `inProgress`, `atRisk`, `done` → `{label, color}`), `team`, `lane` (an array), `milestone`, `timeline`, `diagram` and `watermark` are passed through as-is, plus `neutral {muted, borderInput, borderSubtle, hover, primaryTint, primaryTintSoft, ...}` for the remaining `color.*` keys;
  - **typography:** `fontFamily: font.family`, and a custom `fontFamilyMono: font.mono`. Variants use `font.size` and `font.weights`: `h1` 22/500, `subtitle1` 16/500, `subtitle2` 14/500, `body1` 14, `body2` 13, `caption` 12, and `overline` 11 (the eyebrow).
  - **shape:** `borderRadius: radius.sm`. `radius.md` and `radius.lg` go on `theme.custom.radius`.
  - **shadows:** `theme.custom.shadow = tokens.shadow`. `MuiButton` uses `shadow.button`, `MuiMenu`/`MuiPopover` paper use `shadow.menu`, and `MuiDialog` paper uses `shadow.dialog`.
  - **layout:** `theme.custom.layout = tokens.layout`.
  - **focus ring:** `MuiCssBaseline` adds a visible `:focus-visible` outline in `primary.main` (NF-2).
- **`src/app/theme.d.ts`:** MUI module augmentation (`Palette`/`PaletteOptions`, `Theme`/`ThemeOptions` with `custom`, and `TypographyVariants` with `fontFamilyMono`), so that `theme.palette.status.atRisk` type-checks without `any`.
- **No hex values** in `theme.ts`. Every value comes from `tokens`.
- **Tests:** `src/app/theme.test.ts`:
  - `it('G-1 builds the primary colour from design tokens')`, where `theme.palette.primary.main === tokens.color.primary`;
  - `it('maps every status token to a camelCase palette key')`;
  - `it('exposes all six lane palettes')`;
  - `it('uses Roboto from tokens')`;
  - `it('exposes the 720px mobile breakpoint and 56px app bar height')`.
- **Proof:** lint, typecheck and test, as in task 5.

### 7. App shell, routes, snackbar, error boundary (frontend-engineer, after 6). About 400 lines. If it grows past that, split into 7a (shell and router) and 7b (snackbar and error boundary).
- **`src/main.tsx`:** `ThemeProvider` + `CssBaseline` + `QueryClientProvider` (`new QueryClient({ defaultOptions: { queries: { retry: 1 } } })`) + `SnackbarProvider` + `RouterProvider`.
- **`src/app/router.tsx`:** `createBrowserRouter`, with the root layout `AppShell` and `errorElement: <RouteError/>`. The children are:
  - `/` → `features/home/HomePage.tsx`;
  - `/import` → `features/import/ImportPage.tsx`;
  - `/roadmaps/:id` → `features/roadmap/RoadmapPage.tsx`;
  - `/diagrams/:id` → `features/swimlane/SwimlanePage.tsx`;
  - `/exports` → `features/export/ExportsPage.tsx`;
  - `*` → `features/home/NotFoundPage.tsx`.
  - The comment at the top says to keep this in step with `ROUTES` in `.claude/skills/prototype-parity/scripts/capture.mjs`. The routes already match it.
- **`src/app/AppShell.tsx`:** the header, then `<Box component="main">` with `<Outlet/>`.
  - **Header:** `Box component="header"`. It is sticky, with `top: 0` and `minHeight: layout.appBarHeight`. It uses `bgcolor: background.paper`, a 1px bottom border in `divider`, `display: flex`, `alignItems: center`, `flexWrap: wrap`, a 20px gap and 20px horizontal padding (`theme.spacing(2.5)`).
  - **Mobile:** at `theme.breakpoints.down(layout.breakpointMobile)` the header is `position: static`.
- **`src/components/Wordmark.tsx`:** a RouterLink to `/`, with `aria-label="Product Studio home"`.
  - It contains the 26px SVG mark from the prototype (`rect rx=6` + three strokes). The fill is `theme.palette.primary.main` and the strokes are `background.paper`. **Never** use the prototype's literal `#1976d2`.
  - Then the text "Product Studio" in `subtitle1` (16/500).
- **`src/app/MainNav.tsx`:** `<nav aria-label="Main">` with four `NavLink`s:
  - `Import` → `/import`;
  - `Roadmap` → `/roadmaps/demo`;
  - `Swimlanes` → `/diagrams/demo`;
  - `Exports` → `/exports`.
  - Links use 14/500 in `text.secondary`, `minHeight: 56`, 14px horizontal padding and a 2px transparent bottom border.
  - The active link (`aria-current="page"`, which NavLink sets) is `primary.main` with a `primary.main` underline.
  - Active is matched by path prefix: `/roadmaps/*` lights Roadmap and `/diagrams/*` lights Swimlanes. `/` lights nothing, as in `01-home.png`.
  - Under 720px: 8px padding and `minHeight: 44`.
  - **ASSUMPTION:** with no document open, Roadmap and Swimlanes go to the `demo` ids. These match the parity script's route map. M1 seeds or aliases `demo`, and M2/M3 change the links to the last-opened document.
- **`src/components/SaveStateIndicator.tsx`:** takes props `{ state: 'saved' | 'unsaved'; fileName?: string }`.
  - `saved` renders `CloudDoneOutlined` + "Saved to {fileName}".
  - `unsaved` renders "Unsaved changes".
  - It uses `role="status"`.
  - In the shell, a spacer (`flex: 1`) is followed by a slot that renders the indicator only when `useSaveStateStore` (Zustand, `src/app/saveState.ts`, `{ state: 'saved'|'unsaved'|null, fileName: string|null, set(...) }`) has a state. It defaults to `null`, so the indicator is hidden, which matches `01-home.png`. M1's `useAutosave` writes to this store.
- **Placeholder pages:** each has a single `<Typography variant="h1" component="h1">` and one `body2` line in `text.secondary`.
  - Home uses the prototype's copy: "Welcome back" / "Start a roadmap from a Jira export, reopen a saved one, or draw a workflow."
  - The others use "Import from Jira", "Roadmap", "Swimlane diagram" and "Exports", each with "Coming in a later milestone."
  - NotFound uses "Page not found" with a link to Home.
  - The page container uses 24px padding (`theme.spacing(3)`), or 16px under 720px, as in the prototype `.page`.
- **`src/app/SnackbarProvider.tsx`:** exports `SnackbarProvider` and `useSnackbar(): { notify(message: string): void; error(message: string): void; undoable(message: string, onUndo: () => void): void }`.
  - The MUI `Snackbar` is anchored `{ vertical: 'bottom', horizontal: 'center' }`.
  - `SNACKBAR_DURATION_MS = 2800` and `UNDO_SNACKBAR_DURATION_MS = 6000` (G-3).
  - `error` uses an `Alert severity="error"` inside the snackbar.
  - **ASSUMPTION:** one snackbar at a time, and a new message replaces the current one.
- **`src/app/RouteError.tsx`:** the React Router `errorElement`. It renders inside a minimal page with the wordmark: `Alert severity="error"` "Something went wrong on this page." with a **Reload** button (`window.location.reload()`) and a **Go home** link. **ASSUMPTION:** this copy, since the spec is silent.
- **Tests (Vitest + RTL)** in `src/app/AppShell.test.tsx`, using `createMemoryRouter` with the real route table:
  - `it('G-1 renders the wordmark, the main nav and no save state on Home')`;
  - `it('G-1 marks Import active with aria-current on /import')`;
  - `it('G-1 marks Roadmap active on /roadmaps/abc')`;
  - `it('G-1 shows "Saved to payments.json" when the save-state store is saved')`;
  - `it('G-1 shows "Unsaved changes" when the store is unsaved')`.
- **Tests** in `src/app/SnackbarProvider.test.tsx`, using `vi.useFakeTimers()`:
  - `it('G-3 hides a plain snackbar after 2.8 s')`;
  - `it('G-3 keeps an undo snackbar for 6 s and calls onUndo')`.
- **Tests** in `src/app/RouteError.test.tsx`: `it('renders Reload when a route throws')`.
- **Proof:** lint, typecheck and test, then a manual `make dev` check of `http://localhost:5173` at 1440 and 390 against `01-home.png`, ignoring the content below the bar.

### 8. First `gen:api` (frontend-engineer, after 2 and 7)
- **Generate:** start the backend (`uv run --directory backend uvicorn app.main:app --port 8000`) and run `pnpm -C frontend gen:api`. Commit `frontend/src/api/types.ts`. It contains `/api/health`. **Never hand-edit it.**
- **Use the types:** add one type-only use to prove that the types compile against the client: `export type HealthRead = components['schemas']['HealthRead']` in `src/api/health.ts`. **ASSUMPTION:** the shell doesn't show health. This file only anchors the generated types until M1 adds real hooks. Delete it in M1 if it is unused.
- **Proof:** `pnpm -C frontend typecheck`. Running `gen:api` again gives `git diff --exit-code frontend/src/api/types.ts` with no diff.

### 9. Docker and README (backend-engineer, after 2–8)
- **`backend/Dockerfile`:**
  - base `python:3.12-slim`;
  - `apt-get install --no-install-recommends libcairo2 fontconfig`;
  - copy `app/exports/fonts/*.ttf` to `/usr/share/fonts/truetype/product-studio/` and run `fc-cache -f`;
  - install uv, then `uv sync --locked --no-dev`;
  - `CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- **`docker-compose.yml`:**
  - `backend` (build `./backend`, port 8000, a volume for the SQLite file, `PS_CORS_ORIGINS='["http://localhost:5173"]'`);
  - `frontend` (`node:24-alpine` with `corepack enable`, which mounts `./frontend` and `./shared`, runs `pnpm install && pnpm dev --host`, uses port 5173 and sets `VITE_API_PROXY_TARGET=http://backend:8000`).
  - **ASSUMPTION:** Node 24 LTS in the container and in CI. `engines` still allows ≥20, as the README states.
- **`README.md`:** keep the existing kit content. Add an **"Run the app"** section with:
  - the prerequisites (uv, Python 3.12+, Node 20+, pnpm, Cairo);
  - `make install`, `make dev` (`:5173`, API on `:8000`, `/api/health`), `make test`, `make lint`, `make e2e` (needs `make dev` running) and `make gen`;
  - `docker compose up`;
  - the `PS_DATABASE_URL` and `PS_CORS_ORIGINS` env vars.
- **Proof:** `docker compose config` validates. If Docker is available locally, `docker compose up` serves `/api/health` and `fc-list | grep Roboto` inside the backend container lists the fonts. If Docker isn't available, report it as not run. CI doesn't build the image in M0 (**ASSUMPTION**, to keep CI fast).

### 10. Playwright smoke test and CI (test-engineer, after all)
- **`frontend/playwright.config.ts`:**
  - `testDir: 'e2e'`, `baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173'`;
  - projects: `desktop` (1440×900) and `mobile` (390×844), both Chromium;
  - `reporter: [['list'], ['html', { open: 'never' }]]`;
  - no `webServer`, because the target is `make dev`, per `CLAUDE.md`.
- **`frontend/e2e/shell.spec.ts`**, using role and label selectors only:
  - `test('G-1 shell shows wordmark, main nav and navigates with active state')`: go to `/`, check the "Product Studio home" link and the `navigation` named "Main" with its four links, click "Import", and expect `aria-current="page"` on it and the URL `/import`;
  - `test('G-1 shell is 56px tall at 1440')`: the header bounding box height is 56 on desktop;
  - `test('G-5 shell has no horizontal scroll at 390px')`: on mobile, `document.documentElement.scrollWidth <= 390` and all four nav links are visible;
  - `test('API health is proxied through Vite')`: `request.get('/api/health')` returns `{status:'ok'}`.
- **`.github/workflows/ci.yml`** runs on `push` and `pull_request`, with three jobs.
  - **backend:**
    - `astral-sh/setup-uv` with caching, and `uv python install 3.12`;
    - `sudo apt-get install -y libcairo2`;
    - `uv sync --locked --directory backend`;
    - `ruff check`, `ruff format --check`, `mypy --strict app` and `pytest -q`;
    - `alembic upgrade head` + `alembic check`.
  - **frontend:**
    - `pnpm/action-setup` + `actions/setup-node` (24, `cache: pnpm`, `cache-dependency-path: frontend/pnpm-lock.yaml`);
    - `pnpm -C frontend install --frozen-lockfile`;
    - `lint`, `typecheck` and `test`.
  - **e2e** (`needs: [backend, frontend]`):
    - both setups;
    - `actions/cache` on `~/.cache/ms-playwright`, keyed on the `@playwright/test` version from `pnpm-lock.yaml`;
    - `pnpm -C frontend exec playwright install --with-deps chromium` (deps only, `install-deps`, on a cache hit);
    - `make dev &`;
    - wait with a curl loop, max 60 s, on `http://localhost:8000/api/health` and `http://localhost:5173`;
    - `make e2e`;
    - then the API drift check: `pnpm -C frontend gen:api && git diff --exit-code frontend/src/api/types.ts`;
    - upload `frontend/playwright-report` on failure.
- **Proof:**
  - locally, `make dev` + `make e2e` pass in both projects;
  - `node .claude/skills/prototype-parity/scripts/capture.mjs home` writes `parity/home-{1440,390}-{proto,app}.png`;
  - CI is green on the branch, or, if it hasn't been pushed (the main session never pushes without asking), the workflow is validated with `actionlint` if available and the report says so.

## Risks and assumptions
- **ASSUMPTION:** Roadmap and Swimlanes nav targets are `/roadmaps/demo` and `/diagrams/demo` until a document exists (task 7). **Risk for M1:** `roadmap.example.json` has a UUID id, so M1 must either seed with id `demo` or change the nav and capture-script map together.
- **ASSUMPTION:** a sync SQLAlchemy engine (task 2).
- **ASSUMPTION:** one snackbar at a time (task 7).
- **ASSUMPTION:** the error-page copy (task 7).
- **ASSUMPTION:** `make install` is added as a convenience target. The brief lists only `dev/test/e2e/lint/gen`.
- **ASSUMPTION:** Node 24 in CI and Docker. Python is pinned at 3.12, the spec's floor and the Docker base.
- **ASSUMPTION:** CI doesn't build the Docker image in M0.
- **ASSUMPTION:** the font source fallback, if only variable fonts are published (task 4).
- **Prototype vs spec:** G-1 asks for a save-state indicator. The prototype hides it on Home, and the plan matches that. The prototype also has no Settings gear (G-4), which is deferred to M1.
- **Hardcoded colour in the prototype:** the wordmark SVG uses a literal `#1976d2`. The plan takes it from the theme instead, as `CLAUDE.md` requires.
- **Risk: shared JSON import outside `frontend/`.** It needs `server.fs.allow`, a tsconfig `include`, and the `./shared` mount in Docker. If `tsc -b` objects to a file outside `rootDir`, copy nothing. Set `rootDir` to `..` in `tsconfig.app.json` instead. Don't duplicate the tokens.
- **Risk: the CairoSVG system library.** Developers need Cairo locally (the README already says so). CI installs `libcairo2`.
- **Risk: `make e2e` depends on `make dev`** running. CI starts it in the background, and a local run must start it first. This is documented in the README.

## Done when
- [ ] `make dev` serves the shell at `http://localhost:5173`, and `curl -s localhost:8000/api/health` and `curl -s localhost:5173/api/health` both return `{"status":"ok"}`.
- [ ] `make lint` passes: ruff check, ruff format --check, `mypy --strict app`, eslint and `tsc --noEmit`.
- [ ] `make test` passes: pytest (health, CORS, clock frozen at 2026-11-06, migrations up/down/check, fonts) and vitest (client, theme, shell G-1, snackbar G-3, route error).
- [ ] `make e2e` passes the `desktop` and `mobile` projects of `e2e/shell.spec.ts` (G-1, G-5).
- [ ] `uv run --directory backend alembic check` reports no new operations, and the `documents` table has `id, kind, name, schema_version, revision, body, created_at, updated_at` with the indexes listed.
- [ ] `gen:api` has been run, `frontend/src/api/types.ts` is committed, and running it again gives no diff.
- [ ] `theme.ts` reads `shared/design-tokens.json`. There are no hex values in `frontend/src` outside the tokens file (`grep -rE '#[0-9a-fA-F]{3,6}\b' frontend/src --include=*.ts* ` finds nothing except in generated types). `design-tokens.json` is unchanged.
- [ ] `backend/app/exports/fonts/` contains Roboto 400/500/700, Roboto Mono 400/500 and `OFL.txt`.
- [ ] `.gitignore` covers `parity/`, `backend/tests/render/out/`, `.claude/settings.local.json`, `CLAUDE.local.md`, `.env*` and `*.db`. No `.env`, database, `node_modules` or `dist` is committed.
- [ ] The CI workflow has backend, frontend and e2e jobs, with the Playwright browsers cached. It is green, or the report says it hasn't been run because the branch isn't pushed.
- [ ] The shell matches `docs/design/screens/01-home.png` at 1440×900 and 390×844, apart from the content: the bar height, the wordmark, the nav order and spacing, the underline on the active link, and no save state on Home. This is checked with `capture.mjs home`, and any differences are listed.
- [ ] Protected files are untouched (`git diff --stat -- docs/fixtures docs/design/prototype docs/design/screens docs/product-spec.md` is empty).
- [ ] The README has a "Run the app" section covering setup, dev, test, lint, e2e, gen and docker.
- [ ] The summary ticks G-1 (shell part), G-5 (shell part), G-3 (provider) and NF-2 (shell part), and lists the ASSUMPTIONs above.
