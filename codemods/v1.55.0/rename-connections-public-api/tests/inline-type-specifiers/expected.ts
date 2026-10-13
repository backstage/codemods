import {
  type ConnectionAuth,
  ConnectionType,
  type ConnectionLookupStrategy as LegacyLookup,
} from '@backstage/connections';
import type { ConnectionLookupStrategy } from '@backstage/connections';

export {
  type ConnectionAuth,
  ConnectionType,
  type ConnectionLookupStrategy as LegacyLookupExport,
} from '@backstage/connections';
export type { ConnectionLookupStrategy } from '@backstage/connections';

type A = ConnectionAuth;
type B = ConnectionType;
type C = LegacyLookup;
type D = ConnectionLookupStrategy;
