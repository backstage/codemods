#!/usr/bin/env node
// TODO(backstage-codemod): Review dynamic import from '@backstage/connections' — move configuration exports to '@backstage/connections/config' when provenance is clear.

async function load() {
  return import('@backstage/connections');
}

void load;
