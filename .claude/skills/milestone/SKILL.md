---
name: milestone
description: Run one Product Studio milestone (M0–M6) end to end — plan with the planner subagent, build with the engineer subagents in order, test, review, fix, verify, and record status. Use when the user asks to build, continue or redo a specific milestone.
argument-hint: "M0 | M1 | M2 | M3 | M4 | M5 | M6"
arguments: [milestone]
disable-model-invocation: true
allowed-tools: Bash(git status *), Bash(git branch *), Bash(git switch *), Bash(git log *), Bash(ls *), Bash(echo *)
---

# Milestone $milestone

## Where things stand

```!
git status --short --branch 2>/dev/null || true
ls docs/plans 2>/dev/null || echo "(no plans yet)"
```

The brief for this milestone is in [milestones/](milestones/). Read the file whose name starts with `$milestone` (for example `milestones/M3-roadmap-editor.md`). If `$milestone` is empty or doesn't match a brief, read `docs/plans/STATUS.md`, take the first milestone that isn't marked done, and say which one you picked.

## Procedure

You are the orchestrator. Keep your own context small: subagents do the reading and the coding, and you pass them paths, not file contents.

1. **Branch.** If the current branch is the default branch, create `milestone/$milestone-<slug>`.

2. **Plan.** Spawn the **planner** with this prompt:

   > Plan milestone $milestone. Brief: `.claude/skills/milestone/milestones/<file>`. Write `docs/plans/$milestone-<slug>.md`.

   If a plan for this milestone already exists, ask the planner to update it, not to start over. Read the plan's **Ordered tasks** and **Done when** sections.

3. **Build.** Spawn the owner agent for each task, in plan order, one at a time. Give each one the plan path and its task numbers, for example:

   > Implement tasks 3–5 of `docs/plans/M2-jira-import.md`. Report in the format your instructions give.

   The order is:
   - **backend-engineer** for the contracts (schemas, routes, `gen:api`);
   - **export-engineer**, when the plan has render or export tasks;
   - **frontend-engineer**;
   - **test-engineer**.

   Run two agents in parallel only when the plan says their tasks touch disjoint directories (for example `backend/app/render/` and `frontend/src/features/import/`).

   After each report, check that the commands it ran passed. If they didn't, send the failure back to the same agent once, with its report.

4. **Review.** Spawn the **reviewer** with this prompt:

   > Review milestone $milestone against `docs/plans/<file>`. App is running with `make dev` — start it if it isn't.

   For each **Blocking** or **Should fix** finding, spawn the agent the reviewer named, with the finding quoted. Then review again. Stop after **three** review rounds, and bring what is left to the user.

5. **Verify.** Run the `/verify` checks yourself, following `.claude/skills/verify/SKILL.md`.

6. **Record.**
   - Update `docs/plans/STATUS.md`: one row per milestone with its status, plan link, date, and open `ASSUMPTION`s or deviations.
   - Commit on the milestone branch with the message `$milestone: <summary> (<IDs>)`. Don't push unless the user asks.

7. **Report to the user** in no more than 10 lines:
   - what now works, as IDs and user-visible behaviour;
   - the verify results;
   - the assumptions they should confirm;
   - the next step, `/clear` then `/milestone M<next>`.

## Rules

- Never edit the protected files (see `CLAUDE.md`). If a fixture or the spec seems wrong, stop and ask the user.
- Don't skip the reviewer, even when everything passes.
- If a subagent reports that it is blocked, decide whether it is a plan problem (send it to the planner) or a product question (ask the user). Don't let an engineer guess at product behaviour.
