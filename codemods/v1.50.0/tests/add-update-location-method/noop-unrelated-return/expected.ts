import { CatalogService } from '@backstage/plugin-catalog-node';

// The function has a `catalog: CatalogService` parameter but returns
// an unrelated action-result object, NOT a CatalogService implementation.
// No section should inject updateLocation into the returned object.
export function createAction(catalog: CatalogService) {
  return {
    output: {
      ownedEntities: [],
    },
  };
}
