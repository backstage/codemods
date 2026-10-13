// @ts-expect-error: old root export moved
import { buildConnectionsFromConfig, connectionTypes } from '@backstage/connections';

// @ts-ignore: old root export moved
import { ConfiguredConnection, connectionTypes as types } from '@backstage/connections';

// @ts-expect-error: old root re-export moved
export { ConfiguredConnectionAuth, connectionTypes } from '@backstage/connections';

void buildConnectionsFromConfig;
void connectionTypes;
void types;
