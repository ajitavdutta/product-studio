# Build status

Updated by the main session at the end of each `/milestone` run.

| Milestone | Status | Plan | Date | Open assumptions / deviations |
|---|---|---|---|---|
| M0 Bootstrap | done | [M0-bootstrap.md](M0-bootstrap.md) | 2026-11-07 | ASSUMPTION: nav Roadmap/Swimlanes → `/roadmaps/demo`, `/diagrams/demo` (M1 must seed `demo` or change links); sync SQLAlchemy engine; Python 3.12, Node 24, pnpm 12.18.0; extra `make install`. Deviations: static fonts from upstream googlefonts releases (Google Fonts ships variable only), two OFL files; wordmark/Undo use theme colours not prototype hex; bar 56px incl. border (prototype 57); lede line-height 1.5; 720px custom media query. Unverified: Docker (not installed), CI (not pushed). Nits for M1: lazy engine / session override in tests, `updated_at` onupdate, clock test midnight flake, theme.breakpoints comment, snackbar action token. |
| M1 Documents & API | done | [M1-documents-and-api.md](M1-documents-and-api.md) | 2026-11-07 | ASSUMPTION: v0 detected by shape (no `kind`, string lanes) because `docs/examples/roadmap.v0.json` says `schemaVersion: 1`; v0 migration drops template name and file-name `linkedDiagrams`, derives `issues.done`, uuid5 id; demo docs keep example UUIDs (`make seed` before e2e/parity); delete unlinks, never cascades; `settings.defaultPresetId` is source of truth; documents `extra="forbid"`; templates/presets listed by name, DELETE returns the record; `jiraBaseUrl` normalised with trailing `/`; SVG logos lose `<style>`/animation. Deviations (see `docs/design/deviations.md`): Settings gear (3rd top-bar row at 390px), placeholder editor pages with temporary name field, file names from document name. Outside plan: alembic `fileConfig(disable_existing_loggers=False)`; request-validation 422s use ProblemRead; queries do not retry 4xx; detail queries `staleTime: Infinity`. Deferred nits: partial `piCadence` PUT replaces whole object; raw Pydantic messages for non-UUID ids (old `/roadmaps/demo` bookmark shows load error, not not-found) and settings fields; asset sha256 dedupe race → 500; SQLite does not enforce preset→asset FK. |
| M2 Jira import & Home | not started | — | — | — |
| M3 Roadmap editor | not started | — | — | — |
| M4 Swimlane editor | not started | — | — | — |
| M5 Exports | not started | — | — | — |
| M6 Hardening | not started | — | — | — |
