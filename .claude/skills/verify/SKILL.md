---
name: verify
description: Run Product Studio's definition-of-done checks — lint, type checks, unit tests, API type drift, migrations, shared timeline fixtures, protected files — and report a pass/fail checklist. Use before calling any task, feature or milestone done.
allowed-tools: Bash(make *), Bash(pnpm *), Bash(uv run *), Bash(git diff *), Bash(git status *)
---

# Verify

Run these from the repo root. Run them all, even after a failure, then report.

| # | Check | Command | Passes when |
|---|---|---|---|
| 1 | Lint and types | `make lint` | exit 0 |
| 2 | Unit and API tests | `make test` | exit 0 |
| 3 | Shared timeline fixtures | `pnpm -C frontend vitest run src/lib/timeline` and `uv run --directory backend pytest -q tests/render/test_timeline_fixtures.py` | both pass on the same fixture files |
| 4 | API types up to date | backend running, then `pnpm -C frontend gen:api && git diff --exit-code frontend/src/api/types.ts` | no diff |
| 5 | Migrations match the models | `uv run --directory backend alembic check` | "No new upgrade operations detected" |
| 6 | Protected files untouched | `git diff --stat HEAD -- docs/fixtures docs/design/prototype docs/design/screens docs/product-spec.md` | empty |
| 7 | E2E, when screens changed | `make e2e` | exit 0 |

If a check can't run yet, because the milestone that adds it hasn't been built (for example, there are no timeline files before M3), mark it **n/a**, give the reason, and don't count it as a failure.

## Report

One line per check: ✅ / ❌ / n/a, the command, and for a failure the first relevant error line. Then list the manual items from the definition of done in `CLAUDE.md` that still need a human: comparing against the prototype, and the reason for any golden SVG update.
