import type { ConnectionTypeDefinition, ConnectionType } from '@backstage/connections';

const unrelated = {
  validate() {
    return true;
  },
};

const definition: ConnectionTypeDefinition = {
  matchAuth /* TODO(backstage-codemod): 'matchAuth' was removed from ConnectionTypeDefinition in @backstage/connections@0.4.0; migrate this behavior manually. */() {
    return true;
  },
};

type Key = ConnectionType;
