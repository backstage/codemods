import { CatalogApi } from '@backstage/catalog-client';

// The return value { output: ... } is from a callback inside the initializer,
// NOT a CatalogApi implementation. Section 3a/4b should NOT inject updateLocation.
const catalogClient: CatalogApi = actionsRegistry.register({
  handler: async () => {
    return {
      output: { ownedEntities: [] },
    };
  },
});
