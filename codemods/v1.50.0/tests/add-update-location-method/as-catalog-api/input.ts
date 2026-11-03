import { CatalogApi } from '@backstage/catalog-client';

const fakeCatalog = {
  getEntities: async () => [],
} as CatalogApi;
