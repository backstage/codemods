import { type RootConnectionAuth as Auth, type RootConnectionAuth, type Other } from '@backstage/connections';
type A = Auth<string>;
type B = RootConnectionAuth<number>;
type C = Other;
