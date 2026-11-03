import type * as Connections from '@backstage/connections';
type Auth = Connections.ConfiguredConnectionAuth<MyMethod>;
type Nested = Other.RootConnectionAuth;
function use(Connections: { RootConnectionAuth: string }) {
  return Connections.RootConnectionAuth;
}
