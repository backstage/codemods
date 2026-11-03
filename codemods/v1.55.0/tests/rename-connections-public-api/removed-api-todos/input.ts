import type { ConnectionAuthMethodKey, ConnectionType } from '@backstage/connections';

const definition: ConnectionType = {
  matchAuth() {
    return true;
  },
  validate() {
    return true;
  },
};
