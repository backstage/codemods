import { CatalogApi } from '@backstage/catalog-client';

const fakeCatalog = {
  getEntities: async () => [],
  updateLocation: async () => { throw new Error('updateLocation not implemented'); },
} as CatalogApi;
