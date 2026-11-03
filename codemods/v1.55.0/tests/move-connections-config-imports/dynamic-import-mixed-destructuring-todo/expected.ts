// TODO(backstage-codemod): Review dynamic import from '@backstage/connections' — move configuration exports to '@backstage/connections/config' when provenance is clear.
async function load() {
  const { buildConnectionsFromConfig, connectionTypes } = await import('@backstage/connections');
  return { buildConnectionsFromConfig, connectionTypes };
}

void load;
