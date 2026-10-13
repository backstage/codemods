import * as connections from '@backstage/connections/config';

const build = connections.buildConnectionsFromConfig;
type Config = connections.ConfiguredConnection;
const auth = null as unknown as connections.ConfiguredConnectionAuth;

void build;
void (null as unknown as Config);
void auth;
