#!/usr/bin/env python3
"""PreToolUse guard for Edit / Write / NotebookEdit.

Default: block edits to Product Studio's sources of truth.
--only <prefix> [<prefix> ...]: block every edit outside the given repo-relative prefixes
(used by the planner subagent, which may only write docs/plans/).

Exit 2 blocks the tool call and feeds stderr back to Claude.
"""
import json
import os
import sys
from fnmatch import fnmatch
from pathlib import Path

PROTECTED = [
    "docs/fixtures/*",
    "docs/design/prototype/*",
    "docs/design/screens/*",
    "docs/product-spec.md",
    "frontend/src/api/types.ts",
]
WHY = {
    "docs/fixtures/*": "fixtures are the expected results both test suites must meet",
    "docs/design/prototype/*": "the prototype is the design reference",
    "docs/design/screens/*": "reference screenshots are captured from the prototype",
    "docs/product-spec.md": "the spec is owned by the product owner",
    "frontend/src/api/types.ts": "it is generated — run `pnpm -C frontend gen:api` instead",
}


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    tool_input = data.get("tool_input") or {}
    raw = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not raw:
        return 0
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()).resolve()
    path = Path(raw)
    if not path.is_absolute():
        path = Path(data.get("cwd") or root) / path
    try:
        rel = path.resolve().relative_to(root).as_posix()
    except ValueError:
        return 0  # outside the repo: not ours to police

    args = sys.argv[1:]
    if args and args[0] == "--only":
        allowed = [a.rstrip("/") + "/" for a in args[1:]] or ["docs/plans/"]
        if not any(rel.startswith(a) for a in allowed):
            print(
                f"Blocked: this agent may only write under {', '.join(allowed)} (tried {rel}). "
                "Put the change in the plan for the owning engineer instead.",
                file=sys.stderr,
            )
            return 2

    for pattern in PROTECTED:
        if fnmatch(rel, pattern):
            print(
                f"Blocked: {rel} is protected ({WHY[pattern]}). "
                "Don't work around this. If the file looks wrong, stop and tell the user what you found.",
                file=sys.stderr,
            )
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
