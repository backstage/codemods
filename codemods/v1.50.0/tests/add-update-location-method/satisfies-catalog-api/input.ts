import { CatalogApi } from '@backstage/catalog-client';

const fakeCatalog = {
  getEntities: async () => [],
  getEntityByRef: async () => undefined,
} satisfies CatalogApi;
