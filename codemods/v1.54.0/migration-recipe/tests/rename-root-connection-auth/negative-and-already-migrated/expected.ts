import type { RootConnectionAuth as OtherAuth } from 'other';
import type { ConfiguredConnectionAuth } from '@backstage/connections';
import type * as NewConnections from '@backstage/connections/config';
type RootConnectionAuth<T> = { value: T };
type A = RootConnectionAuth<string>;
type B = OtherAuth<number>;
type C = ConfiguredConnectionAuth<boolean>;
type D = NewConnections.RootConnectionAuth;
