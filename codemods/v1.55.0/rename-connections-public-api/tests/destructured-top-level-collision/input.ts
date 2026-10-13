import { ConnectionAuthValue, LookupStrategy, ConnectionTypeKey, isConnectionTypeKey } from '@backstage/connections';

const { ConnectionAuth } = providers;
const { strategy: ConnectionLookupStrategy } = providers;
const [ConnectionType] = connectionEntries;

type LegacyAuth = ConnectionAuthValue;
type LegacyLookup = LookupStrategy;
type LegacyType = ConnectionTypeKey;
const runGuard = isConnectionTypeKey;

function nestedScopeOnly() {
  const { isConnectionType } = helper;
  return isConnectionType;
}
