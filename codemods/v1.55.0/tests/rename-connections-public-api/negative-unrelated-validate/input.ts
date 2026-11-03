import type { ConnectionType, ConnectionTypeKey } from '@backstage/connections';

const unrelated = {
  validate() {
    return true;
  },
};

const definition: ConnectionType = {
  matchAuth() {
    return true;
  },
};

type Key = ConnectionTypeKey;
