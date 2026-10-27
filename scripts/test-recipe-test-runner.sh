#!/usr/bin/env bash
# CI entry: runs the recipe-test-runner regression test from the root
# scripts/test-*.sh loop.
set -euo pipefail
exec node "$(cd "$(dirname "$0")" && pwd)/../packages/recipe-test-runner/test.ts"
