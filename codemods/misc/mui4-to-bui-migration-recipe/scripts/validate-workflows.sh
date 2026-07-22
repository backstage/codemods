#!/usr/bin/env bash
# Validate registry workflow.yaml (via package) and workflow.local.yaml
# (copied out of the package so the CLI does not rewrite -w to workflow.yaml).
set -euo pipefail
cd "$(dirname "$0")/.."

yarn exec codemod workflow validate -w workflow.yaml

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp workflow.local.yaml "$tmp/workflow.local.yaml"
yarn exec codemod workflow validate -w "$tmp/workflow.local.yaml"
