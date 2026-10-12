async function loadConfig() {
  const connections = await import('@backstage/connections');
  return connections.buildConnectionsFromConfig;
}

void loadConfig;
