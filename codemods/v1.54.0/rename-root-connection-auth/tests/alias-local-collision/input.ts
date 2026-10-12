import type { RootConnectionAuth as ConfiguredConnectionAuth, RootConnectionAuth } from '@backstage/connections';
type ViaAlias = ConfiguredConnectionAuth<string>;
type ViaOld = RootConnectionAuth<number>;
