import Connections, { type RootConnectionAuth } from '@backstage/connections';
import type { ConfiguredConnectionAuth } from '@backstage/connections';
type A = RootConnectionAuth<string>;
type B = typeof Connections;
