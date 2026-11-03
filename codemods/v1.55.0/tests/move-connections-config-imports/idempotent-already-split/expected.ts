import { keepMe } from '@backstage/connections';
import {
  buildConnectionsFromConfig,
  type ConfiguredConnection,
  type ConfiguredConnectionAuth as Auth,
} from '@backstage/connections/config';
export { keepExport } from '@backstage/connections';
export { type ConfiguredConnection as ConfigConnection } from '@backstage/connections/config';

type C = ConfiguredConnection;
const build = buildConnectionsFromConfig;
const auth = null as unknown as Auth;
void keepMe;
void keepExport;
void build;
void auth;
void (null as unknown as C);
