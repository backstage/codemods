import type {
  ConnectionAuth,
  ConnectionLookupStrategy,
  ConnectionType,
  ConnectionTypeDefinition,
  isConnectionType,
} from '@backstage/connections';

type Ready = ConnectionType;
const resolveAuth = (auth: ConnectionAuth): ConnectionAuth => auth;
