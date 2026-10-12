const literal = "import('@backstage/connections')";
// import('@backstage/connections')

async function loadConfig() {
  const connections = await import('@backstage/connections');
  return connections.buildConnectionsFromConfig;
}

void literal;
void loadConfig;
