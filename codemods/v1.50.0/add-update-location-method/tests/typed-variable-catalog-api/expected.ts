import { CatalogApi } from '@backstage/catalog-client';

const fakeCatalog: CatalogApi = {
  getEntities: async () => [],
  getEntityByRef: async () => undefined,
  updateLocation: async () => { throw new Error('updateLocation not implemented'); },
};
