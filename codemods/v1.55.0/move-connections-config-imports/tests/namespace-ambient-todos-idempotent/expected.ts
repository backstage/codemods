declare module 'example-one' {
  import * as C from '@backstage/connections'; // keep first import
  // TODO(backstage-codemod): Review namespace import 'C' from '@backstage/connections' (mixed-members). Move configuration exports to '@backstage/connections/config' when provenance is clear.
  export type Connection = C.ConfiguredConnection | C.connectionTypes;
}

declare module 'example-two' {
  import * as C from '@backstage/connections'; // keep second import
  // TODO(backstage-codemod): Review namespace import 'C' from '@backstage/connections' (mixed-members). Move configuration exports to '@backstage/connections/config' when provenance is clear.
  export type Connection = C.ConfiguredConnection | C.connectionTypes;
}
