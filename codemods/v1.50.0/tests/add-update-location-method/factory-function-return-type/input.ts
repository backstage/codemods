import { CatalogApi } from '@backstage/catalog-client';

function createCatalog(): CatalogApi {
  return {
    getEntities: async () => [],
    getEntityByRef: async () => undefined,
  };
}

const makeCatalog = (): CatalogApi => ({
  getEntities: async () => [],
});
