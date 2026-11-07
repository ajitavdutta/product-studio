<!-- Brief for /milestone M6: M6 — hardening: accessibility audit, performance budgets, the five e2e journeys at 1440 and 390, prototype parity pass, docs. -->

# M6 · Hardening

Requirements: `NF-1`–`NF-4`, plus a parity pass over every screen.

1. **Accessibility** (WCAG 2.1 AA):
   - keyboard-only runs of each journey;
   - focus order and visible focus rings;
   - `aria-label`s, `aria-pressed`, and the menu roles;
   - contrast of every text style, including 11px labels and text on coloured bars.

   The reviewer reports the fixes needed; route them to the engineers.
2. **Performance:** seed 300 epics and a diagram with 200 shapes and 300 connectors. Measure roadmap scroll and zoom, canvas drag and export time. Budgets are in `NF-1`. Profile and fix the biggest offender first.
3. **E2E:** the five journeys in `.claude/agents/test-engineer.md` pass at 1440×900, and the smoke tests pass at 390×844.
4. **Parity:** run the `prototype-parity` checklist for each route. List the remaining deviations in `docs/design/deviations.md`.
5. **Docs:** a README quick start, `docs/user-guide.md` with one paragraph per screen, and the changelog.
