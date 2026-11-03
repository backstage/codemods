import {
  // @ts-expect-error: export moved in 1.55
  buildConnectionsFromConfig,
  connectionTypes,
} from '@backstage/connections';

import {
  // @ts-ignore: old export moved
  ConfiguredConnection,
  connectionTypes as types,
} from '@backstage/connections';

export {
  // @ts-expect-error: old export moved
  ConfiguredConnectionAuth,
  connectionTypes as unchanged,
} from '@backstage/connections';

void buildConnectionsFromConfig;
void connectionTypes;
void types;
