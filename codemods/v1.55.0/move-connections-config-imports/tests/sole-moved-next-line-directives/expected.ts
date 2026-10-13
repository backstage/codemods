// TODO(backstage-codemod): Review import from '@backstage/connections' with next-line diagnostic directive; move configuration exports to '@backstage/connections/config' manually.
// @ts-expect-error: old root export moved
import { buildConnectionsFromConfig } from '@backstage/connections';

// TODO(backstage-codemod): Review export from '@backstage/connections' with next-line diagnostic directive; move configuration exports to '@backstage/connections/config' manually.
// @ts-expect-error: old root re-export moved
export { ConfiguredConnectionAuth } from '@backstage/connections';

void buildConnectionsFromConfig;
