const literal = "import('@backstage/connections')";
// import('@backstage/connections')

const wrapped = wrap(import('@backstage/catalog-model'), '@backstage/connections');

async function loadConfig() {
  const connections = await import('@backstage/connections');
  return connections.buildConnectionsFromConfig;
}

void literal;
void wrapped;
void loadConfig;
