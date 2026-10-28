import type * as Connections from '@backstage/connections';
type Auth = Connections.ConfiguredConnectionAuth<string>;
namespace Local { export type RootConnectionAuth = string; }
type Other = Local.RootConnectionAuth;
