// TODO(backstage-codemod): Review mixed import from '@backstage/connections' with next-line diagnostic directive; move configuration exports to '@backstage/connections/config' manually.
import {
  // @ts-expect-error: export moved in 1.55
  buildConnectionsFromConfig,
  connectionTypes,
} from '@backstage/connections';

// TODO(backstage-codemod): Review mixed import from '@backstage/connections' with next-line diagnostic directive; move configuration exports to '@backstage/connections/config' manually.
import {
  // @ts-ignore: old export moved
  ConfiguredConnection,
  connectionTypes as types,
} from '@backstage/connections';

// TODO(backstage-codemod): Review mixed export from '@backstage/connections' with next-line diagnostic directive; move configuration exports to '@backstage/connections/config' manually.
export {
  // @ts-expect-error: old export moved
  ConfiguredConnectionAuth,
  connectionTypes as unchanged,
} from '@backstage/connections';

void buildConnectionsFromConfig;
void connectionTypes;
void types;
