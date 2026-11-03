import {
  ConnectionAuth as ConnectionAuthValue,
  ConnectionLookupStrategy as LookupStrategy,
  ConnectionType as ConnectionTypeKey,
  isConnectionType,
} from '@backstage/connections';

const { ConnectionAuth } = providers;
const { strategy: ConnectionLookupStrategy } = providers;
const [ConnectionType] = connectionEntries;

type LegacyAuth = ConnectionAuthValue;
type LegacyLookup = LookupStrategy;
type LegacyType = ConnectionTypeKey;
const runGuard = isConnectionType;

function nestedScopeOnly() {
  const { isConnectionType } = helper;
  return isConnectionType;
}
