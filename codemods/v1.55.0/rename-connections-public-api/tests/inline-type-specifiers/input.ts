import { type ConnectionAuthValue, ConnectionTypeKey, type LookupStrategy as LegacyLookup } from '@backstage/connections';
import type { LookupStrategy } from '@backstage/connections';

export { type ConnectionAuthValue, ConnectionTypeKey, type LookupStrategy as LegacyLookupExport } from '@backstage/connections';
export type { LookupStrategy } from '@backstage/connections';

type A = ConnectionAuthValue;
type B = ConnectionTypeKey;
type C = LegacyLookup;
type D = LookupStrategy;
