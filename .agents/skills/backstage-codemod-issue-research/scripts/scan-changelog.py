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
PATCH_DEPRECATION_RE = re.compile(
    r"\b(?:deprecated|removed|renamed|replaced)\b", re.IGNORECASE
)
PACKAGE_HEADER_RE = re.compile(r"^## (@[^\s]+)")
SECTION_HEADER_RE = re.compile(r"^### (Minor Changes|Patch Changes|Major Changes)")


def scan_changelog(text: str, *, include_patches: bool = False) -> list[dict]:
    current_package: str | None = None
    current_section: str | None = None
    entries: list[dict] = []

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]

        # Track current package
        pkg_match = PACKAGE_HEADER_RE.match(line)
        if pkg_match:
            current_package = pkg_match.group(1)
            current_section = None
            i += 1
            continue

        # Track current section (Minor Changes / Patch Changes)
        section_match = SECTION_HEADER_RE.match(line)
        if section_match:
            current_section = section_match.group(1)
            i += 1
            continue

        is_minor_or_major = current_section in ("Minor Changes", "Major Changes")
        is_patch = current_section == "Patch Changes"

        is_breaking = bool(BREAKING_RE.search(line)) and is_minor_or_major
        is_deprecated = (
            bool(DEPRECATED_RE.search(line)) and not is_breaking and is_minor_or_major
        )
        is_patch_deprecation = (
            include_patches
            and is_patch
            and bool(PATCH_DEPRECATION_RE.search(line))
            and line.strip().startswith("- ")
            and "Updated dependencies" not in line
        )

        if (is_breaking or is_deprecated or is_patch_deprecation) and current_package:
            # Collect paragraph + following diff block until blank line after fence closes
            block_lines = [line]
            i += 1
            in_fence = False
            while i < len(lines):
                next_line = lines[i]
                if next_line.startswith("## ") or SECTION_HEADER_RE.match(next_line):
                    break
                if next_line.strip().startswith("```"):
                    in_fence = not in_fence
                block_lines.append(next_line)
                i += 1
                if not in_fence and next_line.strip() == "" and len(block_lines) > 1:
                    # End of prose block when not inside fence
                    if not any(
                        l.strip().startswith("```") for l in block_lines[-3:]
                    ):
                        break
            summary = "\n".join(block_lines).strip()

            if is_breaking:
                kind = "breaking"
            elif is_deprecated:
                kind = "deprecated"
            else:
                kind = "patch-deprecation"

            source = "patch" if is_patch else "minor"

            entries.append(
                {
                    "package": current_package,
                    "kind": kind,
                    "source": source,
                    "summary": summary[:500]
                    + ("..." if len(summary) > 500 else ""),
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
        choices=("breaking", "deprecated", "patch-deprecation", "all"),
        default="all",
        help="Filter by entry kind (default: all)",
    )
    parser.add_argument(
        "--include-patches",
        action="store_true",
        default=True,
        help="Include Patch Changes with deprecated/removed/renamed keywords (default: true)",
    )
    parser.add_argument(
        "--no-patches",
        action="store_true",
        help="Exclude Patch Changes (only scan Minor/Major Changes)",
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

    include_patches = not args.no_patches

    text = args.changelog.read_text(encoding="utf-8")
    entries = scan_changelog(text, include_patches=include_patches)

    if args.kind != "all":
        entries = [e for e in entries if e["kind"] == args.kind]

    compact = args.compact or not sys.stdout.isatty()
    if compact:
        print(
            json.dumps(
                {"entries": entries, "count": len(entries)}, separators=(",", ":")
            )
        )
    else:
        print(json.dumps({"entries": entries, "count": len(entries)}, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
