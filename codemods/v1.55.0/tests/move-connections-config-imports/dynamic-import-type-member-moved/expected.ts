type Connections = import('@backstage/connections').ConnectionsService;
type Configured = import('@backstage/connections/config').ConfiguredConnection;
type BuildFromConfig = typeof import('@backstage/connections/config').buildConnectionsFromConfig;

void (null as unknown as Connections);
void (null as unknown as Configured);
void (null as unknown as BuildFromConfig);
