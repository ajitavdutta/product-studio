---
name: review-against-prototype
description: Compare a built Product Studio screen with the HTML prototype at 1440×900 and 390×844 and list differences in layout, copy, states and interactions, each with a requirement ID and a fix.
argument-hint: "home | import | map | roadmap | swimlanes | export"
arguments: [route]
disable-model-invocation: true
context: fork
agent: reviewer
---

# Parity review: $route

Follow the `prototype-parity` skill. You are reviewing, so you don't edit any files.

1. Make sure the app is running. Check that `curl -s localhost:5173` answers; if it doesn't, start `make dev` in the background and wait for it.
2. Run `node .claude/skills/prototype-parity/scripts/capture.mjs $route`. It writes `parity/$route-{1440,390}-{proto,app}.png`. Open each pair with Read and compare them.
3. Exercise the interactions the prototype shows on this route. The checklist in the `prototype-parity` skill lists them. Use the Playwright MCP browser tools (from `.mcp.json`) to drive both pages. If they aren't available, list the interactions you couldn't check rather than guessing.
4. Report the differences, grouped as:
   - **Missing behaviour**;
   - **Visual / layout**;
   - **Copy**;
   - **Accessibility**.

   Give each one its requirement ID, what the prototype does, what the app does, and a concrete fix (file and component). Leave out intended deviations that are already listed in `docs/design/deviations.md`. If there are no differences, say so.
