#!/bin/sh
CI=1 yarn backstage-repo-tools repo schema openapi validate --strict && \
  ./node_modules/.bin/backstage-repo-tools repo schema openapi 'validate' | cat
