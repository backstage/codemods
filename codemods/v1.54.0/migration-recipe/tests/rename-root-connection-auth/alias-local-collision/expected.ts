import type { ConfiguredConnectionAuth as ConfiguredConnectionAuth } from '@backstage/connections';
type ViaAlias = ConfiguredConnectionAuth<string>;
type ViaOld = ConfiguredConnectionAuth<number>;
