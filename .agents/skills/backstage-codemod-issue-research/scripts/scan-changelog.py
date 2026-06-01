#!/usr/bin/env python3
"""Extract BREAKING and deprecation candidates from a Backstage consolidated changelog."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BREAKING_RE = re.compile(r"\*\*BREAKING\*\*", re.IGNORECASE)
DEPRECATED_RE = re.compile(r"\bdeprecated\b", re.IGNORECASE)
PACKAGE_HEADER_RE = re.compile(r"^## (@[^\s]+)")


def scan_changelog(text: str) -> list[dict]:
    current_package: str | None = None
    entries: list[dict] = []

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        pkg_match = PACKAGE_HEADER_RE.match(line)
        if pkg_match:
            current_package = pkg_match.group(1)
            i += 1
            continue

        is_breaking = bool(BREAKING_RE.search(line))
        is_deprecated = bool(DEPRECATED_RE.search(line)) and not is_breaking

        if (is_breaking or is_deprecated) and current_package:
            # Collect paragraph + following diff block until blank line after fence closes
            block_lines = [line]
            i += 1
            in_fence = False
            while i < len(lines):
                next_line = lines[i]
                if next_line.startswith("## "):
                    break
                if next_line.strip().startswith("```"):
                    in_fence = not in_fence
                block_lines.append(next_line)
                i += 1
                if not in_fence and next_line.strip() == "" and len(block_lines) > 1:
                    # End of prose block when not inside fence
                    if not any(l.strip().startswith("```") for l in block_lines[-3:]):
                        break
            summary = "\n".join(block_lines).strip()
            entries.append(
                {
                    "package": current_package,
                    "kind": "breaking" if is_breaking else "deprecated",
                    "summary": summary[:500] + ("..." if len(summary) > 500 else ""),
                }
            )
            continue

        i += 1

    return entries


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scan a Backstage consolidated changelog for BREAKING and deprecated entries."
    )
    parser.add_argument(
        "changelog",
        type=Path,
        help="Path to docs/releases/vX.Y.Z-changelog.md",
    )
    parser.add_argument(
        "--kind",
        choices=("breaking", "deprecated", "all"),
        default="all",
        help="Filter by entry kind (default: all)",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Emit compact JSON (default when piped)",
    )
    args = parser.parse_args()

    if not args.changelog.is_file():
        print(f"error: file not found: {args.changelog}", file=sys.stderr)
        return 1

    text = args.changelog.read_text(encoding="utf-8")
    entries = scan_changelog(text)

    if args.kind != "all":
        entries = [e for e in entries if e["kind"] == args.kind]

    compact = args.compact or not sys.stdout.isatty()
    if compact:
        print(json.dumps({"entries": entries, "count": len(entries)}, separators=(",", ":")))
    else:
        print(json.dumps({"entries": entries, "count": len(entries)}, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
