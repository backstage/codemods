import {
  buildConnectionsFromConfig,
  ConfiguredConnection,
} from '@backstage/connections/config';
export { ConfiguredConnectionAuth } from '@backstage/connections/config';

const build = buildConnectionsFromConfig;
type C = ConfiguredConnection;
void build;
void (null as unknown as C);
