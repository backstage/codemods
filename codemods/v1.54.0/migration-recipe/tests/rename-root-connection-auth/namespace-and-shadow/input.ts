import type * as Connections from '@backstage/connections';
type Auth = Connections.RootConnectionAuth<MyMethod>;
type Nested = Other.RootConnectionAuth;
function use(Connections: { RootConnectionAuth: string }) {
  return Connections.RootConnectionAuth;
}
