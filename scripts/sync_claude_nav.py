#!/usr/bin/env python3
"""Sync the 'Codebase Navigation Map' section in CLAUDE.md with the actual file system.

Scans apps/, services/, and packages/ to auto-generate an accurate navigation map
so any LLM reading CLAUDE.md gets a correct picture of the monorepo structure.

Run manually:  python scripts/sync_claude_nav.py
Runs automatically via pre-commit hook.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLAUDE_MD = ROOT / "CLAUDE.md"

SECTION_START = "## Codebase Navigation Map"
# Matches the next ## heading (end of our section)
NEXT_SECTION_RE = re.compile(r"^## (?!Codebase Navigation Map)", re.MULTILINE)


def is_stub(app_dir: Path) -> bool:
    """An app is a stub if it has no src/ directory."""
    return not (app_dir / "src").is_dir()


def read_description(pkg_dir: Path) -> str:
    """Read description from package.json, or return empty string."""
    pj = pkg_dir / "package.json"
    if not pj.exists():
        return ""
    try:
        data = json.loads(pj.read_text())
        return data.get("description", "")
    except (json.JSONDecodeError, OSError):
        return ""


def extract_nav_items(layout_path: Path) -> list[dict[str, str]]:
    """Extract NAV_ITEMS array from a layout.tsx file. Returns list of {href, label}."""
    if not layout_path.exists():
        return []
    content = layout_path.read_text()
    # Match: { href: '/foo', label: 'Foo' } or { href: '/', label: 'Home', exact: true }
    pattern = re.compile(
        r"""\{\s*href:\s*['"]([^'"]+)['"]\s*,\s*label:\s*['"]([^'"]+)['"]""",
    )
    matches = pattern.findall(content)
    return [{"href": m[0], "label": m[1]} for m in matches]


def detect_app_type(app_dir: Path) -> str:
    """Detect what kind of app this is based on files present."""
    if (app_dir / "src" / "app" / "layout.tsx").exists():
        return "next"
    if (app_dir / "drizzle.config.ts").exists():
        return "api"
    if (app_dir / "app.json").exists():
        return "expo"
    return "unknown"


def detect_nav_pattern(app_dir: Path) -> str:
    """Detect nav pattern from layout.tsx content."""
    layout = app_dir / "src" / "app" / "layout.tsx"
    if not layout.exists():
        return "—"
    content = layout.read_text()
    if "AdminSidebar" in content or "sidebar" in content.lower():
        return "Fixed left sidebar (`NAV_ITEMS` in `layout.tsx`)"
    if "sticky top" in content or "AppShell" in content:
        return "Sticky top navbar (`NAV_ITEMS` in `layout.tsx`)"
    if "NAV_ITEMS" in content:
        return "`NAV_ITEMS` in `layout.tsx`"
    return "—"


def generate_section() -> str:
    """Generate the full Codebase Navigation Map markdown section."""
    lines: list[str] = []
    lines.append(SECTION_START)
    lines.append("")
    lines.append(
        "Turborepo monorepo. All apps share `@playbook/shared-types` and `@playbook/shared-ui`."
    )
    lines.append("")

    # --- Apps table ---
    lines.append("### Apps")
    lines.append("")
    lines.append("| App | Path | Purpose | Nav pattern |")
    lines.append("|-----|------|---------|-------------|")

    apps_dir = ROOT / "apps"
    if apps_dir.is_dir():
        for app in sorted(apps_dir.iterdir()):
            if not app.is_dir():
                continue
            name = app.name
            desc = read_description(app) or name
            stub = is_stub(app)

            if stub:
                lines.append(
                    f"| **{name}** | `apps/{name}/` | {desc} | **Stub — not yet implemented** |"
                )
            else:
                nav = detect_nav_pattern(app)
                lines.append(f"| **{name}** | `apps/{name}/` | {desc} | {nav} |")

    lines.append("")

    # --- Routes per non-stub Next.js app ---
    lines.append("### Routes")
    lines.append("")

    if apps_dir.is_dir():
        for app in sorted(apps_dir.iterdir()):
            if not app.is_dir() or is_stub(app):
                continue
            app_type = detect_app_type(app)
            if app_type != "next":
                continue
            nav_items = extract_nav_items(app / "src" / "app" / "layout.tsx")
            if not nav_items:
                continue
            lines.append(f"**{app.name}**: ", )
            routes_str = " | ".join(
                f"`{item['href']}` ({item['label']})" for item in nav_items
            )
            # Overwrite last line to include routes inline
            lines[-1] = f"**{app.name}**: {routes_str}"
            lines.append("")

    # --- Key file locations ---
    lines.append("### Key file locations per app")
    lines.append("")
    lines.append("```")
    lines.append("apps/{web,admin}/")
    lines.append("├── src/app/layout.tsx      ← Root layout, nav config (NAV_ITEMS array), auth gating")
    lines.append("├── src/app/page.tsx        ← Home route")
    lines.append("├── src/app/*/page.tsx      ← Feature routes (prompts, costs, memory)")
    lines.append("├── src/components/         ← Shared UI (NavLink for active-state highlighting)")
    lines.append("├── src/providers/          ← Context providers (PostHog, Clerk)")
    lines.append("├── src/hooks/              ← Custom hooks")
    lines.append("└── src/middleware.ts       ← Clerk route middleware")
    lines.append("")
    lines.append("apps/api/")
    lines.append("├── src/                    ← API server source")
    lines.append("├── drizzle/               ← Database migrations")
    lines.append("└── tests/                 ← API tests")
    lines.append("```")
    lines.append("")

    # --- Services table ---
    lines.append("### Services & packages")
    lines.append("")
    lines.append("| Path | What |")
    lines.append("|------|------|")

    services_dir = ROOT / "services"
    if services_dir.is_dir():
        for svc in sorted(services_dir.iterdir()):
            if not svc.is_dir():
                continue
            desc = read_description(svc) or svc.name
            lines.append(f"| `services/{svc.name}/` | {desc} |")

    packages_dir = ROOT / "packages"
    if packages_dir.is_dir():
        for pkg in sorted(packages_dir.iterdir()):
            if not pkg.is_dir():
                continue
            desc = read_description(pkg) or pkg.name
            lines.append(f"| `packages/{pkg.name}/` | {desc} |")

    lines.append("")

    # --- Navigation conventions ---
    lines.append("### Navigation conventions")
    lines.append("")
    lines.append("- Both web and admin apps use a `NAV_ITEMS` config array in `layout.tsx` — add new routes there")
    lines.append("- Active link highlighting via `NavLink` client component (`src/components/nav-link.tsx`)")
    lines.append("- All routing is Next.js App Router file-system based — no external router library")
    lines.append("- To add a new page: create `src/app/{route}/page.tsx` + add entry to `NAV_ITEMS`")
    lines.append("")

    return "\n".join(lines)


def update_claude_md() -> bool:
    """Replace the nav map section in CLAUDE.md. Returns True if content changed."""
    if not CLAUDE_MD.exists():
        print("CLAUDE.md not found — skipping nav sync")
        return False

    content = CLAUDE_MD.read_text()
    new_section = generate_section()

    # Find the section boundaries
    start_idx = content.find(SECTION_START)
    if start_idx == -1:
        # Section doesn't exist yet — insert before "## For New LLMs Joining"
        insert_marker = "## For New LLMs Joining"
        insert_idx = content.find(insert_marker)
        if insert_idx == -1:
            new_content = content.rstrip() + "\n\n" + new_section
        else:
            new_content = content[:insert_idx] + new_section + "\n" + content[insert_idx:]
    else:
        # Find the end of the section (next ## heading)
        after_start = content[start_idx + len(SECTION_START) :]
        match = NEXT_SECTION_RE.search(after_start)
        if match:
            end_idx = start_idx + len(SECTION_START) + match.start()
        else:
            end_idx = len(content)

        # Ensure blank line before the next section
        new_content = content[:start_idx] + new_section + "\n" + content[end_idx:]

    if new_content == content:
        return False

    CLAUDE_MD.write_text(new_content)
    return True


def main() -> int:
    changed = update_claude_md()
    if changed:
        # Stage the updated CLAUDE.md so it's included in the commit
        subprocess.run(["git", "add", str(CLAUDE_MD)], cwd=ROOT, check=True)
        print("sync_claude_nav: CLAUDE.md navigation map updated and staged.")
        # Exit 1 so pre-commit fails this run — user re-commits to pick up the fix
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
