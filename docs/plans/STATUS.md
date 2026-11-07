# Build status

Updated by the main session at the end of each `/milestone` run.

| Milestone | Status | Plan | Date | Open assumptions / deviations |
|---|---|---|---|---|
| M0 Bootstrap | done | [M0-bootstrap.md](M0-bootstrap.md) | 2026-11-07 | ASSUMPTION: nav Roadmap/Swimlanes → `/roadmaps/demo`, `/diagrams/demo` (M1 must seed `demo` or change links); sync SQLAlchemy engine; Python 3.12, Node 24, pnpm 12.18.0; extra `make install`. Deviations: static fonts from upstream googlefonts releases (Google Fonts ships variable only), two OFL files; wordmark/Undo use theme colours not prototype hex; bar 56px incl. border (prototype 57); lede line-height 1.5; 720px custom media query. Unverified: Docker (not installed), CI (not pushed). Nits for M1: lazy engine / session override in tests, `updated_at` onupdate, clock test midnight flake, theme.breakpoints comment, snackbar action token. |
| M1 Documents & API | not started | — | — | — |
| M2 Jira import & Home | not started | — | — | — |
| M3 Roadmap editor | not started | — | — | — |
| M4 Swimlane editor | not started | — | — | — |
| M5 Exports | not started | — | — | — |
| M6 Hardening | not started | — | — | — |
