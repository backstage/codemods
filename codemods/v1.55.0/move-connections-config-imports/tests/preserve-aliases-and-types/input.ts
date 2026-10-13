import type {
  ConfiguredConnection,
  OtherType,
} from '@backstage/connections';
import {
  type ConfiguredConnectionAuth as Auth,
  buildConnectionsFromConfig as fromConfig,
  keepMe,
} from '@backstage/connections';

type Example = ConfiguredConnection;
const auth: Auth | undefined = undefined;
const build = fromConfig;
void keepMe;
