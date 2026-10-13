import type { OtherType } from '@backstage/connections';
import type { ConfiguredConnection } from '@backstage/connections/config';
import { keepMe } from '@backstage/connections';
import { type ConfiguredConnectionAuth as Auth, buildConnectionsFromConfig as fromConfig } from '@backstage/connections/config';

type Example = ConfiguredConnection;
const auth: Auth | undefined = undefined;
const build = fromConfig;
void keepMe;
