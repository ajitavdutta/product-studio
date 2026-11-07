---
name: build-product-studio
description: Master workflow for building Product Studio (React + TypeScript + FastAPI) milestone by milestone, from the spec, prototype, subagents and skills in this repo. Shows progress and runs the next milestone.
argument-hint: "[M0–M6]   (optional: milestone to start from)"
disable-model-invocation: true
allowed-tools: Bash(cat docs/plans/STATUS.md), Bash(echo *), Bash(git log *), Bash(git status *)
---

# Build Product Studio

**Product Studio** has three parts:

1. **Jira import into a roadmap:**
   - import a Jira export (CSV, JSON or XML) and map its columns;
   - create a **roadmap**, saved as a reusable, versioned **JSON** document;
   - views: **Sprint, Month and PI**;
   - also milestones, freeze windows, a detail panel, re-sync and zoom.
2. **Swimlane diagrams:** a **draw.io-style** editor for business workflows across teams:
   - hover arrows, drag-to-connect and a next-shape picker;
   - lanes that grow with their shapes;
   - delete with undo;
   - zoom.
3. **Exports:**
   - the roadmap as **PDF, PNG or PowerPoint**;
   - diagrams as **PDF or PNG**;
   - an optional **watermark** drawn into the file.

## Progress so far

```!
cat docs/plans/STATUS.md 2>/dev/null || echo "No STATUS.md yet — nothing has been built."
git log --oneline -8 2>/dev/null || true
```

## Milestones

Run them in order. Each one ends with the reviewer reporting "Nothing blocking" and `/verify` passing.

| # | Brief | Scope (requirement IDs) |
|---|---|---|
| M0 | `milestones/M0-bootstrap.md` | Monorepo, tooling, theme from tokens, app shell, CI (`G-1`, `G-5`) |
| M1 | `milestones/M1-documents-and-api.md` | Document schemas, migrations, CRUD, autosave, JSON round-trip, settings (`G-2`, `G-4`, `RM-16`, `SW-21`, `NF-3`) |
| M2 | `milestones/M2-jira-import.md` | Upload, detect, map, templates, preview, create; Home (`IMP-1`–`IMP-12`, `HOME-1`–`HOME-2`) |
| M3 | `milestones/M3-roadmap-editor.md` | Timeline views, milestones, Today, panel, tray, re-sync, zoom (`RM-1`–`RM-20`) |
| M4 | `milestones/M4-swimlane-editor.md` | The draw.io-style canvas (`SW-1`–`SW-21`) |
| M5 | `milestones/M5-exports.md` | Renderer, watermark, PDF/PNG/PPTX, previews, history (`EX-1`–`EX-13`, `SW-20`) |
| M6 | `milestones/M6-hardening.md` | Accessibility, performance (`NF-1`–`NF-4`), e2e journeys, parity pass |

The briefs are in `.claude/skills/milestone/milestones/`.

## What to do

1. Choose the milestone:
   - `$ARGUMENTS` if it was given;
   - otherwise, the first milestone that STATUS.md doesn't mark done;
   - otherwise, M0.
2. Tell the user which milestone you're starting, in one line.
3. Run it with the procedure in `.claude/skills/milestone/SKILL.md`: plan → build → test → review → verify → record.
4. Run **one milestone per session**. Each milestone fills a lot of context, so when it is done, report and suggest `/clear` followed by `/build-product-studio`. Keep going in the same session only if the user asks for several milestones at once.

## Non-negotiables (from `CLAUDE.md`)

- **Exports:** exports and previews come from the backend renderer only (ADR-1).
- **Diagrams:** they save resolved geometry (ADR-2).
- **Timeline maths:** it passes the shared fixtures on both the frontend and the backend (ADR-3).
- **Documents:** they are versioned JSON with migrations (ADR-4).
- **Auth:** there is none (ADR-5).
- **Design tokens:** use them only, never hardcoded colours.
- **Accessibility:** WCAG 2.1 AA.
- **Gaps in the spec:** when the spec is silent, choose the option consistent with the prototype, mark it `ASSUMPTION`, and keep going.
