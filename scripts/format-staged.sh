#!/usr/bin/env bash
# oxfmt exits 2 when every staged target is an ignored test fixture.
set -euo pipefail

files=()
for file in "$@"; do
  case "${file//\\//}" in
    tests/*|tests-*/*|*/tests/*|*/tests-*/*) ;;
    *) files+=("$file") ;;
  esac
done

if [ "${#files[@]}" -gt 0 ]; then
  yarn format "${files[@]}"
fi
