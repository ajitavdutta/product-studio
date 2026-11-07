# Product Studio — Claude Code project kit

This kit is everything **Claude Code** needs to build **Product Studio**, using **React 19 + TypeScript** (Vite, MUI 7) and **FastAPI** (Pydantic v2, SQLAlchemy 2). Product Studio does three things:

- **Roadmap:** imports a **Jira export** into a roadmap with Sprint, Month and PI views, saved as reusable **JSON**;
- **Swimlanes:** draws **swimlane workflow diagrams** across teams in a draw.io-style editor;
- **Exports:** produces **PDF, PNG and PowerPoint** files, with an optional **watermark**.

The kit holds the instructions, subagents, skills, hooks, the spec, test fixtures, and the clickable HTML prototype that serves as the screen design.

## What's inside

```
CLAUDE.md                          Always loaded: product, sources of truth, stack, layout, ADR rules,
                                   conventions, commands, definition of done, how work is organised
.claude/
  settings.json                    Shared permissions (make/pnpm/uv allowed; commit/push ask; .env denied) + hooks
  hooks/
    guard.py                       PreToolUse — blocks edits to fixtures, prototype, screenshots, spec, generated API types
    format.py                      PostToolUse — ruff (backend) / prettier (frontend) on the edited file
  rules/                           Path-scoped rules, loaded only when Claude touches matching files
    frontend.md  backend.md  exports.md  tests.md
  agents/                          Subagents (own context, own tools, preloaded skills)
    planner.md                       opus · read + write docs/plans/ only (hook-enforced)
    backend-engineer.md              FastAPI, importers, documents, API contracts
    export-engineer.md               single SVG renderer, watermark, PDF/PNG/PPTX, golden tests
    frontend-engineer.md             React screens, roadmap timeline, swimlane canvas
    test-engineer.md                 Vitest, pytest, Playwright, shared fixtures
    reviewer.md                      opus · read-only; spec IDs, ADRs, parity, a11y; runs lint/tests
  skills/
    Knowledge (Claude loads them when relevant; preloaded into matching agents)
      jira-field-mapping/            column detection order, aliases, repeated columns, roll-ups (+ references/aliases.md)
      roadmap-timeline/              PI cadence, sprint/month/PI columns, compact dates, Today, zoom
      swimlane-editor/               lane layout, orthogonal routing, handles, picker, delete, undo
      export-rendering/              legend wrap, fit-to-space, PPTX slides, watermark
      document-format/               versioned JSON documents, migrations, autosave
      prototype-parity/              how to compare a screen with the prototype (+ scripts/capture.mjs)
    Workflows (slash commands you run)
      build-product-studio/          /build-product-studio [M#] — progress + run the next milestone
      milestone/                     /milestone M# — plan → build → test → review → verify → record
        milestones/M0…M6-*.md          the brief for each milestone
      implement-feature/             /implement-feature <ID or description>
      review-against-prototype/      /review-against-prototype <route> — runs in a forked reviewer
      verify/                        /verify — definition-of-done checks as a pass/fail list
.mcp.json                          Playwright MCP server, so agents can drive the prototype and the app
docs/
  product-spec.md                  Requirements with IDs (G, HOME, IMP, RM, SW, EX, NF)
  architecture.md  data-model.md   ADR-1…6, API surface, document formats
  plans/STATUS.md                  Milestone tracker (plans are written here by the planner)
  design/prototype/index.html      The clickable prototype — screen-design source of truth
  design/screens.md + screens/     Screen inventory and 27 reference screenshots
  examples/  fixtures/             Example documents; Jira CSV + expected result; timeline golden data
shared/design-tokens.json          Colours, type, spacing — used by the UI theme and the export renderer
```

## Set up

1. Copy everything in this kit into the root of an empty repository, including the hidden `.claude/`, `.mcp.json` and `.gitignore`. Then run `git init`, if needed, and commit.
2. Install the tools the agents will call:
   - **uv**, with Python 3.12+;
   - **Node 20+** and **pnpm**;
   - **Cairo**, for CairoSVG: `brew install cairo` on macOS, or `apt install libcairo2` on Debian/Ubuntu.
3. Run `claude` in the repo root.
   - The first time, approve the project's hooks and the `playwright` MCP server when Claude Code asks.
   - Check that everything loaded:
     - `/agents` lists the six agents;
     - `/` shows the five workflow commands;
     - `/memory` shows `CLAUDE.md`.

## Build it

```
/build-product-studio
```

This reads `docs/plans/STATUS.md`, picks the next milestone and runs it:

- the **planner** writes `docs/plans/M0-bootstrap.md`;
- the main session sends each task to its owner agent:
  - **backend-engineer**;
  - **export-engineer**;
  - **frontend-engineer**;
  - **test-engineer**;
- the **reviewer** checks the result, and its findings go back to the right agent (at most three rounds);
- `/verify` runs the definition-of-done checks;
- STATUS.md is updated and the work is committed on a `milestone/…` branch. Claude asks before committing, and it never pushes.

**Run one milestone per session.** When a milestone finishes, run `/clear`, then `/build-product-studio` again, or jump to one directly with `/milestone M3`.

| Command | Builds |
|---|---|
| `/milestone M0` | Monorepo, tooling, theme from tokens, app shell, CI |
| `/milestone M1` | Document schemas, migrations, CRUD, autosave, settings |
| `/milestone M2` | Jira import (must reproduce `payments-export.expected.json`) and Home |
| `/milestone M3` | Sprint/Month/PI timeline, milestones, Today, panel, tray, re-sync, zoom |
| `/milestone M4` | The draw.io-style swimlane canvas |
| `/milestone M5` | Renderer, watermark, PDF/PNG/PPTX, previews |
| `/milestone M6` | Accessibility, performance, e2e journeys, parity pass |

After the milestones are built, these commands are useful:

- `/implement-feature RM-15`, for a single requirement or change;
- `/review-against-prototype swimlanes`, for a screenshot parity check, which runs in an isolated reviewer context;
- `/verify`, at any time.

**Running unattended.** To run headless, use `claude -p "/milestone M2" --permission-mode acceptEdits`. The allow list in `settings.json` already covers the build and test commands. Commits still ask, so in headless mode review and commit the work yourself afterwards.

## Guard rails

- **Protected files.** A hook blocks edits to the files that define "correct":
  - the fixtures;
  - the prototype;
  - the reference screenshots;
  - the spec;
  - the generated API types.

  If an agent thinks one of them is wrong, it stops and tells you. To change one yourself, edit it outside Claude Code, or remove its pattern from `.claude/hooks/guard.py`.
- **The planner can't write code.** Its own hook limits its writes to `docs/plans/`.
- **The reviewer is read-only.** Write, Edit and Agent are disallowed for it.
- **Engineers can't spawn subagents.** The main session does all the orchestrating, so the order of work stays visible.
- **Personal overrides go in gitignored files:** `.claude/settings.local.json` and `CLAUDE.local.md`.

## Look at the design

Open `docs/design/prototype/index.html` in a browser. It is a single file with no build step.

**Routes:** `#home`, `#import`, `#map`, `#roadmap`, `#swimlanes`, `#export`. The journey guide at the bottom walks through the main flow.

**What's real in the prototype:**
- the timeline maths;
- zoom;
- connecting, routing, resizing, deleting and undoing in the swimlane editor.

**What's simulated:**
- Jira parsing, which uses a built-in sample;
- downloads;
- persistence.

`docs/design/screens.md` lists every screen and state, with its screenshot and spec IDs. The capture script shoots the prototype and the built app side by side:

```
node .claude/skills/prototype-parity/scripts/capture.mjs all
```

## Decisions already made (`docs/architecture.md`)

1. **ADR-1:** one backend export renderer, used for previews and files.
2. **ADR-2:** diagrams store resolved geometry.
3. **ADR-3:** the timeline maths is implemented in both TS and Python, and both are locked by the shared fixtures.
4. **ADR-4:** documents are versioned JSON with migrations.
5. **ADR-5:** no auth in v1.
6. **ADR-6:** exports run synchronously.

To change one, edit the ADR first. The agents follow the documents.
