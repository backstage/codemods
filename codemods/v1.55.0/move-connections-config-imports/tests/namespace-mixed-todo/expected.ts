import * as connections from '@backstage/connections';
// TODO(backstage-codemod): Review namespace import 'connections' from '@backstage/connections' (mixed-members). Move configuration exports to '@backstage/connections/config' when provenance is clear.

const build = connections.buildConnectionsFromConfig;
const names = connections.connectionTypes;

void build;
void names;
