async function load() {
  const { buildConnectionsFromConfig, connectionTypes } = await import('@backstage/connections');
  return { buildConnectionsFromConfig, connectionTypes };
}

void load;
