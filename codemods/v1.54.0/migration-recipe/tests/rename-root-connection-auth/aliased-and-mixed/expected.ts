import { type ConfiguredConnectionAuth as Auth, type ConfiguredConnectionAuth, type Other } from '@backstage/connections';
type A = Auth<string>;
type B = ConfiguredConnectionAuth<number>;
type C = Other;
