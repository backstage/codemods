import * as connections from '@backstage/connections/config';

const build = connections.buildConnectionsFromConfig.bind(null);
void build;
