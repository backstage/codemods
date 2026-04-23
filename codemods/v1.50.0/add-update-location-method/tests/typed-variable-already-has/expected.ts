import { CatalogApi } from '@backstage/catalog-client';

const fakeCatalog: CatalogApi = {
  getEntities: async () => [],
  updateLocation: async () => ({ type: 'url', target: 'https://example.com' } as any),
};
