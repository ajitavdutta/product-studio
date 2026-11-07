---
name: prototype-parity
description: How to use the HTML prototype in docs/design/prototype as the design and interaction reference — routes, what is simulated, how to compare a built screen against it with Playwright screenshots, and the parity checklist. Use when building or reviewing any screen.
---

# Prototype parity

The prototype (`docs/design/prototype/index.html`) is a single self-contained page running on sample data. It is the **look and interaction** reference. It is not production code: rebuild it with React, MUI and theme tokens.

## Open it
- Open the file directly, or run `npx serve docs/design/prototype` and visit `http://localhost:3000/#<route>`.
- Routes: `#home`, `#import`, `#map`, `#roadmap`, `#swimlanes`, `#export`.
- The dark **journey guide** bar at the bottom walks through the five steps. Click **Hide** before taking screenshots.
- Reference screenshots of each state are in `docs/design/screens/` and listed in `docs/design/screens.md`.

## What the prototype simulates (build it for real)

| Prototype | Real app |
|---|---|
| CSV header parsing only; the roadmap always uses sample epics | Full import (`jira-field-mapping`) |
| Save JSON and Export show a dialog and create no file | Download through the backend |
| Export preview drawn in the browser | Preview SVG from `POST /api/exports/preview` (ADR-1) |
| State lost on refresh | Autosave to the backend |
| One sample diagram | Saved diagrams list |
| "Re-sync" applies three hard-coded changes | Real diff (`RM-15`) |

## Compare a built screen

Use the capture script. It needs Playwright, which the frontend installs in M0, and it reads Playwright from `frontend/node_modules`.

```bash
node .claude/skills/prototype-parity/scripts/capture.mjs roadmap            # prototype + app
node .claude/skills/prototype-parity/scripts/capture.mjs swimlanes --proto-only
node .claude/skills/prototype-parity/scripts/capture.mjs all                # every route
```

- **Output:** `parity/<route>-<width>-proto.png` and `parity/<route>-<width>-app.png`, at 1440×900 and 390×844. The `parity/` folder is gitignored.
- **Before capturing:** the script hides the prototype's journey guide.
- **App address:** it defaults to `http://localhost:5173`. Override it with `--app <url>`.
- **App routes:** the route map at the top of the script turns each prototype route into an app route. Update the map when the app's routes change.
- **Comparing:** open the pairs with Read and compare them by eye.

Parity means the same layout, hierarchy, copy, states and interactions. It does **not** mean identical pixels.

**States the screenshots can't show** need the Playwright MCP browser tools from `.mcp.json`, or a Playwright test:
- hover picker;
- drag preview;
- context menu;
- collapsed panels;
- dialogs.

The reference PNGs in `docs/design/screens/` show the prototype in each of these states.

## Checklist
- [ ] Layout regions and their order match: top bar, toolbar, summary cards, main area, right panel, tray, legend.
- [ ] Copy matches, including empty and warning text, button labels and snackbar messages.
- [ ] Interactive states exist: hover handles, selection ring, disabled buttons, the collapsed panel rail, the picker, the context menu, the drag preview and the target highlight.
- [ ] Colours come from tokens (status, lanes, milestones, IP hatch, current sprint).
- [ ] The 390px layout stacks and scrolls with nothing clipped.
- [ ] Keyboard and screen-reader paths exist for every pointer-only interaction in the prototype.
- [ ] Deviations are listed in the PR description, with the reason.
