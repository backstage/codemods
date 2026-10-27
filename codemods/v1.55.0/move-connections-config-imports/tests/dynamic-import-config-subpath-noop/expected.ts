type Configured = import('@backstage/connections/config').ConfiguredConnection;

async function loadConfig() {
  return import('@backstage/connections/config');
}

void (null as unknown as Configured);
void loadConfig;
