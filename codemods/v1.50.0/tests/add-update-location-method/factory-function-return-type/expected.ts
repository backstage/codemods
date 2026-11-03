import { CatalogApi } from '@backstage/catalog-client';

function createCatalog(): CatalogApi {
  return {
    getEntities: async () => [],
    getEntityByRef: async () => undefined,
    updateLocation: async () => { throw new Error('updateLocation not implemented'); },
  };
}

const makeCatalog = (): CatalogApi => ({
  getEntities: async () => [],
  updateLocation: async () => { throw new Error('updateLocation not implemented'); },
});
