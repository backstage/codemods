import type { ConnectionTypeDefinition as ConnectionType, ConnectionType as ConnectionTypeKey } from '@backstage/connections';

type ConnectionTypeDefinition = { custom: true };

type Definition = ConnectionType;
type Key = ConnectionTypeKey;
