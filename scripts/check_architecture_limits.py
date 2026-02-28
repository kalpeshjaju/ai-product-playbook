"""
Enforce architecture limits: 600 lines per file, 120 lines per function.

CI fails on hard breaches. Legacy files can be allowlisted during migration
via scripts/architecture_limits_allowlist.json.

Usage:
  python scripts/check_architecture_limits.py
Exit: 0 if within limits or allowlisted, 1 otherwise.

AUTHOR: Adapted from job-matchmaker
LAST UPDATED: 2026-02-28
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILE_LINE_LIMIT = 600
FUNCTION_LINE_LIMIT = 120
ALLOWLIST_PATH = ROOT / "scripts" / "architecture_limits_allowlist.json"

# Directories and suffixes to scan
INCLUDE_DIRS = ("src", "backend", "frontend", "lib", "app", "packages")
EXCLUDE_DIRS = ("node_modules", ".next", ".venv", "__pycache__", ".git", "dist", "build")
PY_SUFFIXES = (".py",)
TS_SUFFIXES = (".ts", ".tsx")


def load_allowlist() -> set[str]:
    """Load allowlisted paths (relative to ROOT)."""
    if not ALLOWLIST_PATH.exists():
        return set()
    data = json.loads(ALLOWLIST_PATH.read_text())
    return set(data.get("file_allowlist", []))


def collect_files() -> list[Path]:
    """Return relevant source files under ROOT."""
    out: list[Path] = []
    for include in INCLUDE_DIRS:
        base = ROOT / include
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if any(ex in path.parts for ex in EXCLUDE_DIRS):
                continue
            if path.suffix in PY_SUFFIXES or path.suffix in TS_SUFFIXES:
                out.append(path)
    return sorted(out)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def line_count(path: Path) -> int:
    try:
        return len(path.read_text().splitlines())
    except Exception:
        return 0


def function_ranges_py(content: str) -> list[tuple[int, int]]:
    """Return (start_line, end_line) for each top-level function."""
    try:
        tree = ast.parse(content)
        ranges: list[tuple[int, int]] = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                start = node.lineno
                end = node.end_lineno if hasattr(node, "end_lineno") and node.end_lineno else start
                ranges.append((start, end))
        return ranges
    except SyntaxError:
        return []


def function_ranges_ts(content: str) -> list[tuple[int, int]]:
    """Approximate function ranges in TS/TSx: block after 'function' or '=>'."""
    ranges: list[tuple[int, int]] = []
    lines = content.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.search(r"\bfunction\s+\w+\s*\(|=>\s*\{", line):
            start = i + 1
            depth = line.count("{") - line.count("}")
            j = i + 1
            while j < len(lines) and depth > 0:
                depth += lines[j].count("{") - lines[j].count("}")
                j += 1
            end = j
            ranges.append((start, end))
            i = j
        else:
            i += 1
    return ranges


def check_file(path: Path, allowlist: set[str], errors: list[str]) -> None:
    rel_path = rel(path)
    allowed = rel_path in allowlist
    content = path.read_text()
    file_lines = len(content.splitlines())

    if file_lines > FILE_LINE_LIMIT and not allowed:
        errors.append(f"{rel_path}: {file_lines} lines (limit {FILE_LINE_LIMIT})")

    if path.suffix in PY_SUFFIXES:
        for start, end in function_ranges_py(content):
            span = end - start + 1
            if span > FUNCTION_LINE_LIMIT and not allowed:
                errors.append(f"{rel_path}: function at line {start} has {span} lines (limit {FUNCTION_LINE_LIMIT})")
    elif path.suffix in TS_SUFFIXES:
        for start, end in function_ranges_ts(content):
            span = end - start + 1
            if span > FUNCTION_LINE_LIMIT and not allowed:
                errors.append(f"{rel_path}: function at line {start} has {span} lines (limit {FUNCTION_LINE_LIMIT})")


def main() -> int:
    allowlist = load_allowlist()
    files = collect_files()
    errors: list[str] = []
    for path in files:
        check_file(path, allowlist, errors)

    if errors:
        for e in errors:
            print(e)
        print(f"\n{len(errors)} architecture limit breach(es). Add to scripts/architecture_limits_allowlist.json if legacy.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
