#!/bin/sh
CI=1 yarn backstage-repo-tools repo schema openapi verify --strict && \
  ./node_modules/.bin/backstage-repo-tools repo schema openapi 'verify' | cat
