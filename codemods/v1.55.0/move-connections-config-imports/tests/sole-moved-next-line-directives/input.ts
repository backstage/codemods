// @ts-expect-error: old root export moved
import { buildConnectionsFromConfig } from '@backstage/connections';

// @ts-expect-error: old root re-export moved
export { ConfiguredConnectionAuth } from '@backstage/connections';

void buildConnectionsFromConfig;
