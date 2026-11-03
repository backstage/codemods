async function load() {
  const { buildConnectionsFromConfig: build } = await import('@backstage/connections');
  const auth = (await import('@backstage/connections')).ConfiguredConnectionAuth;
  return { build, auth };
}

void load;
