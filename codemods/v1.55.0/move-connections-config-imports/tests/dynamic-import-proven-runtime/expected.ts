async function load() {
  const { buildConnectionsFromConfig: build } = await import('@backstage/connections/config');
  const auth = (await import('@backstage/connections/config')).ConfiguredConnectionAuth;
  return { build, auth };
}

void load;
