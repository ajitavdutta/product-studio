#!/usr/bin/env python3
"""PostToolUse formatter for Edit / Write.

Formats the file Claude just changed: ruff for backend Python, prettier for frontend sources.
Never blocks: if a tool is missing (e.g. before M0 scaffolds the project) it does nothing.
Lint problems that ruff can't fix are reported back to Claude as context.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

PRETTIER_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css", ".md"}


def run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return None


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    raw = (data.get("tool_input") or {}).get("file_path")
    if not raw:
        return 0
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()).resolve()
    path = Path(raw)
    if not path.is_absolute():
        path = root / path
    try:
        rel = path.resolve().relative_to(root)
    except ValueError:
        return 0
    if not path.exists():
        return 0
    parts = rel.parts

    if parts[0] == "backend" and path.suffix == ".py" and (root / "backend/pyproject.toml").exists() and shutil.which("uv"):
        target = str(path.relative_to(root / "backend"))
        run(["uv", "run", "--quiet", "ruff", "format", target], root / "backend")
        res = run(["uv", "run", "--quiet", "ruff", "check", "--fix", target], root / "backend")
        if res and res.returncode not in (0, None) and res.stdout.strip():
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": f"ruff found issues in {rel}:\n{res.stdout.strip()[:1500]}",
                }
            }))
    elif parts[0] == "frontend" and path.suffix in PRETTIER_EXT and (root / "frontend/node_modules/.bin/prettier").exists():
        target = str(path.relative_to(root / "frontend"))
        if target != "src/api/types.ts":
            run(["node_modules/.bin/prettier", "--write", "--log-level", "warn", target], root / "frontend")
    return 0


if __name__ == "__main__":
    sys.exit(main())
