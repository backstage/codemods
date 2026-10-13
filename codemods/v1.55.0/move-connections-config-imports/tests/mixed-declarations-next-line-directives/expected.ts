// TODO(backstage-codemod): Review mixed import from '@backstage/connections' with next-line diagnostic directive; move configuration exports to '@backstage/connections/config' manually.
// @ts-expect-error: old root export moved
import { buildConnectionsFromConfig, connectionTypes } from '@backstage/connections';

// TODO(backstage-codemod): Review mixed import from '@backstage/connections' with next-line diagnostic directive; move configuration exports to '@backstage/connections/config' manually.
// @ts-ignore: old root export moved
import { ConfiguredConnection, connectionTypes as types } from '@backstage/connections';

// TODO(backstage-codemod): Review mixed export from '@backstage/connections' with next-line diagnostic directive; move configuration exports to '@backstage/connections/config' manually.
// @ts-expect-error: old root re-export moved
export { ConfiguredConnectionAuth, connectionTypes } from '@backstage/connections';

void buildConnectionsFromConfig;
void connectionTypes;
void types;
