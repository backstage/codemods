// TODO(backstage-codemod): Review dynamic import from '@backstage/connections' — move configuration exports to '@backstage/connections/config' when provenance is clear.
async function loadConfig() {
  const connections = await import('@backstage/connections');
  return connections.buildConnectionsFromConfig;
}

void loadConfig;
