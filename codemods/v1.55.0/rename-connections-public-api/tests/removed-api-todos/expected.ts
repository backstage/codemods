import type { ConnectionAuthMethodKey /* TODO(backstage-codemod): ConnectionAuthMethodKey was removed in @backstage/connections@0.4.0; inline or replace this usage manually. */, ConnectionTypeDefinition } from '@backstage/connections';

const definition: ConnectionTypeDefinition = {
  matchAuth /* TODO(backstage-codemod): 'matchAuth' was removed from ConnectionTypeDefinition in @backstage/connections@0.4.0; migrate this behavior manually. */() {
    return true;
  },
  validate /* TODO(backstage-codemod): 'validate' was removed from ConnectionTypeDefinition in @backstage/connections@0.4.0; migrate this behavior manually. */() {
    return true;
  },
};
