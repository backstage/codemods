import Connections from '@backstage/connections';
import type { ConfiguredConnectionAuth } from '@backstage/connections';
type A = ConfiguredConnectionAuth<string>;
type B = typeof Connections;
