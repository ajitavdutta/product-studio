---
name: implement-feature
description: Implement one Product Studio requirement ID or small feature end to end (plan → contract → backend → frontend → tests → review), checked against the spec and prototype.
argument-hint: "<requirement ID(s) or short description>, e.g. SW-8 shape picker"
disable-model-invocation: true
---

# Implement: $ARGUMENTS

1. **Scope.** Find `$ARGUMENTS` in `docs/product-spec.md` and collect every related requirement ID. Find the matching prototype route and its row in `docs/design/screens.md`. If the request isn't covered by the spec, tell the user it is a spec change and ask whether to go ahead.
2. **Plan.**
   - If the change touches more than one layer or more than about 3 files, spawn the **planner** with this prompt:

     > Plan feature `$ARGUMENTS` as `docs/plans/feature-<slug>.md`.

   - Otherwise, write a short task list yourself.
3. **Build.** Spawn the owner agents in order: backend-engineer, then export-engineer, then frontend-engineer, then test-engineer. Give each one the plan path and its task numbers.
4. **Review.** Spawn the **reviewer** on the change. Route its Blocking and Should-fix findings back to the agents it names, for at most two rounds.
5. **Verify.** Run the `/verify` checks and report:
   - the IDs satisfied;
   - the files changed;
   - the verify results;
   - any deviations or assumptions.
