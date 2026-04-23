import { CatalogApi } from '@backstage/catalog-client';

const fakeCatalog = {
  getEntities: async () => [],
  getEntityByRef: async () => undefined,
  updateLocation: async () => { throw new Error('updateLocation not implemented'); },
} satisfies CatalogApi;
