#!/usr/bin/env node

async function load() {
  return import('@backstage/connections');
}

void load;
