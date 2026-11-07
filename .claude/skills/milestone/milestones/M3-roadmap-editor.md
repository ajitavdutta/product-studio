<!-- Brief for /milestone M3: M3 — roadmap editor: Sprint/Month/PI timeline, PI cadence with IP sprints, milestones and freeze bands, Today, summary cards, detail panel (collapsible), unscheduled tray, re-sync, Save/Open JSON and zoom. -->

# M3 · Roadmap editor

Load `roadmap-timeline` and `prototype-parity`. Prototype route: `#roadmap`. Use the Sprints, Months and PIs buttons, the zoom controls and the panel collapse. Requirements: `RM-1`–`RM-20`.

- **Shared maths first** (ADR-3):
  - `frontend/src/lib/timeline/{cadence,scale,labels}.ts` and `backend/app/render/timeline.py`;
  - both pass `docs/fixtures/timeline/{sprints,months,pis}.json` and the compact-date cases.
- **Frontend `features/roadmap/`:**
  - toolbar;
  - summary cards (computed from the document);
  - timeline with the 220px label column, team header rows, epic rows, bars, the header for each view, the milestones row, milestone lines, freeze bands and the Today line/label;
  - unscheduled tray and legend strip;
  - detail panel with editable fields (optimistic), the "Runs … crosses Beta" line, progress, stories and notes, collapsing to a rail;
  - zoom control, Ctrl+wheel, keyboard shortcuts and Fit.
- **Re-sync:** `POST /api/roadmaps/{id}/resync`, then a diff dialog, then apply. Keep user edits (track `editedFields`).
- **Manage PIs** dialog: name, start date, sprint count and IP toggle, with a live preview of the header.

## Done when
- At 1440×900, all three views match `docs/design/screens/04-roadmap-*.png`. The Sprint view shows sprint dates on one line at 100%, and compact dates at Fit.
- Editing an epic's start date moves its bar and autosaves. Collapsing the panel persists after a reload.
