#!/usr/bin/env bash
# Regenerate README.md when codemod manifests change (matches CI README freshness check).
set -euo pipefail

yarn readme
git add README.md
